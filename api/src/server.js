// HTTP API for the website's live agent demo. No framework: node:http only.
//
//   GET    /health                                   liveness
//   GET    /v1/status                                is the live demo available right now
//   GET    /v1/scenarios                             list scenarios
//   POST   /v1/sessions                              start a session { scenarioId, lang }
//   GET    /v1/sessions/:id/events                   Server-Sent Events stream (replays from Last-Event-ID)
//   POST   /v1/sessions/:id/approvals/:approvalId    { decision: "approve" | "reject" }
//   DELETE /v1/sessions/:id                          end a session early
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { SCENARIOS } from './scenarios.js';
import { SessionStore } from './sessions.js';
import { createProvider as defaultCreateProvider } from './providers/index.js';

const MAX_BODY = 4 * 1024;
const UUID = '[0-9a-f-]{36}';

function clientIp(req, cfg) {
  if (cfg.trustProxy) {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    // Oversized bodies are drained and discarded, then refused, so the client still gets a 413.
    req.on('data', (c) => {
      size += c.length;
      if (size <= MAX_BODY) chunks.push(c);
      else if (size > MAX_BODY * 16) req.destroy();
    });
    req.on('end', () => {
      if (size > MAX_BODY) return reject(Object.assign(new Error('body too large'), { status: 413 }));
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('invalid json'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

export function createServer({ cfg = loadConfig(), createProvider = defaultCreateProvider, log = console.error } = {}) {
  const store = new SessionStore(cfg, { createProvider, log });

  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const allowed = origin && cfg.allowedOrigins.includes(origin);
    const baseHeaders = {
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-store',
      ...(allowed ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
    };
    const send = (status, body, extra = {}) => {
      res.writeHead(status, { ...baseHeaders, 'content-type': 'application/json; charset=utf-8', ...extra });
      res.end(JSON.stringify(body));
    };
    const fail = (status, code, extra = {}) => send(status, { error: code }, extra);

    try {
      const url = new URL(req.url, 'http://local');
      const path = url.pathname.replace(/\/+$/, '') || '/';

      // Browsers send a preflight for JSON POSTs. Refuse origins that are not on the list.
      if (req.method === 'OPTIONS') {
        if (!allowed) return fail(403, 'origin_not_allowed');
        res.writeHead(204, {
          ...baseHeaders,
          'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
          'access-control-allow-headers': 'content-type, last-event-id',
          'access-control-max-age': '600',
        });
        return res.end();
      }
      if (origin && !allowed) return fail(403, 'origin_not_allowed');

      if (req.method === 'GET' && path === '/health') return send(200, { ok: true });

      if (req.method === 'GET' && path === '/v1/status') {
        return send(200, { ...store.limits.status(), provider: cfg.provider });
      }

      if (req.method === 'GET' && path === '/v1/scenarios') {
        return send(200, {
          scenarios: Object.entries(SCENARIOS).map(([id, s]) => ({ id, title: s.title, event: s.event })),
        });
      }

      if (req.method === 'POST' && path === '/v1/sessions') {
        const body = await readJson(req);
        const lang = body.lang === 'en' ? 'en' : 'th';
        const result = store.create({ scenarioId: String(body.scenarioId ?? ''), lang, ip: clientIp(req, cfg) });
        if (result.error) {
          const extra = result.error.retryAfter ? { 'retry-after': String(result.error.retryAfter) } : {};
          return fail(result.error.status, result.error.code, extra);
        }
        const { session, provider } = result;
        return send(201, {
          sessionId: session.id,
          scenarioId: session.scenarioId,
          provider: provider.name,
          model: provider.model,
          eventsUrl: `/v1/sessions/${session.id}/events`,
          expiresInSec: Math.round(cfg.sessionTtlMs / 1000),
        });
      }

      let m = path.match(new RegExp(`^/v1/sessions/(${UUID})/events$`));
      if (req.method === 'GET' && m) {
        const s = store.get(m[1]);
        if (!s) return fail(404, 'not_found');
        res.writeHead(200, {
          ...baseHeaders,
          'content-type': 'text/event-stream; charset=utf-8',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
        });
        const lastId = Number(req.headers['last-event-id'] ?? url.searchParams.get('after') ?? 0) || 0;
        const write = (ev) => {
          if (!ev) return res.end();
          res.write(`id: ${ev.seq}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev.data)}\n\n`);
        };
        res.write('retry: 2000\n\n');
        for (const ev of s.events) if (ev.seq > lastId) write(ev);
        if (s.done) return res.end();
        s.subscribers.add(write);
        const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
        req.on('close', () => {
          clearInterval(ping);
          s.subscribers.delete(write);
        });
        return;
      }

      m = path.match(new RegExp(`^/v1/sessions/(${UUID})/approvals/([A-Za-z0-9_-]{1,64})$`));
      if (req.method === 'POST' && m) {
        const body = await readJson(req);
        if (!['approve', 'reject'].includes(body.decision)) return fail(400, 'invalid_decision');
        const r = store.decide(m[1], m[2], body.decision);
        return r.status === 200 ? send(200, { ok: true, decision: body.decision }) : fail(r.status, r.code);
      }

      m = path.match(new RegExp(`^/v1/sessions/(${UUID})$`));
      if (req.method === 'DELETE' && m) {
        return store.close(m[1]) ? send(200, { ok: true }) : fail(404, 'not_found');
      }

      return fail(404, 'not_found');
    } catch (err) {
      if (err.status) return fail(err.status, err.message.replace(/\s/g, '_'));
      log(err);
      return fail(500, 'internal_error');
    }
  });

  server.on('close', () => store.stop());
  return { server, store };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cfg = loadConfig();
  const { server } = createServer({ cfg });
  server.listen(cfg.port, () => {
    console.log(`phli demo api on :${cfg.port} provider=${cfg.provider} enabled=${cfg.enabled}`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
