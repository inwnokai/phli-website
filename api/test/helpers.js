import { createServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';

export const ORIGIN = 'http://localhost:4321';

export async function startServer(overrides = {}, opts = {}) {
  const cfg = { ...loadConfig({}), fakeDelayMs: 0, provider: 'fake', ...overrides };
  const { server, store } = createServer({ cfg, log: () => {}, ...opts });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const stop = () =>
    new Promise((r) => {
      server.closeAllConnections?.();
      server.close(r);
    });
  return { base, server, store, cfg, stop };
}

export const api = (base) => ({
  get: (path, headers = {}) => fetch(base + path, { headers: { origin: ORIGIN, ...headers } }),
  post: (path, body, headers = {}) =>
    fetch(base + path, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }),
  del: (path) => fetch(base + path, { method: 'DELETE', headers: { origin: ORIGIN } }),
});

/** Read an SSE stream and call onEvent for each event. Resolves with all events when the stream ends. */
export async function readEvents(base, sessionId, onEvent = () => {}) {
  const res = await fetch(`${base}/v1/sessions/${sessionId}/events`, { headers: { origin: ORIGIN } });
  const events = [];
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const type = block.match(/^event: (.+)$/m)?.[1];
      const data = block.match(/^data: (.+)$/m)?.[1];
      if (!type) continue;
      const ev = { type, data: JSON.parse(data) };
      events.push(ev);
      await onEvent(ev);
    }
  }
  return events;
}
