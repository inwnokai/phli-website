// Every Thai page needs an English twin and hreflang links, and vice versa.
import { existsSync, readFileSync } from 'node:fs';

const pages = ['', 'health-check/', 'demo/', 'security/', 'investors/', 'privacy/'];
let bad = 0;
for (const p of pages) {
  for (const [lang, path] of [['th', `dist/${p}index.html`], ['en', `dist/en/${p}index.html`]]) {
    if (!existsSync(path)) { console.error(`✗ missing ${path}`); bad++; continue; }
    const html = readFileSync(path, 'utf8');
    if (!html.includes(`<html lang="${lang}"`)) { console.error(`✗ ${path}: wrong html lang`); bad++; }
    for (const h of ['th', 'en', 'x-default']) {
      if (!html.includes(`hreflang="${h}"`)) { console.error(`✗ ${path}: no hreflang=${h}`); bad++; }
    }
  }
}
if (bad) process.exit(1);
console.log('✓ i18n check passed');
