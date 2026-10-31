# Decisions / บันทึกการตัดสินใจ

| # | Question / คำถาม | Answer / คำตอบ | Date |
|---|---|---|---|
| 1 | Who is the site for? / ขายให้ใคร | Both. Home page talks to factories; a separate `/investors` page for buyers and investors. / ทั้งโรงงานและนักลงทุน | 2026-10-31 |
| 2 | Show prices? / แสดงราคา | Yes: a starting price per line. / แสดงราคาเริ่มต้นต่อไลน์ | 2026-10-31 |
| 3 | Domain / โดเมน | No Thai company yet, so use `.com`. Move to `.co.th` later. | 2026-10-31 |
| 4 | Demo model / โมเดล demo | Local LLM (Gemma 4, Qwen 3.5) instead of a paid API. Ideally reuse the same API the factory runs. RAG, tool calling, agentic factory tasks, with a 3D factory view. | 2026-10-31 |
| 5 | Where the LLM runs / ที่รัน LLM | Swappable backends behind one OpenAI-compatible interface (local Ollama/vLLM, cloud GPU, Claude), chosen by env. The public site never calls the real factory network. / สลับ backend ได้ด้วย env ห้ามต่อเครือข่ายโรงงานจริง | 2026-10-31 |
| 6 | Price per line / ราคาต่อไลน์ | Unknown. Use a config variable; the price block stays hidden until a real number is set. / ใส่ตัวแปร ซ่อนไว้จนกว่าจะมีตัวเลขจริง | 2026-10-31 |
| 7 | Factory view / ภาพโรงงาน | 2D first, plus low-poly 3D, built so it can be upgraded later. / 2D และ 3D low-poly อัปเกรดได้ | 2026-10-31 |
| 8 | `/investors` content | Market size from 30 Oct research (with sources), architecture and demo, real pilot results (only once a pilot is done and the customer approves), pitch deck request form. | 2026-10-31 |
| 9 | Pilot status | In progress, not finished. Site says "in pilot" with no numbers. `/investors` pilot section stays hidden until results exist and the customer signs consent. / กำลังทำ ยังไม่เสร็จ | 2026-10-31 |
| 10 | Lead destination / รับ lead | LINE OA and email. Target reply within 24 hours. | 2026-10-31 |
| 11 | Hosting | Astro site on Vercel. Demo API is a separate Docker service (Fly, Railway or VPS), because agent runs outlast serverless limits. | 2026-10-31 |
| 12 | Repo | Private GitHub repo `phli-website`. | 2026-10-31 |

## Open / ยังต้องตอบ
- Do we have a LINE OA ID yet? / มี LINE OA แล้วหรือยัง
- Price per line (variable `PRICE_PER_LINE_THB`).
- Facts from the main product repo (audit pending): which features are real, which API the demo can reuse.
