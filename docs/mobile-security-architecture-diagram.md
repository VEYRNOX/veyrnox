# Veyrnox Mobile Security Architecture Diagram

This diagram is implementation-backed and aligned to the current mobile architecture in:

- [mobile-security-architecture.md](/Users/aljobson/Documents/GitHub/veyrnox/docs/mobile-security-architecture.md)
- [src/wallet-core/keystore/index.js](/Users/aljobson/Documents/GitHub/veyrnox/src/wallet-core/keystore/index.js)
- [src/wallet-core/keystore/native.js](/Users/aljobson/Documents/GitHub/veyrnox/src/wallet-core/keystore/native.js)
- [src/wallet-core/vault.js](/Users/aljobson/Documents/GitHub/veyrnox/src/wallet-core/vault.js)
- [src/lib/WalletProvider.jsx](/Users/aljobson/Documents/GitHub/veyrnox/src/lib/WalletProvider.jsx)
- [src/pages/SendCrypto.jsx](/Users/aljobson/Documents/GitHub/veyrnox/src/pages/SendCrypto.jsx)
- [src/lib/WalletConnectProvider.jsx](/Users/aljobson/Documents/GitHub/veyrnox/src/lib/WalletConnectProvider.jsx)
- [src/components/SecurityAdvisor.jsx](/Users/aljobson/Documents/GitHub/veyrnox/src/components/SecurityAdvisor.jsx)

## Primary Diagram

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "background": "#f5f1e8",
    "primaryColor": "#d8e7df",
    "primaryTextColor": "#14281d",
    "primaryBorderColor": "#3d6b57",
    "secondaryColor": "#e3edf4",
    "secondaryTextColor": "#13212b",
    "secondaryBorderColor": "#47657a",
    "tertiaryColor": "#f4e2c7",
    "tertiaryTextColor": "#2b2113",
    "tertiaryBorderColor": "#8a6a2f",
    "lineColor": "#4b5b66",
    "fontFamily": "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
  }
}}%%
flowchart TB

  classDef trust fill:#d8e7df,stroke:#3d6b57,stroke-width:2px,color:#14281d;
  classDef native fill:#dce7f0,stroke:#47657a,stroke-width:2px,color:#13212b;
  classDef crypto fill:#f4e2c7,stroke:#8a6a2f,stroke-width:2px,color:#2b2113;
  classDef runtime fill:#eadff0,stroke:#6d4f7f,stroke-width:2px,color:#24172d;
  classDef gate fill:#f0d9d6,stroke:#8a4e45,stroke-width:2px,color:#2f1713;
  classDef external fill:#d8ddd6,stroke:#5c6955,stroke-width:2px,color:#1d2419;
  classDef advisory fill:#f6e7d8,stroke:#a36a2f,stroke-width:2px,color:#35200f,stroke-dasharray: 4 2;

  User[User PIN / Password]:::trust
  Biometric[OS Biometric / Device Unlock UX]:::native
  H[Hardware Factor H<br/>Secure Enclave / Android Keystore path]:::native
  C[Factor C<br/>Argon2id-derived from PIN/password]:::crypto
  KEK[KEK = HKDF(H || C)]:::crypto
  DEK[DEK unwrap / rewrap]:::crypto
  Vault[Encrypted Vault<br/>AES-256-GCM + authenticated metadata]:::crypto

  subgraph NativeBoundary[Native Security Boundary]
    direction TB
    KeyStoreFacade[keyStore native facade]:::native
    NativeStore[Native secure storage persistence]:::native
    NativePlugin[HardwareKek native plugin]:::native
    RASPProbe[Native probe / attestation bridge]:::native
  end

  subgraph WebViewBoundary[WebView / JS Runtime Boundary]
    direction TB
    WalletProvider[WalletProvider unlocked session<br/>mnemonic held transiently in memory]:::runtime
    EVMKey[Derive EVM key on demand]:::runtime
    BTCKey[Derive BTC key on demand]:::runtime
    SOLKey[Derive SOL key on demand]:::runtime
    SendGate[SendCrypto sign-time gates<br/>recipient, amount, limits, risk, fresh RASP, 2FA]:::gate
    WCGate[WalletConnect sign-time gates<br/>session, chain binding, address binding, fee caps, fresh RASP]:::gate
  end

  subgraph ExternalBoundary[Untrusted / External Surfaces]
    direction TB
    RPC[RPC providers / broadcast network]:::external
    DApp[WalletConnect peers / dApps]:::external
  end

  subgraph AdvisoryBoundary[AI Security Advisor Boundary]
    direction TB
    Banner[SecurityAdvisorBanner<br/>local threat-intel warning]:::advisory
    Advisor[SecurityAdvisor drawer<br/>advisory-only guidance]:::advisory
    Knowledge[Local advisor knowledge base]:::advisory
    Consent[Explicit remote advisor consent]:::advisory
    Scrubber[Secret scrubber / context minimizer]:::advisory
    TIP[TIP-backed online advisor<br/>optional remote answers]:::external
  end

  User --> C
  Biometric --> H
  H --> KEK
  C --> KEK
  KEK --> DEK
  DEK --> Vault

  Vault <--> NativeStore
  NativeStore --> KeyStoreFacade
  NativePlugin --> H
  KeyStoreFacade --> WalletProvider
  RASPProbe --> SendGate
  RASPProbe --> WCGate

  WalletProvider --> EVMKey
  WalletProvider --> BTCKey
  WalletProvider --> SOLKey

  EVMKey --> SendGate
  BTCKey --> SendGate
  SOLKey --> SendGate
  EVMKey --> WCGate

  SendGate --> RPC
  WCGate --> DApp
  WCGate --> RPC

  SendGate --> Banner
  SendGate --> Advisor
  Advisor --> Knowledge
  Advisor --> Consent
  Advisor --> Scrubber
  Consent --> TIP
  Scrubber --> TIP

  class NativeBoundary native;
  class WebViewBoundary runtime;
  class ExternalBoundary external;
  class AdvisoryBoundary advisory;
```

## Legend

- `Green` trusted user / control inputs
- `Blue` native security boundary and platform-backed capability
- `Amber` cryptographic material and protected storage
- `Purple` live JS/WebView runtime where the unlocked wallet session exists
- `Red` sign-time enforcement and policy gates
- `Grey` external or untrusted surfaces
- `Dashed amber` advisory-only AI security surfaces, outside the custody/signing trust core

## Reading Notes

- The vault is strongly protected at rest, and native hardware materially strengthens unlock.
- The unlocked mnemonic still crosses into the JS runtime inside `WalletProvider`.
- EVM/BTC/SOL signing flows are policy-gated at send time, but the runtime boundary is still the WebView.
- The AI Security Advisor is visually and architecturally separated because it is advisory-only and not part of the signing trust root.
