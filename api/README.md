# Phli demo API

Sandboxed agent demo for the website. A model investigates a **simulated** furniture factory with
read tools, then proposes one action that a website visitor approves or rejects. Nothing here
connects to a real factory or to the Phli product database.

## Run
```bash
npm install
npm test                       # 28 tests, fake model, no network
LLM_PROVIDER=fake npm start    # http://localhost:8787
```
Point the site at it with `PUBLIC_DEMO_API_URL=http://localhost:8787` and add the site origin to
`ALLOWED_ORIGINS`. All settings are in `.env.example`.

## Model backends (`LLM_PROVIDER`)
| Value | Backend | Notes |
|---|---|---|
| `fake` | Scripted replay | Default. CI and zero-cost demo. |
| `openai` | Any OpenAI-compatible server | Ollama, llama.cpp server, vLLM, LM Studio. Local models such as Qwen or Gemma. Model must support tool calling. |
| `anthropic` | Claude via `@anthropic-ai/sdk` | Default `claude-opus-5-5`; set `ANTHROPIC_MODEL=claude-sonnet-5-5` or `claude-haiku-5-5` to cut cost. Uses server-side refusal fallback where supported. |

Never point `OPENAI_BASE_URL` at a model server inside a factory network. Run demo models on a
separate machine or a cloud GPU.

## Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness |
| GET | `/v1/status` | `{ enabled, available }`; the site falls back to Replay when unavailable |
| GET | `/v1/scenarios` | 4 scenarios with Thai and English titles |
| POST | `/v1/sessions` | `{ scenarioId, lang }` → `{ sessionId, eventsUrl, model }` |
| GET | `/v1/sessions/:id/events` | Server-Sent Events; replays missed events via `Last-Event-ID` |
| POST | `/v1/sessions/:id/approvals/:approvalId` | `{ decision: "approve" \| "reject" }` |
| DELETE | `/v1/sessions/:id` | End a session |

Events: `session.started`, `factory.state`, `factory.event`, `agent.message`, `tool.call`,
`tool.result`, `approval.required`, `approval.resolved`, `agent.error`, `session.ended`.

## Safety rules (enforced in code, covered by tests)
- No tool can start, stop, reset or change settings on a machine.
- Write tools never run directly. The server turns each into an approval request; the model's
  arguments (e.g. priority) cannot skip it. One action per session. Unanswered requests expire.
- Visitors cannot type free text: they pick a scenario and approve or reject.
- Limits: 3 sessions per IP per hour, 5 concurrent, 15 tool calls, 12 model turns, 15-minute
  sessions, daily Claude budget (default $5) and daily session cap. `DEMO_ENABLED=false` is the
  kill switch.
- Nothing about visitors is stored except an hourly counter keyed by a hashed IP, in memory.
- SOP search is keyword (BM25), not neural embeddings.

## Deploy
`Dockerfile` runs on Fly.io, Railway, Render or a VPS. One instance only (sessions are in memory).
Set `TRUST_PROXY=true` behind a proxy so rate limits use the real client IP.
