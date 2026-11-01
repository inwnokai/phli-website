// Fails the build if the built site contains phrases we cannot back up.
// Source of truth for what we may say: CLAIMS.md and docs/PRODUCT_FACTS.md.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const banned = [
  // Unproven numbers and results
  [/\bOEE\b[^<]{0,40}\d+(\.\d+)?\s?%/i, 'OEE figure'],
  [/\d+(\.\d+)?\s?%\s*(OEE|uptime|efficien|saving|ลด|เพิ่ม)/i, 'percentage result'],
  [/\bROI\b|คืนทุน|payback/i, 'ROI or payback claim'],
  [/tokens?\s*\/\s*s(ec)?\b/i, 'model speed benchmark'],
  [/guarantee|รับประกัน/i, 'guarantee'],
  // Deployment and compliance claims not true today
  [/air[-\s]?gapped|100%\s*on[-\s]?prem/i, 'air-gapped / fully on-prem'],
  [/PDPA[-\s]?(compliant|certified)|สอดคล้อง(กับ)?\s*PDPA/i, 'PDPA compliance'],
  [/ISO\s?\d+[^<]{0,20}(certified|รับรอง)|ISA-?95\s*(compliant|certified)/i, 'certification'],
  [/\b(PLC|OPC[\s-]?UA|Modbus)\b/i, 'PLC / OPC UA / Modbus integration'],
  [/autonomous|อัตโนมัติเต็มรูปแบบ/i, 'autonomous agent'],
  [/real[-\s]?time|เรียลไทม์/i, 'real-time claim'],
  // Customers, testimonials and third parties
  [/Luangthaworn|หลวงถาวร|LF Furniture|No Form (&|&amp;|and) Function/i, 'real or demo company name'],
  [/testimonial|trusted by|ลูกค้าของเรา(กว่า|มากกว่า)/i, 'testimonial / social proof'],
  [/\bCarbon\b/i, 'third-party product name'],
  [/studentId|เลขประจำตัวนักศึกษา/i, 'personal data'],
];

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : [];
  });
}

const textOf = (html) =>
  html.replace(/<script[\s\S]*?<\/script>/g, (m) => (m.includes('application/ld+json') ? m : ' '))
      .replace(/<style[\s\S]*?<\/style>/g, ' ');

let failures = 0;
for (const file of walk(DIST)) {
  const text = textOf(readFileSync(file, 'utf8'));
  for (const [re, label] of banned) {
    const m = text.match(re);
    if (m) {
      failures++;
      console.error(`✗ ${file}: ${label} → "${m[0]}"`);
    }
  }
}
// The replay demo payload lives in a data attribute, so it is covered by the scan above.
if (failures) {
  console.error(`\n${failures} banned phrase(s). Fix the copy or update CLAIMS.md with evidence first.`);
  process.exit(1);
}
console.log('✓ claims check passed');
