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

Market figures and pilot results are switched on in `src/config/site.ts`, only with sources and consent.

## Layout
- `src/i18n/th.ts`, `src/i18n/en.ts`: all copy. Thai is primary.
- `src/views/*`: one view per page, rendered for both languages by `src/pages/**`.
- `src/components/FactoryReplay.astro`: agent demo (Replay mode). No model calls.
- `CLAIMS.md`: what we may say, with evidence. `scripts/check-claims.mjs` enforces it.
- `docs/DECISIONS.md`: decisions so far. `docs/MAIN_REPO_AUDIT_PROMPT.md`: audit prompt.

## Not built yet
- Live sandbox agent API (separate Docker service, swappable LLM backends)
- Low-poly 3D floor view (the replay is built so the renderer can be swapped)
