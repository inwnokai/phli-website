import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, readEvents } from './helpers.js';
import { SCENARIO_IDS } from '../src/scenarios.js';

for (const scenarioId of SCENARIO_IDS) {
  test(`${scenarioId}: runs, waits for a person, and creates the action only after approval`, async (t) => {
    const srv = await startServer();
    t.after(srv.stop);
    const a = api(srv.base);

    const res = await a.post('/v1/sessions', { scenarioId, lang: 'en' });
    assert.equal(res.status, 201);
    const { sessionId, provider } = await res.json();
    assert.equal(provider, 'fake');

    let createdBeforeApproval = null;
    const events = await readEvents(srv.base, sessionId, async (ev) => {
      if (ev.type === 'approval.required') {
        const world = srv.store.get(sessionId).world;
        createdBeforeApproval = world.workOrders.length + world.requests.length;
        const r = await a.post(`/v1/sessions/${sessionId}/approvals/${ev.data.id}`, { decision: 'approve' });
        assert.equal(r.status, 200);
      }
    });

    const types = events.map((e) => e.type);
    assert.equal(types[0], 'session.started');
    assert.ok(types.includes('tool.call'));
    assert.ok(types.includes('approval.required'));
    assert.equal(createdBeforeApproval, 0, 'nothing is created before a person approves');
    const resolved = events.find((e) => e.type === 'approval.resolved');
    assert.equal(resolved.data.decision, 'approve');
    const lastState = events.filter((e) => e.type === 'factory.state').at(-1).data;
    const actions = lastState.machines.flatMap((m) => m.workOrders).length + lastState.requests.length;
    assert.equal(actions, 1);
    assert.equal(events.at(-1).type, 'session.ended');
    assert.equal(events.at(-1).data.reason, 'done');
  });
}

test('reject creates nothing and the agent finishes', async (t) => {
  const srv = await startServer();
  t.after(srv.stop);
  const a = api(srv.base);
  const { sessionId } = await (await a.post('/v1/sessions', { scenarioId: 'cnc-spindle-vibration', lang: 'th' })).json();
  const events = await readEvents(srv.base, sessionId, async (ev) => {
    if (ev.type === 'approval.required') await a.post(`/v1/sessions/${sessionId}/approvals/${ev.data.id}`, { decision: 'reject' });
  });
  assert.equal(srv.store.get(sessionId).world.workOrders.length, 0);
  assert.equal(events.at(-1).data.reason, 'done');
  // Thai session gets Thai messages from the fake model.
  assert.match(events.find((e) => e.type === 'agent.message').data.text, /[฀-๿]/);
});

test('an unanswered approval expires and creates nothing', async (t) => {
  const srv = await startServer({ approvalTimeoutMs: 50 });
  t.after(srv.stop);
  const { sessionId } = await (await api(srv.base).post('/v1/sessions', { scenarioId: 'saw-chipping', lang: 'en' })).json();
  const events = await readEvents(srv.base, sessionId);
  assert.equal(events.find((e) => e.type === 'approval.resolved').data.decision, 'expired');
  assert.equal(srv.store.get(sessionId).world.workOrders.length, 0);
});

test('a reconnecting client gets the events it missed', async (t) => {
  const srv = await startServer({ approvalTimeoutMs: 30 });
  t.after(srv.stop);
  const { sessionId } = await (await api(srv.base).post('/v1/sessions', { scenarioId: 'saw-chipping', lang: 'en' })).json();
  const all = await readEvents(srv.base, sessionId);
  const res = await fetch(`${srv.base}/v1/sessions/${sessionId}/events`, { headers: { 'last-event-id': '3' } });
  const text = await res.text();
  assert.ok(!text.includes('id: 3\n'));
  assert.ok(text.includes(`id: ${all.length}\n`));
});

test('per-IP rate limit returns 429 with Retry-After', async (t) => {
  const srv = await startServer({ sessionsPerIpPerHour: 2, approvalTimeoutMs: 20 });
  t.after(srv.stop);
  const a = api(srv.base);
  for (let i = 0; i < 2; i++) assert.equal((await a.post('/v1/sessions', { scenarioId: 'saw-chipping' })).status, 201);
  const r = await a.post('/v1/sessions', { scenarioId: 'saw-chipping' });
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get('retry-after')) > 0);
});

test('kill switch and daily budget turn the live demo off', async (t) => {
  const off = await startServer({ enabled: false });
  t.after(off.stop);
  assert.equal((await api(off.base).post('/v1/sessions', { scenarioId: 'saw-chipping' })).status, 503);
  assert.deepEqual(await (await api(off.base).get('/v1/status')).json(), { enabled: false, available: false, provider: 'fake' });

  const broke = await startServer({ dailyBudgetUsd: 1 });
  t.after(broke.stop);
  broke.store.limits.addCost(1.01);
  const r = await api(broke.base).post('/v1/sessions', { scenarioId: 'saw-chipping' });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error, 'daily_limit');
});

test('concurrent session cap', async (t) => {
  const srv = await startServer({ maxConcurrentSessions: 1, sessionsPerIpPerHour: 10 });
  t.after(srv.stop);
  const a = api(srv.base);
  assert.equal((await a.post('/v1/sessions', { scenarioId: 'saw-chipping' })).status, 201);
  assert.equal((await a.post('/v1/sessions', { scenarioId: 'saw-chipping' })).status, 503);
});

test('origins not on the allow list are refused', async (t) => {
  const srv = await startServer();
  t.after(srv.stop);
  const r = await fetch(`${srv.base}/v1/sessions`, {
    method: 'POST',
    headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
    body: JSON.stringify({ scenarioId: 'saw-chipping' }),
  });
  assert.equal(r.status, 403);
  const pre = await fetch(`${srv.base}/v1/sessions`, { method: 'OPTIONS', headers: { origin: 'http://localhost:4321' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'http://localhost:4321');
});

test('input validation', async (t) => {
  const srv = await startServer();
  t.after(srv.stop);
  const a = api(srv.base);
  assert.equal((await a.post('/v1/sessions', { scenarioId: 'nope' })).status, 400);
  const big = await a.post('/v1/sessions', { scenarioId: 'x'.repeat(10_000) });
  assert.equal(big.status, 413);
  const bad = await fetch(`${srv.base}/v1/sessions`, { method: 'POST', headers: { origin: 'http://localhost:4321' }, body: '{' });
  assert.equal(bad.status, 400);
  const { sessionId } = await (await a.post('/v1/sessions', { scenarioId: 'saw-chipping' })).json();
  assert.equal((await a.post(`/v1/sessions/${sessionId}/approvals/apr_x`, { decision: 'maybe' })).status, 400);
  assert.equal((await a.post(`/v1/sessions/${sessionId}/approvals/apr_x`, { decision: 'approve' })).status, 409);
  assert.equal((await a.del(`/v1/sessions/${sessionId}`)).status, 200);
  assert.equal((await a.get(`/v1/sessions/${sessionId}/events`)).status, 404);
});

test('scenarios and health', async (t) => {
  const srv = await startServer();
  t.after(srv.stop);
  const a = api(srv.base);
  assert.equal((await a.get('/health')).status, 200);
  const { scenarios } = await (await a.get('/v1/scenarios')).json();
  assert.equal(scenarios.length, 4);
  for (const s of scenarios) assert.ok(s.title.th && s.title.en);
});
