# Trezor Hardware Wallet — Web Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Trezor hardware signing into the Veyrnox web send flow using `@trezor/connect-web` (WebUSB, no private key ever in JS), replacing the existing stub that used the proprietary `TrezorConnect` bridge SDK.

**Architecture:** A thin transport detection layer routes to `@trezor/connect-web` on web (WebUSB) or an `unsupported` state on iOS. A unified signing facade (`trezor.js`) handles EVM, BTC, and SOL. A new `TrezorContext` mounts in `App.jsx` and a modal walks the user through connect → on-device address confirm → ready. `SendCrypto.jsx` gains a "Sign with Trezor" toggle that replaces the `withPrivateKey` call with the facade.

**Tech Stack:** `@trezor/connect-web` v9, ethers v6, `@scure/btc-signer`, `@solana/web3.js`, React context, Vite + Capacitor

## Global Constraints

- I1: No private key ever enters the app. Trezor signs on-device; app receives signed bytes only.
- I2: `@trezor/connect-web` loads from Trezor's CDN (known external dependency, no user data sent). Future hardening task: self-bundle.
- I4: Signing failures abort the send. Never fall back to software signing.
- All status tags remain `BUILT` until real testnet txids are supplied by the owner — never write `verified` in code.
- Design system: `#050608` surfaces, `#4ADAC2` confirmed state, IBM Plex Mono for addresses, Schibsted Grotesk for prose.
- Never modify seed/key/signing code in `vault.js`, `derivation.js`, `multiVault.js`, `kek.js`.
- Delete `src/context/HardwareWalletContext.jsx` as part of this work (it uses the old TrezorConnect stub).
- The existing `evm/hw-send.js`, `btc/hw-send.js`, `sol/hw-send.js` stay on disk but are no longer imported — they will be removed in a follow-up cleanup after verification.
- Run `npm test` after every task. All existing tests must continue passing.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/wallet-core/hw/transport.js` | Create | Platform detection: webusb / unsupported |
| `src/wallet-core/hw/trezorAddress.js` | Create | Fetch address from device for confirmation |
| `src/wallet-core/hw/trezor.js` | Create | Unified signing facade: EVM, BTC, SOL |
| `src/wallet-core/hw/__tests__/transport.test.js` | Create | Unit tests for transport detection |
| `src/wallet-core/hw/__tests__/trezor.test.js` | Create | Unit tests for signing facade (mocked transport) |
| `src/context/TrezorContext.jsx` | Create | React context: connected, addresses, connect/disconnect |
| `src/components/hw/TrezorConnectModal.jsx` | Create | Step-by-step connect → confirm address → ready UI |
| `src/components/hw/TrezorUnsupportedScreen.jsx` | Create | iOS graceful degradation screen |
| `src/pages/SendCrypto.jsx` | Modify | Add "Sign with Trezor" toggle + route to facade |
| `src/App.jsx` | Modify | Mount `TrezorContext` above `WalletGate` |
| `src/context/HardwareWalletContext.jsx` | Delete | Old TrezorConnect stub — replaced by TrezorContext |

---

## Task 1: Install dependency and transport detection

**Files:**
- Modify: `package.json` (via npm install)
- Create: `src/wallet-core/hw/transport.js`
- Create: `src/wallet-core/hw/__tests__/transport.test.js`

**Interfaces:**
- Produces: `getTransport(): { type: 'webusb' | 'unsupported' }`

- [ ] **Step 1: Install `@trezor/connect-web`**

```bash
npm install @trezor/connect-web
```

Expected: package installs without errors. Check `package.json` has `"@trezor/connect-web"` entry.

- [ ] **Step 2: Write failing test**

Create `src/wallet-core/hw/__tests__/transport.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('getTransport', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns webusb when navigator.usb is present', async () => {
    vi.stubGlobal('navigator', { usb: {} });
    const { getTransport } = await import('../transport.js');
    expect(getTransport().type).toBe('webusb');
  });

  it('returns unsupported when navigator.usb is absent', async () => {
    vi.stubGlobal('navigator', {});
    const { getTransport } = await import('../transport.js');
    expect(getTransport().type).toBe('unsupported');
  });

  it('returns unsupported when navigator is undefined', async () => {
    vi.stubGlobal('navigator', undefined);
    const { getTransport } = await import('../transport.js');
    expect(getTransport().type).toBe('unsupported');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
npm test src/wallet-core/hw/__tests__/transport.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 4: Create `src/wallet-core/hw/transport.js`**

```js
export function getTransport() {
  if (typeof navigator !== 'undefined' && navigator.usb) {
    return { type: 'webusb' };
  }
  return { type: 'unsupported' };
}
```

- [ ] **Step 5: Run to verify tests pass**

```bash
npm test src/wallet-core/hw/__tests__/transport.test.js
```

Expected: 3 passing.

- [ ] **Step 6: Commit**

```bash
git add src/wallet-core/hw/transport.js src/wallet-core/hw/__tests__/transport.test.js package.json package-lock.json
git commit -m "feat(trezor): add transport detection + install @trezor/connect-web"
```

---

## Task 2: Trezor signing facade — EVM

**Files:**
- Create: `src/wallet-core/hw/trezor.js` (EVM section)
- Create: `src/wallet-core/hw/__tests__/trezor.test.js` (EVM tests)

**Interfaces:**
- Consumes: `getTransport()` from `transport.js`
- Produces:
  ```js
  trezorSignEvmTx({
    chainId: number,
    nonce: number,
    to: string,           // hex address
    value: bigint,        // wei
    gasLimit: bigint,
    maxFeePerGas: bigint,
    maxPriorityFeePerGas: bigint,
    data?: string,        // hex, default '0x'
  }): Promise<string>     // signed tx hex (0x-prefixed)
  ```

- [ ] **Step 1: Write failing test**

Create `src/wallet-core/hw/__tests__/trezor.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @trezor/connect-web
vi.mock('@trezor/connect-web', () => ({
  default: {
    init: vi.fn(),
    ethereumSignTransaction: vi.fn(),
    signTransaction: vi.fn(),
    solanaSignTransaction: vi.fn(),
  },
}));

// Mock transport
vi.mock('../transport.js', () => ({
  getTransport: vi.fn(() => ({ type: 'webusb' })),
}));

import TrezorConnect from '@trezor/connect-web';
import { ethers } from 'ethers';

describe('trezorSignEvmTx', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a signed transaction hex on success', async () => {
    // Trezor returns v/r/s for the signature
    TrezorConnect.ethereumSignTransaction.mockResolvedValue({
      success: true,
      payload: {
        v: '0x1',
        r: '0x' + 'a'.repeat(64),
        s: '0x' + 'b'.repeat(64),
      },
    });

    const { trezorSignEvmTx } = await import('../trezor.js');

    const result = await trezorSignEvmTx({
      chainId: 11155111,
      nonce: 0,
      to: '0x1234567890123456789012345678901234567890',
      value: ethers.parseEther('0.001'),
      gasLimit: 21000n,
      maxFeePerGas: ethers.parseUnits('20', 'gwei'),
      maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei'),
    });

    expect(result).toMatch(/^0x/);
    expect(TrezorConnect.ethereumSignTransaction).toHaveBeenCalledOnce();
    const call = TrezorConnect.ethereumSignTransaction.mock.calls[0][0];
    expect(call.path).toBe("m/44'/60'/0'/0/0");
    expect(call.transaction.chainId).toBe(11155111);
    expect(call.transaction.to).toBe('0x1234567890123456789012345678901234567890');
  });

  it('throws when Trezor returns failure', async () => {
    TrezorConnect.ethereumSignTransaction.mockResolvedValue({
      success: false,
      payload: { error: 'Action cancelled' },
    });

    const { trezorSignEvmTx } = await import('../trezor.js');

    await expect(trezorSignEvmTx({
      chainId: 11155111,
      nonce: 0,
      to: '0x1234567890123456789012345678901234567890',
      value: 1000n,
      gasLimit: 21000n,
      maxFeePerGas: 1000000000n,
      maxPriorityFeePerGas: 100000000n,
    })).rejects.toThrow('Action cancelled');
  });

  it('throws TREZOR_UNSUPPORTED when transport type is unsupported', async () => {
    const { getTransport } = await import('../transport.js');
    getTransport.mockReturnValueOnce({ type: 'unsupported' });

    const { trezorSignEvmTx } = await import('../trezor.js');

    await expect(trezorSignEvmTx({
      chainId: 1,
      nonce: 0,
      to: '0x1234567890123456789012345678901234567890',
      value: 1n,
      gasLimit: 21000n,
      maxFeePerGas: 1n,
      maxPriorityFeePerGas: 1n,
    })).rejects.toThrow('TREZOR_UNSUPPORTED');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test src/wallet-core/hw/__tests__/trezor.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/wallet-core/hw/trezor.js` with EVM signing**

```js
import TrezorConnect from '@trezor/connect-web';
import { ethers } from 'ethers';
import { getTransport } from './transport.js';

const EVM_PATH = "m/44'/60'/0'/0/0";
const BTC_TESTNET_PATH = "m/84'/1'/0'/0/0";
const BTC_MAINNET_PATH = "m/84'/0'/0'/0/0";
const SOL_PATH = "m/44'/501'/0'/0'";

let initialized = false;

function ensureInit() {
  if (initialized) return;
  TrezorConnect.init({
    lazyLoad: true,
    manifest: {
      email: 'al.jobson@21stclick.co.uk',
      appUrl: 'https://veyrnox.app',
    },
  });
  initialized = true;
}

function requireWebUsb() {
  const transport = getTransport();
  if (transport.type !== 'webusb') {
    throw new Error('TREZOR_UNSUPPORTED');
  }
  ensureInit();
}

export async function trezorSignEvmTx({
  chainId,
  nonce,
  to,
  value,
  gasLimit,
  maxFeePerGas,
  maxPriorityFeePerGas,
  data = '0x',
}) {
  requireWebUsb();

  const result = await TrezorConnect.ethereumSignTransaction({
    path: EVM_PATH,
    transaction: {
      to,
      value: ethers.toBeHex(value),
      data,
      chainId,
      nonce: ethers.toBeHex(nonce),
      gasLimit: ethers.toBeHex(gasLimit),
      maxFeePerGas: ethers.toBeHex(maxFeePerGas),
      maxPriorityFeePerGas: ethers.toBeHex(maxPriorityFeePerGas),
    },
  });

  if (!result.success) throw new Error(result.payload.error);

  const { v, r, s } = result.payload;
  const sig = ethers.Signature.from({
    v: typeof v === 'string' ? parseInt(v, 16) : v,
    r,
    s,
  });

  const tx = ethers.Transaction.from({
    type: 2,
    chainId,
    nonce,
    to,
    value,
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
    data,
  });
  tx.signature = sig;
  return tx.serialized;
}

// BTC and SOL stubs — implemented in Task 3
export async function trezorSignBtcTx(_params) {
  throw new Error('trezorSignBtcTx: not yet implemented');
}

export async function trezorSignSolTx(_params) {
  throw new Error('trezorSignSolTx: not yet implemented');
}
```

- [ ] **Step 4: Run to verify tests pass**

```bash
npm test src/wallet-core/hw/__tests__/trezor.test.js
```

Expected: EVM tests (3) passing. BTC/SOL tests not yet written — OK.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all pre-existing tests still passing.

- [ ] **Step 6: Commit**

```bash
git add src/wallet-core/hw/trezor.js src/wallet-core/hw/__tests__/trezor.test.js
git commit -m "feat(trezor): EVM signing facade with @trezor/connect-web"
```

---

## Task 3: Trezor signing facade — BTC and SOL

**Files:**
- Modify: `src/wallet-core/hw/trezor.js` (replace BTC + SOL stubs)
- Modify: `src/wallet-core/hw/__tests__/trezor.test.js` (add BTC + SOL tests)

**Interfaces:**
- Consumes: existing coin-selection output from `src/wallet-core/btc/send.js` (`plan` object)
- Produces:
  ```js
  trezorSignBtcTx({
    plan: {
      inputs: Array<{ txid: string, vout: number, amountSats: bigint, scriptPubKey: string }>,
      outputs: Array<{ address: string, amountSats: bigint }>,
      changeAddress: string,
      changeAmountSats: bigint,
    },
    networkKey: string,   // 'btc-testnet' | 'btc-mainnet'
  }): Promise<string>    // signed raw tx hex

  trezorSignSolTx({
    serializedTxBase64: string,  // base64 encoded unsigned SOL transaction
    networkKey: string,
  }): Promise<string>            // base64 encoded signed tx
  ```

**Trezor BTC input format reference:**
- `address_n`: BIP32 path as integer array. `"m/84'/1'/0'/0/0"` → `[0x80000054, 0x80000001, 0x80000000, 0, 0]`
- `prev_hash`: txid string (no 0x)
- `prev_index`: vout number
- `amount`: sats as string (e.g. `"1000"`)
- `script_type`: `'SPENDWITNESS'` for P2WPKH

**Trezor BTC output format:**
- Recipient: `{ address: 'tb1q...', amount: '900', script_type: 'PAYTOADDRESS' }`
- Change back to device: `{ address_n: [...], amount: '50', script_type: 'PAYTOP2SHWITNESS' }`

- [ ] **Step 1: Add BTC and SOL tests to `src/wallet-core/hw/__tests__/trezor.test.js`**

Append after the existing `describe('trezorSignEvmTx', ...)` block:

```js
describe('trezorSignBtcTx', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls TrezorConnect.signTransaction with correct coin for testnet', async () => {
    TrezorConnect.signTransaction.mockResolvedValue({
      success: true,
      payload: { serializedTx: 'deadbeef01' },
    });

    const { trezorSignBtcTx } = await import('../trezor.js');

    const result = await trezorSignBtcTx({
      plan: {
        inputs: [{
          txid: 'abc123',
          vout: 0,
          amountSats: 100000n,
          scriptPubKey: '0014' + '00'.repeat(20),
        }],
        outputs: [{ address: 'tb1qtest', amountSats: 90000n }],
        changeAddress: 'tb1qchange',
        changeAmountSats: 9000n,
      },
      networkKey: 'btc-testnet',
    });

    expect(result).toBe('deadbeef01');
    const call = TrezorConnect.signTransaction.mock.calls[0][0];
    expect(call.coin).toBe('tbtc');
    expect(call.inputs[0].prev_hash).toBe('abc123');
    expect(call.inputs[0].amount).toBe('100000');
    expect(call.inputs[0].script_type).toBe('SPENDWITNESS');
    expect(call.outputs[0].address).toBe('tb1qtest');
    expect(call.outputs[0].amount).toBe('90000');
  });

  it('uses btc coin for mainnet', async () => {
    TrezorConnect.signTransaction.mockResolvedValue({
      success: true,
      payload: { serializedTx: 'cafebabe' },
    });

    const { trezorSignBtcTx } = await import('../trezor.js');

    await trezorSignBtcTx({
      plan: {
        inputs: [{ txid: 'abc', vout: 0, amountSats: 50000n, scriptPubKey: '0014' + '00'.repeat(20) }],
        outputs: [{ address: 'bc1qtest', amountSats: 49000n }],
        changeAddress: 'bc1qchange',
        changeAmountSats: 0n,
      },
      networkKey: 'btc-mainnet',
    });

    expect(TrezorConnect.signTransaction.mock.calls[0][0].coin).toBe('btc');
  });

  it('throws on Trezor failure', async () => {
    TrezorConnect.signTransaction.mockResolvedValue({
      success: false,
      payload: { error: 'Cancelled' },
    });

    const { trezorSignBtcTx } = await import('../trezor.js');

    await expect(trezorSignBtcTx({
      plan: {
        inputs: [{ txid: 'x', vout: 0, amountSats: 1000n, scriptPubKey: '0014' + '00'.repeat(20) }],
        outputs: [{ address: 'tb1q', amountSats: 900n }],
        changeAddress: 'tb1q2',
        changeAmountSats: 0n,
      },
      networkKey: 'btc-testnet',
    })).rejects.toThrow('Cancelled');
  });
});

describe('trezorSignSolTx', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns signed tx base64 on success', async () => {
    TrezorConnect.solanaSignTransaction.mockResolvedValue({
      success: true,
      payload: { signature: 'aabbcc' },
    });

    const { trezorSignSolTx } = await import('../trezor.js');

    const result = await trezorSignSolTx({
      serializedTxBase64: btoa('fakeunsignedtx'),
      networkKey: 'sol-devnet',
    });

    // Result is a base64 string
    expect(typeof result).toBe('string');
    const call = TrezorConnect.solanaSignTransaction.mock.calls[0][0];
    expect(call.path).toBe("m/44'/501'/0'/0'");
  });

  it('throws on Trezor failure', async () => {
    TrezorConnect.solanaSignTransaction.mockResolvedValue({
      success: false,
      payload: { error: 'Denied' },
    });

    const { trezorSignSolTx } = await import('../trezor.js');

    await expect(trezorSignSolTx({
      serializedTxBase64: btoa('tx'),
      networkKey: 'sol-devnet',
    })).rejects.toThrow('Denied');
  });
});
```

- [ ] **Step 2: Run to verify new tests fail**

```bash
npm test src/wallet-core/hw/__tests__/trezor.test.js
```

Expected: BTC and SOL tests fail (stubs throw "not yet implemented").

- [ ] **Step 3: Replace BTC and SOL stubs in `src/wallet-core/hw/trezor.js`**

Replace the two stub functions with:

```js
function btcPathArray(networkKey) {
  const isMainnet = networkKey === 'btc-mainnet';
  // BIP32 hardened path: 84'/coin'/0'/0/0
  const coinType = isMainnet ? 0x80000000 : 0x80000001; // 0' or 1'
  return [0x80000054, coinType, 0x80000000, 0, 0];
}

export async function trezorSignBtcTx({ plan, networkKey }) {
  requireWebUsb();

  const isMainnet = networkKey === 'btc-mainnet';
  const coin = isMainnet ? 'btc' : 'tbtc';
  const pathArray = btcPathArray(networkKey);

  const inputs = plan.inputs.map((inp) => ({
    address_n: pathArray,
    prev_hash: inp.txid,
    prev_index: inp.vout,
    amount: String(inp.amountSats),
    script_type: 'SPENDWITNESS',
  }));

  const outputs = plan.outputs.map((out) => ({
    address: out.address,
    amount: String(out.amountSats),
    script_type: 'PAYTOADDRESS',
  }));

  if (plan.changeAmountSats > 0n) {
    outputs.push({
      address_n: pathArray,
      amount: String(plan.changeAmountSats),
      script_type: 'PAYTOP2SHWITNESS',
    });
  }

  const result = await TrezorConnect.signTransaction({ inputs, outputs, coin });
  if (!result.success) throw new Error(result.payload.error);
  return result.payload.serializedTx;
}

export async function trezorSignSolTx({ serializedTxBase64 }) {
  requireWebUsb();

  const serializedTxHex = Buffer.from(serializedTxBase64, 'base64').toString('hex');

  const result = await TrezorConnect.solanaSignTransaction({
    path: SOL_PATH,
    serializedTx: serializedTxHex,
  });
  if (!result.success) throw new Error(result.payload.error);

  // Trezor returns signature hex; caller attaches it to the transaction
  return result.payload.signature;
}
```

- [ ] **Step 4: Run to verify tests pass**

```bash
npm test src/wallet-core/hw/__tests__/trezor.test.js
```

Expected: all tests passing (EVM 3, BTC 3, SOL 2 = 8 total).

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all pre-existing tests still passing.

- [ ] **Step 6: Commit**

```bash
git add src/wallet-core/hw/trezor.js src/wallet-core/hw/__tests__/trezor.test.js
git commit -m "feat(trezor): BTC and SOL signing in facade"
```

---

## Task 4: Address fetching for on-device confirmation

**Files:**
- Create: `src/wallet-core/hw/trezorAddress.js`
- Create: `src/wallet-core/hw/__tests__/trezorAddress.test.js`

**Interfaces:**
- Produces:
  ```js
  getTrezorEvmAddress(): Promise<string>   // checksummed 0x address
  getTrezorBtcAddress(networkKey: string): Promise<string>  // bech32
  getTrezorSolAddress(): Promise<string>   // base58
  ```
  All three trigger on-device address display (user must confirm on Trezor screen).

- [ ] **Step 1: Write failing tests**

Create `src/wallet-core/hw/__tests__/trezorAddress.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@trezor/connect-web', () => ({
  default: {
    init: vi.fn(),
    ethereumGetAddress: vi.fn(),
    getAddress: vi.fn(),
    solanaGetAddress: vi.fn(),
  },
}));

vi.mock('../transport.js', () => ({
  getTransport: vi.fn(() => ({ type: 'webusb' })),
}));

import TrezorConnect from '@trezor/connect-web';

describe('getTrezorEvmAddress', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns checksummed address from device', async () => {
    TrezorConnect.ethereumGetAddress.mockResolvedValue({
      success: true,
      payload: { address: '0xAbCd1234567890abcdef1234567890ABCDEF1234' },
    });

    const { getTrezorEvmAddress } = await import('../trezorAddress.js');
    const addr = await getTrezorEvmAddress();

    expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
    const call = TrezorConnect.ethereumGetAddress.mock.calls[0][0];
    expect(call.path).toBe("m/44'/60'/0'/0/0");
    expect(call.showOnTrezor).toBe(true);
  });

  it('throws on failure', async () => {
    TrezorConnect.ethereumGetAddress.mockResolvedValue({
      success: false,
      payload: { error: 'Cancelled' },
    });

    const { getTrezorEvmAddress } = await import('../trezorAddress.js');
    await expect(getTrezorEvmAddress()).rejects.toThrow('Cancelled');
  });
});

describe('getTrezorBtcAddress', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns testnet bech32 address', async () => {
    TrezorConnect.getAddress.mockResolvedValue({
      success: true,
      payload: { address: 'tb1qtest123' },
    });

    const { getTrezorBtcAddress } = await import('../trezorAddress.js');
    const addr = await getTrezorBtcAddress('btc-testnet');

    expect(addr).toBe('tb1qtest123');
    const call = TrezorConnect.getAddress.mock.calls[0][0];
    expect(call.coin).toBe('tbtc');
    expect(call.showOnTrezor).toBe(true);
  });
});

describe('getTrezorSolAddress', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns SOL public key', async () => {
    TrezorConnect.solanaGetAddress.mockResolvedValue({
      success: true,
      payload: { address: 'SoLAddr1234' },
    });

    const { getTrezorSolAddress } = await import('../trezorAddress.js');
    const addr = await getTrezorSolAddress();

    expect(addr).toBe('SoLAddr1234');
    const call = TrezorConnect.solanaGetAddress.mock.calls[0][0];
    expect(call.path).toBe("m/44'/501'/0'/0'");
    expect(call.showOnTrezor).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npm test src/wallet-core/hw/__tests__/trezorAddress.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/wallet-core/hw/trezorAddress.js`**

```js
import TrezorConnect from '@trezor/connect-web';
import { ethers } from 'ethers';
import { getTransport } from './transport.js';

const EVM_PATH = "m/44'/60'/0'/0/0";
const SOL_PATH = "m/44'/501'/0'/0'";

let initialized = false;
function ensureInit() {
  if (initialized) return;
  TrezorConnect.init({
    lazyLoad: true,
    manifest: { email: 'al.jobson@21stclick.co.uk', appUrl: 'https://veyrnox.app' },
  });
  initialized = true;
}

function requireWebUsb() {
  if (getTransport().type !== 'webusb') throw new Error('TREZOR_UNSUPPORTED');
  ensureInit();
}

export async function getTrezorEvmAddress() {
  requireWebUsb();
  const result = await TrezorConnect.ethereumGetAddress({
    path: EVM_PATH,
    showOnTrezor: true,
  });
  if (!result.success) throw new Error(result.payload.error);
  return ethers.getAddress(result.payload.address);
}

export async function getTrezorBtcAddress(networkKey) {
  requireWebUsb();
  const isMainnet = networkKey === 'btc-mainnet';
  const result = await TrezorConnect.getAddress({
    path: isMainnet ? "m/84'/0'/0'/0/0" : "m/84'/1'/0'/0/0",
    coin: isMainnet ? 'btc' : 'tbtc',
    showOnTrezor: true,
  });
  if (!result.success) throw new Error(result.payload.error);
  return result.payload.address;
}

export async function getTrezorSolAddress() {
  requireWebUsb();
  const result = await TrezorConnect.solanaGetAddress({
    path: SOL_PATH,
    showOnTrezor: true,
  });
  if (!result.success) throw new Error(result.payload.error);
  return result.payload.address;
}
```

- [ ] **Step 4: Run to verify tests pass**

```bash
npm test src/wallet-core/hw/__tests__/trezorAddress.test.js
```

Expected: 5 passing.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add src/wallet-core/hw/trezorAddress.js src/wallet-core/hw/__tests__/trezorAddress.test.js
git commit -m "feat(trezor): address fetch with on-device display"
```

---

## Task 5: TrezorContext

**Files:**
- Create: `src/context/TrezorContext.jsx`
- Delete: `src/context/HardwareWalletContext.jsx`

**Interfaces:**
- Produces: React context hook `useTrezor()` returning:
  ```js
  {
    connected: boolean,
    connecting: boolean,
    error: string | null,
    platform: 'webusb' | 'unsupported',
    evmAddress: string | null,
    btcAddress: string | null,
    solAddress: string | null,
    connect(): Promise<void>,
    disconnect(): void,
  }
  ```

- [ ] **Step 1: Create `src/context/TrezorContext.jsx`**

```jsx
import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { getTransport } from '../wallet-core/hw/transport.js';
import { getTrezorEvmAddress, getTrezorBtcAddress, getTrezorSolAddress } from '../wallet-core/hw/trezorAddress.js';

const TrezorContext = createContext(null);

export function TrezorProvider({ children }) {
  const platform = getTransport().type;
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [evmAddress, setEvmAddress] = useState(null);
  const [btcAddress, setBtcAddress] = useState(null);
  const [solAddress, setSolAddress] = useState(null);
  // networkKey for BTC address — set before connect
  const btcNetworkKeyRef = useRef('btc-testnet');

  const connect = useCallback(async (btcNetworkKey = 'btc-testnet') => {
    if (platform === 'unsupported') {
      setError('TREZOR_UNSUPPORTED');
      return;
    }
    setConnecting(true);
    setError(null);
    btcNetworkKeyRef.current = btcNetworkKey;
    try {
      const [evm, btc, sol] = await Promise.all([
        getTrezorEvmAddress(),
        getTrezorBtcAddress(btcNetworkKey),
        getTrezorSolAddress(),
      ]);
      setEvmAddress(evm);
      setBtcAddress(btc);
      setSolAddress(sol);
      setConnected(true);
    } catch (err) {
      setError(err.message);
      setConnected(false);
    } finally {
      setConnecting(false);
    }
  }, [platform]);

  const disconnect = useCallback(() => {
    setConnected(false);
    setEvmAddress(null);
    setBtcAddress(null);
    setSolAddress(null);
    setError(null);
  }, []);

  return (
    <TrezorContext.Provider value={{
      connected, connecting, error, platform,
      evmAddress, btcAddress, solAddress,
      connect, disconnect,
    }}>
      {children}
    </TrezorContext.Provider>
  );
}

export function useTrezor() {
  const ctx = useContext(TrezorContext);
  if (!ctx) throw new Error('useTrezor must be used within TrezorProvider');
  return ctx;
}
```

- [ ] **Step 2: Delete `src/context/HardwareWalletContext.jsx`**

```bash
git rm src/context/HardwareWalletContext.jsx
```

If any file imports `HardwareWalletContext`, find and remove those imports:

```bash
grep -r "HardwareWalletContext" src/
```

Remove any import lines found. (Expected: `src/App.jsx` imports it — fix in next step.)

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all passing (no tests existed for HardwareWalletContext).

- [ ] **Step 4: Commit**

```bash
git add src/context/TrezorContext.jsx
git commit -m "feat(trezor): TrezorContext + remove old HardwareWalletContext stub"
```

---

## Task 6: TrezorConnectModal and TrezorUnsupportedScreen

**Files:**
- Create: `src/components/hw/TrezorConnectModal.jsx`
- Create: `src/components/hw/TrezorUnsupportedScreen.jsx`

**Interfaces:**
- Consumes: `useTrezor()` from `TrezorContext.jsx`
- Produces:
  ```jsx
  <TrezorConnectModal
    open={boolean}
    onClose={() => void}
    onConnected={() => void}
    btcNetworkKey={string}
  />

  <TrezorUnsupportedScreen />
  ```

- [ ] **Step 1: Create `src/components/hw/TrezorConnectModal.jsx`**

```jsx
import { useEffect } from 'react';
import { useTrezor } from '../../context/TrezorContext.jsx';

// Steps: 0=idle, 1=connecting, 2=confirming address, 3=ready, 4=error
function stepLabel(connecting, connected, error) {
  if (error) return null;
  if (connected) return 'Ready';
  if (connecting) return 'Confirm addresses on your Trezor screen…';
  return 'Plug in your Trezor and unlock it';
}

export function TrezorConnectModal({ open, onClose, onConnected, btcNetworkKey = 'btc-testnet' }) {
  const { connected, connecting, error, evmAddress, btcAddress, solAddress, connect, disconnect } = useTrezor();

  useEffect(() => {
    if (connected && onConnected) onConnected();
  }, [connected, onConnected]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Connect Trezor"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(5,6,8,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        background: '#0D1117',
        border: '1px solid #1D222B',
        borderRadius: 12,
        padding: '32px 28px',
        width: 360,
        maxWidth: '90vw',
      }}>
        <h2 style={{ color: '#E8EAF0', fontFamily: 'Schibsted Grotesk, sans-serif', margin: '0 0 8px' }}>
          Connect Trezor
        </h2>

        {/* Status line */}
        <p style={{ color: '#8B929E', fontFamily: 'Schibsted Grotesk, sans-serif', fontSize: 14, margin: '0 0 24px' }}>
          {error
            ? <span style={{ color: '#FF6B6B' }}>{friendlyError(error)}</span>
            : stepLabel(connecting, connected, error)
          }
        </p>

        {/* Confirmed addresses */}
        {connected && (
          <div style={{ marginBottom: 24 }}>
            <AddressRow label="EVM" address={evmAddress} />
            <AddressRow label="BTC" address={btcAddress} />
            <AddressRow label="SOL" address={solAddress} />
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12 }}>
          {!connected && (
            <button
              onClick={() => connect(btcNetworkKey)}
              disabled={connecting}
              style={{
                flex: 1, padding: '12px 0',
                background: connecting ? '#1D222B' : '#4ADAC2',
                color: connecting ? '#8B929E' : '#050608',
                border: 'none', borderRadius: 8,
                fontFamily: 'Schibsted Grotesk, sans-serif', fontWeight: 600, fontSize: 15,
                cursor: connecting ? 'not-allowed' : 'pointer',
              }}
            >
              {connecting ? 'Connecting…' : 'Connect'}
            </button>
          )}
          {connected && (
            <button
              onClick={() => { disconnect(); onClose(); }}
              style={{
                flex: 1, padding: '12px 0',
                background: '#1D222B', color: '#8B929E',
                border: 'none', borderRadius: 8,
                fontFamily: 'Schibsted Grotesk, sans-serif', fontWeight: 600, fontSize: 15,
                cursor: 'pointer',
              }}
            >
              Disconnect
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '12px 0',
              background: '#1D222B', color: '#8B929E',
              border: 'none', borderRadius: 8,
              fontFamily: 'Schibsted Grotesk, sans-serif', fontWeight: 600, fontSize: 15,
              cursor: 'pointer',
            }}
          >
            {connected ? 'Done' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddressRow({ label, address }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <span style={{ color: '#8B929E', fontFamily: 'Schibsted Grotesk, sans-serif', fontSize: 12 }}>{label} </span>
      <span style={{
        color: '#4ADAC2',
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: 12,
        wordBreak: 'break-all',
      }}>
        {address}
      </span>
    </div>
  );
}

function friendlyError(err) {
  if (err === 'TREZOR_UNSUPPORTED') return 'Trezor is not supported on this platform.';
  if (err.includes('cancelled') || err.includes('Cancelled')) return 'Cancelled on device.';
  if (err.includes('firmware')) return 'Firmware update required. Open Trezor Suite to update.';
  return err;
}
```

- [ ] **Step 2: Create `src/components/hw/TrezorUnsupportedScreen.jsx`**

```jsx
export function TrezorUnsupportedScreen() {
  return (
    <div style={{
      padding: '32px 24px',
      background: '#0D1117',
      border: '1px solid #1D222B',
      borderRadius: 12,
      textAlign: 'center',
    }}>
      <p style={{
        color: '#E8EAF0',
        fontFamily: 'Schibsted Grotesk, sans-serif',
        fontSize: 16,
        margin: '0 0 12px',
      }}>
        Trezor not supported on iOS
      </p>
      <p style={{
        color: '#8B929E',
        fontFamily: 'Schibsted Grotesk, sans-serif',
        fontSize: 14,
        margin: 0,
      }}>
        iOS does not support USB hardware wallets. Open Veyrnox in a desktop browser (Chrome or Edge) to sign with your Trezor.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all passing.

- [ ] **Step 4: Commit**

```bash
git add src/components/hw/TrezorConnectModal.jsx src/components/hw/TrezorUnsupportedScreen.jsx
git commit -m "feat(trezor): TrezorConnectModal and TrezorUnsupportedScreen UI"
```

---

## Task 7: Mount TrezorProvider in App.jsx

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `TrezorProvider` from `src/context/TrezorContext.jsx`
- No interface change — just mounts the context above `WalletGate`

- [ ] **Step 1: Read the current App.jsx mount order**

Open `src/App.jsx` and find where `HardwareWalletContext` (or its provider) was imported and mounted. Note the line numbers.

- [ ] **Step 2: Replace HardwareWalletContext with TrezorProvider**

Remove the old `HardwareWalletContext` import and its JSX wrapper. Add `TrezorProvider` in the same position (above `WalletGate`):

```jsx
// Add at the top of imports:
import { TrezorProvider } from './context/TrezorContext.jsx';

// In JSX, replace the old HardwareWalletContext wrapper with:
<TrezorProvider>
  {/* ... rest of app including WalletGate ... */}
</TrezorProvider>
```

- [ ] **Step 3: Run dev server briefly to confirm no mount errors**

```bash
npm run dev
```

Open `http://localhost:5173` in Chrome. Check browser console — no errors. Stop the server (`Ctrl+C`).

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat(trezor): mount TrezorProvider in App.jsx"
```

---

## Task 8: Wire Trezor into SendCrypto.jsx

**Files:**
- Modify: `src/pages/SendCrypto.jsx`

**Interfaces:**
- Consumes:
  - `useTrezor()` → `{ connected, platform, evmAddress, btcAddress, solAddress, connect }`
  - `trezorSignEvmTx(...)` from `src/wallet-core/hw/trezor.js`
  - `trezorSignBtcTx(...)` from `src/wallet-core/hw/trezor.js`
  - `trezorSignSolTx(...)` from `src/wallet-core/hw/trezor.js`
  - `TrezorConnectModal` from `src/components/hw/TrezorConnectModal.jsx`
  - `TrezorUnsupportedScreen` from `src/components/hw/TrezorUnsupportedScreen.jsx`
  - Existing: `normalizeSendResult` (broadcast layer, unchanged)
  - Existing: `presignGate`, `evaluateSendGate`, `resolveSend2faMethod` (all unchanged)

This is the most complex modification. Read `src/pages/SendCrypto.jsx` fully before editing to understand the current state of the three send branches (BTC ~line 697, SOL ~line 709, EVM ~line 725).

- [ ] **Step 1: Add Trezor imports at the top of SendCrypto.jsx**

Find the existing import block and add:

```js
import { useTrezor } from '../context/TrezorContext.jsx';
import { trezorSignEvmTx, trezorSignBtcTx, trezorSignSolTx } from '../wallet-core/hw/trezor.js';
import { TrezorConnectModal } from '../components/hw/TrezorConnectModal.jsx';
import { TrezorUnsupportedScreen } from '../components/hw/TrezorUnsupportedScreen.jsx';
```

- [ ] **Step 2: Add Trezor state inside the SendCrypto component**

Find the existing `useState` declarations near the top of the component body and add:

```js
const { connected: trezorConnected, platform: trezorPlatform, evmAddress: trezorEvmAddress, btcAddress: trezorBtcAddress, solAddress: trezorSolAddress } = useTrezor();
const [useTrezorMode, setUseTrezorMode] = useState(false);
const [trezorModalOpen, setTrezorModalOpen] = useState(false);
```

- [ ] **Step 3: Add the Trezor mode toggle UI**

Find the section in the JSX that renders the send form (where the recipient and amount inputs are). Add the toggle immediately above the "Send" button:

```jsx
{/* Trezor signing toggle */}
{trezorPlatform === 'unsupported' && useTrezorMode && (
  <TrezorUnsupportedScreen />
)}
{trezorPlatform !== 'unsupported' && (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
    <label style={{
      display: 'flex', alignItems: 'center', gap: 8,
      color: '#8B929E', fontFamily: 'Schibsted Grotesk, sans-serif', fontSize: 14,
      cursor: 'pointer',
    }}>
      <input
        type="checkbox"
        checked={useTrezorMode}
        onChange={(e) => {
          setUseTrezorMode(e.target.checked);
          if (e.target.checked && !trezorConnected) setTrezorModalOpen(true);
        }}
        style={{ accentColor: '#4ADAC2' }}
      />
      Sign with Trezor
    </label>
    {useTrezorMode && trezorConnected && (
      <span style={{ color: '#4ADAC2', fontFamily: 'Schibsted Grotesk, sans-serif', fontSize: 12 }}>
        ✓ Device connected
      </span>
    )}
    {useTrezorMode && !trezorConnected && (
      <button
        onClick={() => setTrezorModalOpen(true)}
        style={{
          background: 'none', border: 'none',
          color: '#4ADAC2', fontFamily: 'Schibsted Grotesk, sans-serif',
          fontSize: 12, cursor: 'pointer', textDecoration: 'underline',
        }}
      >
        Connect device
      </button>
    )}
  </div>
)}
<TrezorConnectModal
  open={trezorModalOpen}
  onClose={() => setTrezorModalOpen(false)}
  onConnected={() => setTrezorModalOpen(false)}
  btcNetworkKey={selectedAsset?.networkKey ?? 'btc-testnet'}
/>
```

- [ ] **Step 4: Wire Trezor signing into the send branches**

Find the three send branches. Each one currently calls `withPrivateKey` / `withBtcPrivateKey` / `withSolPrivateKey`. Add a Trezor branch before each:

**BTC branch** (near line 697):
```js
// BEFORE the existing:  withBtcPrivateKey(...)
let btcResult;
if (useTrezorMode) {
  if (!trezorConnected) throw new Error('TREZOR_NOT_CONNECTED');
  const signedTxHex = await trezorSignBtcTx({ plan, networkKey });
  btcResult = await broadcastBtcTx({ signedTxHex, networkKey });
} else {
  btcResult = await withBtcPrivateKey(({ privateKey, publicKey, address }) =>
    signAndBroadcastBtc({ networkKey, privateKey, publicKey, fromAddress: address, toAddress, amountSats: toBaseUnits(amount, 8) })
  );
}
```

**SOL branch** (near line 709):
```js
// BEFORE the existing: withSolPrivateKey(...)
let solResult;
if (useTrezorMode) {
  if (!trezorConnected) throw new Error('TREZOR_NOT_CONNECTED');
  // Build unsigned SOL tx, get serialized base64, sign via Trezor, broadcast
  const { buildUnsignedSolTx, broadcastSignedSolTx } = await import('../wallet-core/sol/send.js');
  const { serializedTxBase64, blockhash } = await buildUnsignedSolTx({
    networkKey, fromAddress: trezorSolAddress, toAddress, amountLamports: toBaseUnits(amount, 9),
  });
  const signatureHex = await trezorSignSolTx({ serializedTxBase64, networkKey });
  solResult = await broadcastSignedSolTx({ serializedTxBase64, signatureHex, fromAddress: trezorSolAddress, networkKey, blockhash });
} else {
  solResult = await withSolPrivateKey(({ privateKey, address }) =>
    signAndBroadcastSol({ networkKey, privateKey, fromAddress: address, toAddress, amountLamports: toBaseUnits(amount, 9) })
  );
}
```

**EVM branch** (near line 725):
```js
// BEFORE the existing: withPrivateKey(...)
let evmResult;
if (useTrezorMode) {
  if (!trezorConnected) throw new Error('TREZOR_NOT_CONNECTED');
  const provider = getProvider(networkKey);
  const nonce = await provider.getTransactionCount(trezorEvmAddress);
  const signedTxHex = await trezorSignEvmTx({
    chainId: fee.chainId,
    nonce,
    to: toAddress,
    value: isErc20 ? 0n : toBaseUnits(amount, 18),
    gasLimit: fee.gasLimit,
    maxFeePerGas: fee.maxFeePerGas,
    maxPriorityFeePerGas: fee.maxPriorityFeePerGas,
    data: isErc20 ? buildErc20TransferData(toAddress, toBaseUnits(amount, tokenDecimals)) : '0x',
  });
  evmResult = await provider.broadcastTransaction(signedTxHex);
} else {
  evmResult = await withPrivateKey(acct.index, (privateKey) =>
    isErc20
      ? sendToken({ networkKey, privateKey, symbol, to: toAddress, amount, fee })
      : signAndBroadcast({ networkKey, privateKey, to: toAddress, amountEth: amount, fee })
  );
}
```

**Note:** Read `src/wallet-core/sol/send.js` before this step to confirm whether `buildUnsignedSolTx` and `broadcastSignedSolTx` exist as separate exports. If not, the SOL Trezor path needs a helper extracted in a sub-step. Check with:
```bash
grep -n "export" src/wallet-core/sol/send.js
```
If `buildUnsignedSolTx` is not exported, add the export to `sol/send.js` as a separate commit before this task's final commit.

- [ ] **Step 5: Run dev server and manual smoke test**

```bash
npm run dev
```

1. Open Chrome at `http://localhost:5173`
2. Clear demo: visit `http://localhost:5173/?demo=0`
3. Navigate to the Send screen
4. Confirm the "Sign with Trezor" checkbox appears
5. Check the checkbox — `TrezorConnectModal` should appear
6. Plug in your Trezor. Click Connect. Confirm addresses on device.
7. Modal should show EVM, BTC, SOL addresses in IBM Plex Mono with `#4ADAC2` color.

Stop the server (`Ctrl+C`).

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: all passing.

- [ ] **Step 7: Commit**

```bash
git add src/pages/SendCrypto.jsx
git commit -m "feat(trezor): wire Trezor signing into SendCrypto send flow"
```

---

## Task 9: Real-device verification (EVM → BTC → SOL)

This task requires the physical Trezor device and testnet funds. Do not mark anything `verified` until the owner supplies a real explorer-confirmed txid for each chain.

**Files:**
- Modify: `src/wallet-core/assets.js` — update Trezor status comment after each txid (owner supplies)

- [ ] **Step 1: EVM testnet send — Sepolia**

1. Ensure Trezor is connected and the app shows "Device connected"
2. Select ETH (Sepolia) in the Send screen
3. Enable "Sign with Trezor"
4. Send a small amount (e.g. 0.001 ETH) to a known address
5. Confirm on the Trezor device screen (verify amount and recipient)
6. Copy the txid from the success screen
7. Confirm on [sepolia.etherscan.io](https://sepolia.etherscan.io) — status must be "Success"
8. Report txid to owner for recording

- [ ] **Step 2: BTC testnet send — BTC Testnet**

1. Select BTC (testnet) in Send screen
2. Enable "Sign with Trezor"
3. Send a small amount to a known testnet address
4. Confirm on Trezor device
5. Confirm txid on [mempool.space/testnet](https://mempool.space/testnet)
6. Report txid to owner

- [ ] **Step 3: SOL devnet send**

1. Select SOL (devnet) in Send screen
2. Enable "Sign with Trezor"
3. Send a small amount to a known devnet address
4. Confirm on Trezor device
5. Confirm txid on [explorer.solana.com](https://explorer.solana.com/?cluster=devnet)
6. Report txid to owner

- [ ] **Step 4: Record txids (owner action)**

Owner supplies the three txids. Update status comments in `src/wallet-core/assets.js` for the Trezor-signed entries — status moves from `BUILT` to `verified` only after real txids are recorded.

---

## Self-Review Checklist

- [x] **Spec coverage:** Architecture (transport.js, trezor.js, TrezorContext, modal, Send wiring) — all covered. iOS graceful degradation — Task 6 (TrezorUnsupportedScreen). Error handling (cancelled, unsupported, timeout) — covered in modal and facade. Unit tests for transport, signing, address — Tasks 1-4. Real-device verification gate — Task 9.
- [x] **Placeholder scan:** No TBDs. SOL path notes a conditional check needed (buildUnsignedSolTx export) — flagged inline in Task 8 Step 4 with a specific grep command.
- [x] **Type consistency:** `getTransport()` returns `{ type }` — used consistently across transport.js, TrezorContext, trezor.js. `trezorSignEvmTx` param shape defined in Task 2 matches Task 8 call site. `trezorSignBtcTx` plan shape defined in Task 3 matches Task 8 call site. `trezorSignSolTx` serializedTxBase64/networkKey defined in Task 3 matches Task 8.
