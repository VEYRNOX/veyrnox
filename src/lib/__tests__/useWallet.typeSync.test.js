import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const providerSrc = fs.readFileSync(
  path.resolve(__dirname, '../WalletProvider.jsx'), 'utf8'
);
const dtsSrc = fs.readFileSync(
  path.resolve(__dirname, '../WalletProvider.d.ts'), 'utf8'
);

function extractValueMembers(src) {
  const start = src.indexOf('const value = {');
  if (start === -1) throw new Error('cannot find `const value = {` in WalletProvider.jsx');
  const block = src.slice(start, src.indexOf('};', start) + 2);
  const members = new Set();
  for (const m of block.matchAll(/^\s+(\w+)\s*[,:]/gm)) {
    members.add(m[1]);
  }
  return members;
}

function extractInterfaceMembers(src) {
  const start = src.indexOf('export interface WalletContextValue');
  if (start === -1) throw new Error('cannot find WalletContextValue interface in .d.ts');
  const block = src.slice(start, src.indexOf('}', start) + 1);
  const members = new Set();
  for (const m of block.matchAll(/^\s+(\w+)\s*:/gm)) {
    members.add(m[1]);
  }
  return members;
}

describe('WalletProvider.d.ts ↔ WalletProvider.jsx structural sync', () => {
  const srcMembers = extractValueMembers(providerSrc);
  const dtsMembers = extractInterfaceMembers(dtsSrc);

  it('every value-object member appears in the .d.ts interface', () => {
    const missing = [...srcMembers].filter(m => !dtsMembers.has(m));
    expect(missing, 'members in value but missing from .d.ts').toEqual([]);
  });

  it('no stale members in the .d.ts interface', () => {
    const extra = [...dtsMembers].filter(m => !srcMembers.has(m));
    expect(extra, 'members in .d.ts but missing from value').toEqual([]);
  });
});
