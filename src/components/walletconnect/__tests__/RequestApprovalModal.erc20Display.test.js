import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../RequestApprovalModal.jsx'), 'utf8');

describe('RequestApprovalModal — ERC-20 send display', () => {
  it('uses resolveWcSpendAmount for the value row instead of raw native value only', () => {
    expect(src).toMatch(/resolveWcSpendAmount/);
    expect(src).toMatch(/const spendDisplay =/);
    expect(src).toMatch(/const valueRowText =/);
    expect(src).not.toMatch(/reqParams\[0\]\?\.value\s*\?\s*ethers\.formatEther/);
  });
});
