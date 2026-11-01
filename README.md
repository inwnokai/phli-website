# Phli Website / เว็บไซต์ Phli

Marketing site for Phli. Thai at `/`, English at `/en/`. Astro static build, hosted on Vercel.

## Run
```bash
npm install
npm run dev      # http://localhost:4321
npm test         # build + claims check + i18n check
```

## Settings (Vercel env vars)
| Variable | Purpose | If unset |
|---|---|---|
| `PUBLIC_SITE_URL` | Final `.com` domain | placeholder domain |
| `PUBLIC_LINE_OA_ID` | LINE OA ID, e.g. `@phli` | contact buttons show "being set up" |
| `PUBLIC_CONTACT_EMAIL` | Lead email | same |
| `PUBLIC_PRICE_PER_LINE_THB` | Starting price per line per month | price hidden |
| `PUBLIC_DEMO_API_URL` | Demo API base URL (see `api/README.md`) | only the recorded run is shown |

Market figures and pilot results are switched on in `src/config/site.ts`, only with sources and consent.

## Layout
- `src/i18n/th.ts`, `src/i18n/en.ts`: all copy. Thai is primary.
- `src/views/*`: one view per page, rendered for both languages by `src/pages/**`.
- `src/components/FactoryReplay.astro`: agent demo (Replay mode). No model calls.
- `CLAIMS.md`: what we may say, with evidence. `scripts/check-claims.mjs` enforces it.
- `docs/DECISIONS.md`: decisions so far. `docs/MAIN_REPO_AUDIT_PROMPT.md`: audit prompt.

## Demo API
`api/` is a separate Docker service for the live agent demo, with swappable model backends
(scripted, local OpenAI-compatible such as Ollama or llama.cpp, or Claude). See `api/README.md`.

## Not built yet
- Low-poly 3D floor view (`src/components/FloorSvg.astro` is the piece to swap)
