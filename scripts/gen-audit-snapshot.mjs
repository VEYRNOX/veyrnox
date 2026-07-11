#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'public', 'audit-snapshot.json');

let raw;
try {
  raw = execSync('npm audit --json', { cwd: root, encoding: 'utf8' });
} catch (err) {
  // npm audit exits non-zero when vulnerabilities exist — capture stdout anyway
  if (err.stdout == null) {
    console.error('npm audit failed to run:', err.message);
    process.exit(1);
  }
  raw = err.stdout;
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  parsed = {};
}

const out = {
  generatedAt: new Date().toISOString(),
  metadata: parsed.metadata ?? { vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0, info: 0 } },
  vulnerabilities: parsed.vulnerabilities ?? {},
};

writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log('audit-snapshot.json written to', outPath);
