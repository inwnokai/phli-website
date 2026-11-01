import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAgent } from '../src/agent.js';
import { TOOLS } from '../src/tools.js';
import { SCENARIOS } from '../src/scenarios.js';
import { loadConfig } from '../src/config.js';

const cfg = { ...loadConfig({}), fakeDelayMs: 0 };

/** A provider that plays back a fixed list of model turns. */
function scripted(turns) {
  return {
    info: { name: 'test', model: 'test' },
    createConversation() {
      let i = 0;
      return {
        results: [],
        async next() {
          return turns[i++] ?? { text: 'done', toolCalls: [], stop: 'end' };
        },
        addToolResults(r) {
          this.results.push(...r);
        },
      };
    },
  };
}

function session(decision = 'approve') {
  const events = [];
  const scenario = SCENARIOS['cnc-spindle-vibration'];
  return {
    id: 't',
    scenarioId: 'cnc-spindle-vibration',
    scenario,
    lang: 'en',
    world: scenario.world(),
    events,
    emit: (type, data) => events.push({ type, data }),
    waitForDecision: async () => decision,
  };
}
const limits = { cost: 0, addCost(u) { this.cost += u; } };
const call = (name, input, id = name) => ({ text: '', toolCalls: [{ id, name, input }], stop: 'tool_use', costUsd: 0.01 });

test('no tool can control a machine', () => {
  const banned = /stop|start|reset|estop|e_stop|setpoint|override|isolate|calibrate|shutdown/i;
  for (const t of TOOLS) assert.doesNotMatch(t.name, banned, t.name);
  assert.deepEqual(TOOLS.filter((t) => t.kind === 'write').map((t) => t.name).sort(), ['inventory_request_reorder', 'maintenance_create_work_order']);
});

test('a made-up machine-control tool is refused, not run', async () => {
  const s = session();
  await runAgent(s, scripted([call('workforce_safety_machine_stop', { machineId: 'CNC-01' })]), cfg, limits);
  const result = s.events.find((e) => e.type === 'tool.result');
  assert.equal(result.data.ok, false);
  assert.match(result.data.output.error, /Unknown tool/);
  assert.equal(s.world.machines['CNC-01'].state, 'warning');
});

test('low priority still needs a person: the server sets the policy, not the model', async () => {
  const s = session('reject');
  await runAgent(s, scripted([call('maintenance_create_work_order', { machineId: 'CNC-01', title: 'x', priority: 'low', description: 'y' })]), cfg, limits);
  assert.ok(s.events.some((e) => e.type === 'approval.required'));
  assert.equal(s.world.workOrders.length, 0);
});

test('only one action per session', async () => {
  const s = session('approve');
  const wo = { machineId: 'CNC-01', title: 'x', priority: 'high', description: 'y' };
  await runAgent(s, scripted([call('maintenance_create_work_order', wo, 'a'), call('maintenance_create_work_order', wo, 'b')]), cfg, limits);
  assert.equal(s.world.workOrders.length, 1);
  assert.equal(s.events.filter((e) => e.type === 'approval.required').length, 1);
});

test('invalid tool input is returned to the model as an error', async () => {
  const s = session();
  await runAgent(s, scripted([call('maintenance_create_work_order', { machineId: 'CNC-01', priority: 'urgent!!' })]), cfg, limits);
  const r = s.events.find((e) => e.type === 'tool.result');
  assert.equal(r.data.ok, false);
  assert.ok(!s.events.some((e) => e.type === 'approval.required'));
});

test('tool call limit ends the session', async () => {
  const s = session();
  const many = Array.from({ length: 30 }, (_, i) => call('quality_get_summary', {}, `q${i}`));
  await runAgent(s, scripted(many), { ...cfg, maxToolCalls: 5, maxModelTurns: 50 }, limits);
  assert.equal(s.events.filter((e) => e.type === 'tool.call').length, 5);
  assert.equal(s.events.at(-1).data.reason, 'tool_limit');
});

test('model turn limit ends the session', async () => {
  const s = session();
  const many = Array.from({ length: 30 }, (_, i) => call('quality_get_summary', {}, `q${i}`));
  await runAgent(s, scripted(many), { ...cfg, maxToolCalls: 100, maxModelTurns: 3 }, limits);
  assert.equal(s.events.at(-1).data.reason, 'turn_limit');
});

test('backend errors end the session without leaking details', async () => {
  const s = session();
  const broken = { info: { name: 'x', model: 'x' }, createConversation: () => ({ next: async () => { throw new Error('ECONNREFUSED 10.0.0.5:11434'); }, addToolResults() {} }) };
  await runAgent(s, broken, cfg, limits);
  const err = s.events.find((e) => e.type === 'agent.error');
  assert.doesNotMatch(err.data.message, /10\.0\.0\.5/);
  assert.equal(s.events.at(-1).data.reason, 'error');
});

test('refusal ends the session', async () => {
  const s = session();
  await runAgent(s, scripted([{ text: '', toolCalls: [], stop: 'refusal' }]), cfg, limits);
  assert.equal(s.events.at(-1).data.reason, 'refusal');
});

test('cost is added to the daily budget', async () => {
  const l = { cost: 0, addCost(u) { this.cost += u; } };
  const s = session();
  await runAgent(s, scripted([call('quality_get_summary', {}), { text: 'ok', toolCalls: [], stop: 'end', costUsd: 0.02 }]), cfg, l);
  assert.ok(Math.abs(l.cost - 0.03) < 1e-9);
});
