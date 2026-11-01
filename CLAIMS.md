# Claims register / ทะเบียนข้อกล่าวอ้าง

Every product statement on the site must be listed here with evidence from the main repo
(`inwnokai/factory-os-thailand-sme`, audit of commit `b4394fb`, 2026-10-31).
`npm run check:claims` blocks phrases we cannot back up. Owner sign-off is required before launch.

Status labels on the site:
- **Built / มีในระบบแล้ว**: code path exists (route + UI). Tests exist but were not run in the audit. Not proven at a customer.
- **In pilot / ทดลองในโรงงาน**: listed in pilot tickets `TICK-PILOT-001..007`. Pilot not yet run.
- **In development / กำลังพัฒนา**: not in the code, or a stub.

| Claim on site | Status | Evidence (main repo) |
|---|---|---|
| Maintenance work orders: request, assign, close, per-machine record | Built | `backend/src/routes/maintenance.ts:66,82`; `work_order_events` table |
| Inventory items and stock adjustments, role-based | Built | `backend/src/routes/inventory.ts:38,78` |
| Production scheduling on a Gantt view | Built | `backend/src/routes/mrp.ts:222,249`; `ProductionGanttScheduler.tsx` |
| Quality: NCR and travelers | Built | `backend/src/routes/qms.ts` |
| Label and traveler printing | Built | `backend/src/routes/print.ts` |
| Critical actions wait for an authorised person | Built | `platform/safety-kernel/approval-gate.ts:33-59`; migration `0034` |
| AI assistant reads machine/stock/quality data and drafts work orders; switched on per deployment | Built (off by default) | MCP tools `mcp-tool-registry.ts:129,250,288`; flags `feature-flags.ts:31,34` |
| AI cannot start, stop, reset or change machine settings; cannot trigger/reset E-stop | Built | No such tool in the 16-tool registry; E-stop routes are admin/safety_officer only |
| AI cannot approve its own requests | Built | approve routes deny AI actors (`/api/agents/*/approve`) |
| Access by role; unknown roles get least access | Built | `backend/src/auth/access-tiers.ts:12-26` |
| Approval requests and decisions are stored | Built | `0034_durable_hitl_approval_requests.sql` |
| Supports local model servers (Ollama, llama.cpp) with open models like Qwen | Built (off by default) | `llm-providers.ts:728,837`; `llm.config.ts:61,63` |
| Shop-floor terminal: job queue, events, incidents | In pilot | `routes/mes.ts:104,333,378`; pilot tickets |
| Plan vs actual per shift | In development | No shift table or route |
| Machine downtime by reason | In development | No reason codes; downtime is a work-order proxy |
| OEE per machine | In development | Fixed 2.0-min ideal cycle; station OEE is null |
| LINE alerts | In development | `HERMES_LINE_ENABLED` false; status reply is fixed text |
| Demo tool names (`production.get_machine_status`, `maintenance.get_open_work_orders`, `knowledge.search_sop`) | Real tool names, simulated run | `mcp-tool-registry.ts:129,174,320` |

## Must not say (enforced by `scripts/check-claims.mjs`)
Customer OEE or % results · ROI or payback · model speed (tokens/sec) · air-gapped or 100% on-prem ·
PDPA compliant · ISO/ISA-95 certified · PLC, OPC UA or Modbus integration · autonomous agents ·
real-time · any customer or demo company name · testimonials · third-party product names · personal data.

## Before launch
- [ ] Owner reviews and signs this file
- [ ] Run the main repo test suite on the audited commit and record the result
- [ ] Re-check statuses after the pilot finishes
