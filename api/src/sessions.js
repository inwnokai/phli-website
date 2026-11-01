// In-memory sessions and limits. One process, no database: the demo stores nothing about visitors
// except a hashed IP counter that resets every hour.
import { randomUUID, createHash } from 'node:crypto';
import { SCENARIOS } from './scenarios.js';
import { runAgent } from './agent.js';

const HOUR = 3_600_000;
const today = () => new Date().toISOString().slice(0, 10);

export class Limits {
  constructor(cfg) {
    this.cfg = cfg;
    this.ipHits = new Map(); // hashed ip -> timestamps
    this.day = today();
    this.daySessions = 0;
    this.dayCostUsd = 0;
  }
  rollDay() {
    if (this.day !== today()) {
      this.day = today();
      this.daySessions = 0;
      this.dayCostUsd = 0;
    }
  }
  addCost(usd) {
    this.rollDay();
    this.dayCostUsd += usd;
  }
  budgetLeft() {
    this.rollDay();
    return this.dayCostUsd < this.cfg.dailyBudgetUsd && this.daySessions < this.cfg.dailySessionCap;
  }
  /** Returns null if allowed, or { code, status, retryAfter? }. Records the hit when allowed. */
  check(ip, active) {
    this.rollDay();
    if (!this.cfg.enabled) return { code: 'demo_disabled', status: 503 };
    if (!this.budgetLeft()) return { code: 'daily_limit', status: 503 };
    if (active >= this.cfg.maxConcurrentSessions) return { code: 'busy', status: 503, retryAfter: 30 };
    const key = createHash('sha256').update(String(ip)).digest('hex').slice(0, 16);
    const now = Date.now();
    const hits = (this.ipHits.get(key) ?? []).filter((t) => now - t < HOUR);
    if (hits.length >= this.cfg.sessionsPerIpPerHour) {
      this.ipHits.set(key, hits);
      return { code: 'rate_limited', status: 429, retryAfter: Math.ceil((HOUR - (now - hits[0])) / 1000) };
    }
    hits.push(now);
    this.ipHits.set(key, hits);
    this.daySessions++;
    return null;
  }
  status() {
    this.rollDay();
    return { enabled: this.cfg.enabled, available: this.cfg.enabled && this.budgetLeft() };
  }
}

export class SessionStore {
  constructor(cfg, { createProvider, log = () => {} }) {
    this.cfg = cfg;
    this.createProvider = createProvider;
    this.log = log;
    this.sessions = new Map();
    this.limits = new Limits(cfg);
    this.sweeper = setInterval(() => this.sweep(), 30_000);
    this.sweeper.unref();
  }

  get active() {
    return [...this.sessions.values()].filter((s) => !s.done).length;
  }

  create({ scenarioId, lang, ip }) {
    const scenario = SCENARIOS[scenarioId];
    if (!scenario) return { error: { code: 'unknown_scenario', status: 400 } };
    const denied = this.limits.check(ip, this.active);
    if (denied) return { error: denied };

    const id = randomUUID();
    const s = {
      id,
      scenarioId,
      scenario,
      lang,
      world: scenario.world(),
      createdAt: Date.now(),
      events: [],
      subscribers: new Set(),
      pending: null,
      done: false,
      closed: false,
      costUsd: 0,
      log: (e) => this.log(`[session ${id}]`, e?.message ?? e),
    };
    s.emit = (type, data) => {
      const ev = { seq: s.events.length + 1, type, data, at: new Date().toISOString() };
      s.events.push(ev);
      for (const fn of s.subscribers) fn(ev);
      if (type === 'session.ended') {
        s.done = true;
        for (const fn of s.subscribers) fn(null);
      }
    };
    s.waitForDecision = (approval) =>
      new Promise((resolve) => {
        const timer = setTimeout(() => {
          s.pending = null;
          resolve('expired');
        }, this.cfg.approvalTimeoutMs);
        timer.unref?.();
        s.pending = {
          approval,
          resolve: (d) => {
            clearTimeout(timer);
            s.pending = null;
            resolve(d);
          },
        };
      });

    this.sessions.set(id, s);
    const provider = this.createProvider(this.cfg, { script: scenario.script, lang });
    runAgent(s, provider, this.cfg, this.limits).catch((err) => {
      s.log(err);
      if (!s.done) s.emit('session.ended', { reason: 'error' });
    });
    return { session: s, provider: provider.info };
  }

  get(id) {
    return this.sessions.get(id);
  }

  decide(id, approvalId, decision) {
    const s = this.sessions.get(id);
    if (!s) return { status: 404, code: 'not_found' };
    if (!s.pending || s.pending.approval.id !== approvalId) return { status: 409, code: 'no_pending_approval' };
    s.pending.resolve(decision);
    return { status: 200 };
  }

  close(id, reason = 'closed') {
    const s = this.sessions.get(id);
    if (!s) return false;
    s.closed = true;
    s.pending?.resolve('reject');
    if (!s.done) s.emit('session.ended', { reason });
    this.sessions.delete(id);
    return true;
  }

  sweep() {
    const now = Date.now();
    for (const s of this.sessions.values()) {
      if (now - s.createdAt > this.cfg.sessionTtlMs) this.close(s.id, 'expired');
    }
  }

  stop() {
    clearInterval(this.sweeper);
    for (const id of [...this.sessions.keys()]) this.close(id, 'shutdown');
  }
}
