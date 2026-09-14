// #2569: every referral capture surface must go through referralAttribution's
// validator. The Create Wallet invite field called setPendingReferral directly,
// so malformed codes were stored (prod: 409 on VYX-ABC234) and manual
// redemptions never emitted referral_code_applied (prod: VYX-JA4BXN 0 -> 1, no
// event). Source scan: WalletEntry pulls in the whole wallet provider stack.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, '..', 'WalletEntry.jsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('WalletEntry invite code capture (#2569)', () => {
  it('never writes the pending referral directly', () => {
    expect(src).not.toMatch(/\bsetPendingReferral\s*\(/);
  });

  it('routes both create and import through captureReferralCode and stops on an invalid code', () => {
    expect(src).toMatch(/import\s*\{[^}]*\bcaptureReferralCode\b[^}]*\}\s*from\s*["']@\/lib\/referralAttribution["']/);
    expect(src).toMatch(/if\s*\(\s*applyInviteCode\(\)\s*\)\s*doCreateWallet\(\)/);
    expect(src).toMatch(/if\s*\(\s*!applyInviteCode\(\)\s*\)\s*return;\s*await\s+doImportWallet\(/);
  });
});
