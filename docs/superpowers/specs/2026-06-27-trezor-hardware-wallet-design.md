# Trezor Hardware Wallet Integration — Design Spec

**Date:** 2026-06-27  
**Status:** BUILT (existing stub) → target: BUILT on all chains, pending real-device testnet verification  
**Scope:** Web (desktop browser) + Android native (Capacitor) + iOS graceful degradation

---

## Overview

Veyrnox currently has a partial Trezor implementation (`evm/hw-send.js`, `btc/hw-send.js`, `sol/hw-send.js`) using `TrezorConnect` (Trezor's proprietary bridge SDK), but it is not wired into the Send UI and has never been tested against a real device. This spec replaces that stub with a fully open, self-sovereign integration using `@trezor/connect-web` (WebUSB, no Trezor-hosted bridge) for web and a new Capacitor native plugin for Android.

### Security invariants

- **I1**: No private key ever enters the app JS context. Trezor signs on-device; the app receives signed transaction bytes only.
- **I2**: No data sent to Trezor's servers. `@trezor/connect-web` is bundled locally and run in WebUSB-only mode — `connectSrc` points to local assets, not `connect.trezor.io`.
- **I4**: Signing failures abort the send. The Trezor path never silently falls back to software signing.

---

## Architecture

```
UI Layer
  SendCrypto.jsx          — adds "Sign with Trezor" mode toggle
  TrezorConnectModal      — connect / verify address on device / ready
  TrezorUnsupportedScreen — iOS: explains limitation, suggests desktop

Routing Layer
  src/wallet-core/hw/trezor.js      — unified signing facade (EVM / BTC / SOL)
  src/wallet-core/hw/transport.js   — platform router: webusb | android-native | unsupported
  src/wallet-core/hw/trezorAddress.js — address fetch + on-device confirmation

Transport Layer (web)
  @trezor/connect-web   — WebUSB, self-bundled, no bridge dependency

Transport Layer (Android native)
  android/.../TrezorUsbPlugin.kt    — Capacitor plugin, Android USB Host API,
                                      Trezor wire protocol (protobuf over USB HID)

Transport Layer (iOS)
  TrezorUnsupportedScreen           — graceful degradation only
```

---

## Components

### `src/wallet-core/hw/transport.js`

Platform detection at connect time. Returns `{ type: 'webusb' | 'android-native' | 'unsupported' }`.

- `webusb`: browser environment where `navigator.usb` is available
- `android-native`: Capacitor app on Android (`Capacitor.getPlatform() === 'android'`)
- `unsupported`: iOS native, or any environment where neither path is available

### `src/wallet-core/hw/trezorAddress.js`

Exports `getTrezorEvmAddress()`, `getTrezorBtcAddress()`, `getTrezorSolAddress()`. Each fetches the address from the device and prompts the user to confirm it on the Trezor screen before any send proceeds. Address mismatch between expected and device-displayed hard-blocks the flow.

### `src/wallet-core/hw/trezor.js`

Signing facade. Three exports:

- `trezorSignEvmTx({ networkKey, to, amountWei, fee, nonce, chainId })` → signed tx hex
- `trezorSignBtcTx({ plan, networkKey })` → signed raw tx hex
- `trezorSignSolTx({ serializedTx, networkKey })` → signed tx bytes

Internally: calls `getTransport()`, dispatches to WebUSB path (`@trezor/connect-web`) or native plugin path (`TrezorUsbPlugin`). Returns signed bytes only — no private key at any point.

### `android/app/src/main/.../TrezorUsbPlugin.kt`

New Capacitor plugin. Uses Android `UsbManager` / `UsbDeviceConnection` to open a connection to the Trezor device over USB HID. Implements the Trezor wire protocol (protobuf-encoded messages). Exposes to JS:

- `openDevice()` — requests USB permission, opens connection
- `getAddress({ path, coin })` → address string
- `signEthTransaction({ path, tx })` → `{ v, r, s }`
- `signBtcTransaction({ inputs, outputs, coin })` → signed tx hex
- `signSolTransaction({ path, serializedTx })` → signature hex
- `closeDevice()`

### `src/context/TrezorContext.jsx`

React context mounted in `App.jsx` above `WalletGate`. Provides:

```js
{
  connected: boolean,
  deviceLabel: string | null,
  platform: 'webusb' | 'android-native' | 'unsupported',
  evmAddress: string | null,
  btcAddress: string | null,
  solAddress: string | null,
  connect(): Promise<void>,
  disconnect(): void,
}
```

### `src/components/hw/TrezorConnectModal.jsx`

Step-by-step connection UI:
1. "Plug in your Trezor and unlock it"
2. USB permission prompt (WebUSB) or USB OTG detection (Android)
3. "Confirm your address on the Trezor screen" — shows expected address, waits for device confirmation
4. "Ready — your Trezor is connected"

Design-system compliant: `#050608` surface, `#4ADAC2` confirmed state, IBM Plex Mono for addresses.

### `src/components/hw/TrezorUnsupportedScreen.jsx`

iOS only. Explains that Trezor USB is not supported on iOS due to platform restrictions. Provides a clear path: "Open Veyrnox in a desktop browser to use your Trezor."

---

## Send Flow (modified)

```
SendCrypto.jsx
  ↓ user toggles "Sign with Trezor"
  ↓ TrezorContext.connect() — shows TrezorConnectModal
  ↓ presignGate (unchanged)
  ↓ evaluateSendGate (unchanged — spend limits, 2FA still enforced)
  ↓ trezorSign{Evm|Btc|Sol}Tx(txParams)
      ├─ web:     @trezor/connect-web WebUSB request → signed bytes
      └─ android: TrezorUsbPlugin → signed bytes
  ↓ existing broadcast layer (unchanged)
  ↓ normalizeSendResult → txid
  ↓ base44.entities.Transaction.create(...)
```

The Trezor path is **additive** — it replaces the signing step only. Pre-sign gates, spend limits, 2FA, broadcast, and tx recording are all unchanged.

---

## Error Handling

All errors fail closed (I4). No silent fallback to software signing.

| Error | Behaviour |
|---|---|
| Device not detected | Modal: "No device found — plug in your Trezor" |
| User cancels on device | `TREZOR_ACTION_CANCELLED` — send aborted, returns to confirm screen |
| Address mismatch | Hard block: "Address on device doesn't match. Do not proceed." |
| Firmware too old | Shows firmware version + link to Trezor Suite update instructions |
| iOS platform | `TrezorUnsupportedScreen` — no connection attempt |
| Signing timeout (>60s) | Abort: "Trezor did not respond in time" |
| Native plugin unavailable | `unsupported` state — never falls through to software signing |

---

## Testing

### Unit tests (`src/wallet-core/hw/__tests__/`)

- `trezor.test.js` — mock transport layer, assert correct protobuf params built for EVM / BTC / SOL, assert signed bytes returned correctly
- `transport.test.js` — assert correct platform type returned per environment
- `trezorAddress.test.js` — address fetch and mismatch detection

Tests run without a physical device (transport mocked).

### Real-device verification gate

Status remains `BUILT` until the following testnet transactions are confirmed on-chain and txids supplied:

| Chain | Network | Required txid |
|---|---|---|
| EVM (ETH) | Sepolia | TBD |
| BTC | Testnet | TBD |
| SOL | Devnet | TBD |

Only after all three txids are recorded does status flip to `verified`.

### No fake signing

There is no demo/mock Trezor signing path. If the device is unavailable, the UI shows the appropriate error — it does not simulate a successful hardware signing.

---

## Dependencies

| Package | Purpose | Notes |
|---|---|---|
| `@trezor/connect-web` | WebUSB signing for web | Self-bundled; `connectSrc` set to local build |
| `@trezor/protobuf` | Trezor wire protocol messages | Used by Android plugin |
| Existing: `@noble/*`, `@scure/*`, `ethers v6` | Tx construction | Unchanged |

Android plugin is new native Kotlin code — no npm dependency.

---

## Status Tags

- `TrezorContext` + `TrezorConnectModal` + `TrezorUnsupportedScreen`: **BUILT** after implementation
- `trezor.js` signing facade + `TrezorUsbPlugin`: **BUILT** after implementation  
- EVM Trezor send: **BUILT** → `verified` after real Sepolia txid
- BTC Trezor send: **BUILT** → `verified` after real BTC testnet txid
- SOL Trezor send: **BUILT** → `verified` after real SOL devnet txid
