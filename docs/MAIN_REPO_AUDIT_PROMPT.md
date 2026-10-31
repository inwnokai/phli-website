# Prompt: audit the main Phli repo for the website

Paste this into a Claude Code session opened on the main Phli product repo.
Paste the answer back into the website session (or save it as `docs/PRODUCT_FACTS.md` here).

---

Read-only audit. Do not change, commit or push anything.

I am building a public marketing website and a demo API for this product in a separate repo.
The site may only claim what this code actually does. Audit this repo and report facts, with a
file path and line number as evidence for each one. Write "not found" where you find nothing,
and never guess.

1. **Features that work today.** For each user-facing feature (plan vs actual per shift, OEE,
   downtime, alerts, LINE notifications, reports, AI agent, etc.): status (works / partial /
   stub / missing), evidence, and whether tests cover it.
2. **AI and agent layer.** Which models and providers are called (Claude, Gemma, Qwen, Ollama,
   vLLM, OpenAI-compatible)? Where is the client? Is there RAG (what is indexed, which vector
   store)? List every tool the agent can call, with its arguments and whether it needs human
   approval. Flag any tool that touches machines or safety (E-stop, reset, start, setpoints).
3. **API surface.** List the HTTP/WebSocket endpoints: method, path, auth, what they return.
   Which ones could a public sandbox demo safely reuse against fake data, and which must never
   be exposed?
4. **Data model.** The main entities (factory, line, machine, shift, order, downtime reason...)
   and where they are defined. Is there seed or sample data I can reuse for a simulated
   furniture factory?
5. **Factory visualisation.** Any existing 2D/3D layout, SVG, Three.js or floor plan code?
6. **Integrations.** PLC/OPC UA/Modbus, LINE OA, email, ERP, Google Sheets: real or planned?
7. **Security and privacy.** Auth method, multi-tenant isolation, secrets handling, PDPA-related
   code (consent, retention, deletion). Anything that blocks a public demo.
8. **Deployment.** How it runs (Docker, on-prem box, cloud), hardware needs for the local LLM
   (GPU, RAM, model size), and the env vars the demo would need.
9. **Branding.** Product name spellings in Thai and English, logo files, colours, fonts.
10. **Claim matrix.** If a claim matrix, CLAIMS file or business research (30 Oct) exists in the
    repo, give its path and copy the "can say today / in pilot / cannot say yet" lists.

Output: one Markdown document with these 10 headings, a short table per section, and a final
"Top 5 risks for the website" list. Keep it under 2,500 words.
