#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = process.cwd();
const files = readdirSync(ROOT).filter(f => /^\.env\.production/.test(f));
let failed = false;
for (const file of files) {
  const content = readFileSync(join(ROOT, file), 'utf8');
  if (/^\s*VITE_BYPASS_RASP\s*=\s*1\s*$/m.test(content)) {
    console.error(`[check-rasp-bypass] FAIL: ${file} sets VITE_BYPASS_RASP=1`);
    failed = true;
  }
}
if (failed) process.exit(1);
else { console.log('[check-rasp-bypass] PASS: no .env.production* file sets VITE_BYPASS_RASP=1.'); process.exit(0); }
