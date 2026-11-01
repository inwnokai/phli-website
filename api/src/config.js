// All settings come from environment variables. Defaults are safe for a public demo.
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));

export function loadConfig(env = process.env) {
  return {
    port: num(env.PORT, 8787),
    // Kill switch. When false, POST /v1/sessions returns 503 and the site falls back to Replay.
    enabled: bool(env.DEMO_ENABLED, true),
    allowedOrigins: (env.ALLOWED_ORIGINS ?? 'http://localhost:4321').split(',').map((s) => s.trim()).filter(Boolean),
    trustProxy: bool(env.TRUST_PROXY, false),

    // Provider: fake | openai | anthropic
    provider: env.LLM_PROVIDER ?? 'fake',
    // OpenAI-compatible servers: Ollama (http://localhost:11434/v1), llama.cpp server, vLLM, LM Studio.
    openaiBaseUrl: env.OPENAI_BASE_URL ?? 'http://localhost:11434/v1',
    openaiApiKey: env.OPENAI_API_KEY ?? '',
    openaiModel: env.OPENAI_MODEL ?? 'qwen3:8b',
    // Claude
    anthropicModel: env.ANTHROPIC_MODEL ?? 'claude-opus-5-5',
    anthropicEffort: env.ANTHROPIC_EFFORT ?? 'medium',

    // Limits
    maxToolCalls: num(env.MAX_TOOL_CALLS, 15),
    maxModelTurns: num(env.MAX_MODEL_TURNS, 12),
    sessionsPerIpPerHour: num(env.SESSIONS_PER_IP_PER_HOUR, 3),
    maxConcurrentSessions: num(env.MAX_CONCURRENT_SESSIONS, 5),
    dailySessionCap: num(env.DAILY_SESSION_CAP, 300),
    dailyBudgetUsd: num(env.DAILY_BUDGET_USD, 5),
    sessionTtlMs: num(env.SESSION_TTL_MS, 15 * 60_000),
    approvalTimeoutMs: num(env.APPROVAL_TIMEOUT_MS, 5 * 60_000),
    modelTimeoutMs: num(env.MODEL_TIMEOUT_MS, 60_000),
    fakeDelayMs: num(env.FAKE_DELAY_MS, 600),
  };
}
