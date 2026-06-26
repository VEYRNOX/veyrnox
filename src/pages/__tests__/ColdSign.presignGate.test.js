// ColdSign.presignGate.test.js
//
// TDD guard for H11 audit finding: ColdSign.jsx must call detect() at broadcast
// time and pass the live RASP tier to presignGate — not hardcode TIER.ALLOW.
//
// Section A: structural wiring guards (source-level, fast, no mocking).
// Section B: behavioural runtime tests — vi.mock controls RASP and presignGate
//   to verify the BLOCK path refuses and the ALLOW path permits.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../ColdSign.jsx'), 'utf8');

// ---------------------------------------------------------------------------
// Section A — structural wiring (source-level)
// ---------------------------------------------------------------------------
describe('ColdSign — H11: live RASP probe at broadcast (not hardcoded ALLOW)', () => {
  it('imports detect and degrade from @/rasp', () => {
    // Must import the live probe helpers, not just TIER
    expect(src).toMatch(/import\s*\{[^}]*\bdetect\b[^}]*\}\s*from\s*["']@\/rasp["']/);
    expect(src).toMatch(/import\s*\{[^}]*\bdegrade\b[^}]*\}\s*from\s*["']@\/rasp["']/);
  });

  it('imports browserProbeSource from @/rasp', () => {
    expect(src).toMatch(/import\s*\{[^}]*\bbrowserProbeSource\b[^}]*\}\s*from\s*["']@\/rasp["']/);
  });

  it('calls detect(browserProbeSource) inside handleBroadcast', () => {
    // The live call must appear in source — not just be imported
    expect(src).toContain('detect(browserProbeSource)');
  });

  it('wraps detect in degrade()', () => {
    expect(src).toContain('degrade(detect(browserProbeSource))');
  });

  it('does NOT hardcode TIER.ALLOW as the first argument to presignGate', () => {
    // Old placeholder: presignGate(TIER.ALLOW, "allow", riskAck)
    // After fix: presignGate(raspTier, "allow", riskAck)
    expect(src).not.toContain('presignGate(TIER.ALLOW,');
  });

  it('passes raspTier (not a literal) to presignGate', () => {
    expect(src).toMatch(/presignGate\s*\(\s*raspTier\s*,/);
  });

  it('no longer carries the STRUCTURAL PLACEHOLDER comment', () => {
    expect(src).not.toContain('STRUCTURAL PLACEHOLDER ONLY');
  });

  it('fallback uses TIER.BLOCK not TIER.ALLOW (fail closed, I4)', () => {
    // The ?? fallback must be BLOCK so a missing tier blocks, not allows.
    expect(src).toContain('?? TIER.BLOCK');
    expect(src).not.toMatch(/\?\?\s*TIER\.ALLOW/);
  });
});

// ---------------------------------------------------------------------------
// Section B — behavioural runtime tests (vi.mock, real code paths)
// ---------------------------------------------------------------------------
//
// evalPresignGate(riskAck) is the pure extracted helper that encapsulates the
// RASP probe + presignGate call used by handleBroadcast. We mock @/rasp and
// @/sign-gate/presign to control each plane independently, then assert that
// the helper returns the correct proceedAllowed value.

vi.mock('@/rasp', () => ({
  TIER: { ALLOW: 'allow', WARN: 'warn-before-sign', BLOCK: 'block-signing' },
  detect: vi.fn(),
  degrade: vi.fn(),
  browserProbeSource: {},
}));

vi.mock('@/sign-gate/presign', () => ({
  presignGate: vi.fn(),
}));

// Heavy module imports that evalPresignGate's file also pulls in — stub them
// so the module loads without real network / native dependencies.
vi.mock('@/lib/WalletProvider', () => ({ useWallet: vi.fn(() => ({})) }));
vi.mock('@/wallet-core/evm/provider', () => ({ getProvider: vi.fn(), broadcastSigned: vi.fn() }));
vi.mock('@/wallet-core/evm/networks', () => ({ getNetwork: vi.fn() }));
vi.mock('@/wallet-core/evm/fees', () => ({ estimateEvmFeeTiers: vi.fn() }));
vi.mock('@/wallet-core/btc/networks', () => ({ getBtcNetwork: vi.fn() }));
vi.mock('@/wallet-core/btc/send', () => ({ estimateBtcSend: vi.fn() }));
vi.mock('@/wallet-core/btc/provider', () => ({ broadcastTx: vi.fn() }));
vi.mock('@/wallet-core/coldkey/evmUnsigned', () => ({ buildUnsignedEvmTx: vi.fn() }));
vi.mock('@/wallet-core/coldkey/psbt', () => ({ buildUnsignedPsbt: vi.fn() }));
vi.mock('@/wallet-core/coldkey/qr', () => ({
  encodeColdPayload: vi.fn(),
  decodeColdPayload: vi.fn(),
  COLD_KIND: {},
}));
vi.mock('@/components/QRCodeDisplay', () => ({ default: () => null }));
vi.mock('@/components/ui/button', () => ({ Button: () => null }));
vi.mock('lucide-react', () => ({
  ShieldAlert: () => null, ShieldCheck: () => null, ScanLine: () => null,
  Loader2: () => null, ExternalLink: () => null, AlertTriangle: () => null,
  ArrowLeft: () => null,
}));
vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => vi.fn()),
  useLocation: vi.fn(() => ({ state: {} })),
}));
vi.mock('@scure/base', () => ({ base64: { decode: vi.fn() } }));
vi.mock('@scure/btc-signer', () => ({ Transaction: { fromPSBT: vi.fn() } }));
vi.mock('ethers', () => ({ parseEther: vi.fn(), parseUnits: vi.fn() }));

describe('ColdSign — H11 behavioural: evalPresignGate runtime path', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('Test A (BLOCK path): returns proceedAllowed:false when RASP tier is BLOCK', async () => {
    const { TIER, detect, degrade } = await import('@/rasp');
    const { presignGate } = await import('@/sign-gate/presign');

    // RASP probe returns a BLOCK artifact
    detect.mockReturnValue({ condition: 'rooted' });
    degrade.mockReturnValue({ tier: TIER.BLOCK, condition: 'rooted' });
    // presignGate enforces the block
    presignGate.mockReturnValue({ proceedAllowed: false, decision: 'block', owner: 'rasp', signerReachable: false });

    const { evalPresignGate } = await import('../ColdSign.jsx');
    const result = evalPresignGate(true /* riskAck */);

    expect(result.proceedAllowed).toBe(false);
    // Verify presignGate was called with the BLOCK tier, not a hardcoded ALLOW
    expect(presignGate).toHaveBeenCalledWith(TIER.BLOCK, 'allow', true);
  });

  it('Test B (ALLOW path): returns proceedAllowed:true when RASP tier is ALLOW', async () => {
    const { TIER, detect, degrade } = await import('@/rasp');
    const { presignGate } = await import('@/sign-gate/presign');

    // RASP probe returns a clean ALLOW artifact
    detect.mockReturnValue({ condition: 'clean' });
    degrade.mockReturnValue({ tier: TIER.ALLOW, condition: 'clean' });
    presignGate.mockReturnValue({ proceedAllowed: true, decision: 'allow', owner: null, signerReachable: true });

    const { evalPresignGate } = await import('../ColdSign.jsx');
    const result = evalPresignGate(true /* riskAck */);

    expect(result.proceedAllowed).toBe(true);
    expect(presignGate).toHaveBeenCalledWith(TIER.ALLOW, 'allow', true);
  });
});
