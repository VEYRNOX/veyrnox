# Security Roadmap (S1–S4)

> The product's focus is SECURITY. This sorts the security-leaning features
> (drawn from the veyrnox.com page list) into a realistic, tiered build plan for
> a NON-CUSTODIAL wallet — keeping the features that protect the USER (real,
> buildable, no licensing downside) and explicitly EXCLUDING operator-compliance
> machinery (VASP/KYC) that would break the non-custodial exemption.
>
> Timescales are rough, assume you + Claude Code (not a team), and EXCLUDE the
> independent audit and per-feature hands-on verification (both substantial for
> security features). Treat as relative effort, not promises.
>
> Standing rules (unchanged): testnet only; mainnet gated until audit; each
> phase = own design doc + branch + PR + review; cryptographic features get
> explicit audit attention. Security features ENLARGE the audit scope — budget
> for it.

---

## The line that governs everything: user-security vs operator-compliance

- **Security features (BUILD):** protect the user — hardware key storage,
  biometrics, duress PIN, approval revocation, address-poisoning warnings,
  session control, hardware-wallet support, RASP. Pure upside, no licensing
  implications, reinforce the non-custodial + store-approvable posture.
- **Compliance/VASP features (DO NOT BUILD for this product):** KYC, VASP
  compliance, Travel Rule, AML monitoring, geo-blocking, identity/DID. These are
  obligations of a REGULATED operator. Building them signals you're a VASP and
  can CREATE the licensing obligation (FinCEN MSB / MiCA CASP / FCA) you are
  deliberately avoiding — and undermine Google's non-custodial exemption +
  Apple's storage-only lane. NOT user-security. See "Explicitly excluded" below.
  (Legal classification is a LAWYER question — see Track B in MVP.roadmap.md.)

## AI guardrails (the hard line for ANY AI in this wallet)
AI is useful ONLY as an ADVISOR/EXPLAINER. The non-negotiable rules:
- **AI NEVER has access to the seed/private keys**, and NEVER signs or moves
  funds autonomously. Only the user controls keys; AI proposes, the user reviews
  the real decoded tx and signs. Any "AI that transacts for you" breaks self-
  custody (and, if swapping/trading, drags into regulated territory) — EXCLUDED.
- **Data/privacy architecture is an explicit decision:** cloud LLM = user data
  leaves device (never send keys; prefer on-device or scoped no-key calls).
  Disclose what goes where. A wallet that phones home is itself a privacy risk.
- **Advisory framing:** AI warnings INFORM, never GUARANTEE safety.
- USEFUL AI roles (all advisory): plain-language transaction explanation, scam/
  phishing explanation, education ("what is gas/this approval?"), portfolio Q&A
  over PUBLIC on-chain data. These ENHANCE security; they don't add a new product.
- EXCLUDED: AI trading bots / auto-management / autonomous agents that transact.

---

## S1 — Foundation security (bedrock; overlaps mobile M2)
~3–4 weeks. The base everything else relies on.
- **M2 native secure storage + biometrics** — Secure Enclave/Keychain (iOS) +
  Android Keystore/StrongBox; biometric unlock. (Full spec: docs/M2.secure-
  storage.md. Covers the site's "Biometric Auth" + "Samsung Keystore" pages.)
- **Session Manager** — list/revoke active sessions; auto-lock on idle / app-
  background; clear in-memory secret on lock. (Tightens the JS key-lifetime
  limitation from SECURITY_SELFREVIEW_FINDINGS.md.)
- **FIDO2 / Passkeys** (design WITH M2 — same hardware-backed family). The site
  already advertises "featuring FIDO", so make it real. CRITICAL distinction —
  a passkey is an AUTH credential, NOT the wallet's signing key (which derives
  from the BIP-39 seed). Two implementation levels:
    - **Level 1 — auth/unlock (moderate, ~1–2 wks):** passkey gates app unlock /
      session / transaction initiation. Clean upgrade over passwords; on mobile
      the platform authenticator IS the Secure Enclave/Keystore + biometrics, so
      it dovetails with M2. Be honest in marketing: this is "passkey unlock", not
      "passkey-secured keys".
    - **Level 2 — passkey-protected vault (stronger, ~2–4 wks + audit):** use the
      WebAuthn **PRF extension** to derive a stable secret from the authenticator
      and use it to unlock/derive the vault-encryption key — so the hardware
      passkey becomes a real factor protecting the SEED (password no longer the
      sole factor). This is the genuinely strong "FIDO-secured wallet" claim.
  - **MUST design deliberately:** PRF support is not universal → REQUIRE a
    password fallback for non-PRF authenticators. Decide device-bound vs synced
    passkeys (iCloud Keychain / Google Password Manager). 
  - **The hard one — recovery/device-loss:** if a passkey protects the seed and
    the device is lost, how does the user recover? This is the most dangerous
    thing to get wrong (lock-out = lost funds). Design explicitly; it intersects
    with Social Recovery (S3). 
  - AUDIT NOTE: Level 2 is cryptographic → its own audit attention.
- Finish core: HD Wallet Manager, Wallet Seed QR, Import Private Key (mostly done).
- AUDIT NOTE: M2 is security-critical → strict pre-merge review + in audit scope.

## S2 — Transaction safety (high user-protection; reuses calldata work)
~3–4 weeks.
- **Token Approvals** — view + REVOKE ERC-20 allowances (the top drain vector).
  Reuses Phase B calldata/approval logic.
- **Suspicious Address Checker** — screen recipient vs known-scam lists + warn on
  look-alike / address-poisoning. Integrate a REPUTABLE THREAT-INTEL FEED
  (e.g. Blockaid / Wallet Guard / ScamSniffer-style) for malicious address +
  contract + phishing-domain screening.
  - **PRIVACY TRADE-OFF (explicit design decision):** screening often means
    sending the address/tx to a 3rd-party API — leaks user intent off-device,
    which conflicts with a privacy-respecting self-custody wallet. Decide which
    checks run LOCALLY (downloaded lists) vs. call out, and DISCLOSE it. Some
    users choose wallets BECAUSE they don't phone home.
  - **Framing:** warnings INFORM, never GUARANTEE ("we couldn't verify this", not
    "this is safe") — avoids false-assurance trust/liability.
- **Transaction simulation (HIGHEST-VALUE drainer defense)** — show the user the
  ACTUAL effect before signing ("this will transfer ALL your USDC / grant
  unlimited approval to X"). Catches the drainer attacks that steal the most
  funds. Nontrivial — typically needs a simulation provider (Tenderly / Blockaid-
  style); core of the Phase D safety work, but a scoped version belongs here.
- **Spam Token Filter** — hide airdropped scam tokens.
- **Address-poisoning warnings** wired into the send flow.
- **AI-assisted explanation (ADVISORY ONLY — see AI rules below)** — translate
  decoded calldata / sim results into plain language ("this grants permission to
  spend all your USDC — unusual, proceed?"). Enhances the above; the AI NEVER
  has keys and NEVER signs. (Architecture/privacy decision: see "AI guardrails".)
- AUDIT NOTE: these shape what the user signs/sees — UI-deception bugs are in
  scope; review carefully.

## S3 — Access & recovery
~3–4 weeks (Social Recovery pushes this longer + needs its own audit attention).
- **Duress PIN** — decoy PIN opens an empty/fake wallet under coercion. Self-
  contained, high value.
- **Hardware Wallet support** — Ledger/Trezor connect via established libs
  (strongest key security for power users).
- **Login Activity** (+ map) — show recent access events (needs backend to record).
- **Social Recovery** (OPTIONAL, heavier) — guardian / Shamir's-Secret-Sharing
  recovery. Cryptographically nontrivial → ~3–4 weeks ALONE and **must get its
  own audit attention** (a flaw here loses or leaks the seed).
- **Crypto Will / inheritance** ◈ — self-custody only (built on social-recovery /
  secret-sharing + dead-man's-switch; NEVER custodial, NEVER adjudicates death).
  High cryptographic risk + LEGAL/estate dimensions → audit attention AND a lawyer.
- **Stealth / hidden wallets** ◈ — wallets revealed only by a specific PIN
  (plausible deniability). Pairs with Duress PIN.
- **Panic wipe** ◈ — emergency local destruction of key material.

### S3 — TREASURY / BUSINESS cluster (⚑ — the Direction-B wedge)
> ⚑ These are NOT consumer features. They only matter if Veyrnox commits to the
> BUSINESS/TREASURY audience (most fundable wedge — incumbents don't compete,
> businesses PAY = revenue model). If that wedge is chosen, this cluster moves to
> an EARLY dedicated phase (right after Foundation) because for that audience it
> IS the product, not a security add-on. See docs/WalletRoadmap.md WEDGE NOTE.
- **Multi-sig wallets (2-of-3, 3-of-5)** ⚑◈ — cryptographic; own audit attention.
- **Multi-sig TREASURY (org-grade)** ⚑ — shared treasury with controls.
- **Approval workflows** ⚑ — proposer → approver(s) → execute, with audit trail.
- **Role-based / multi-user access** ⚑ — propose vs approve vs view permissions.
- **Spending policies / daily limits** ⚑◈ — caps + rules on what can move.
- **Time-locks** ⚑◈ — delayed execution on moves (anti-theft / anti-coercion).
- **Address allowlists** ⚑◈ — send only to pre-approved addresses.

## S4 — Hardening & monitoring
~3–4 weeks.
- **RASP** (Runtime App Self-Protection) — jailbreak/root/tamper/debugger/emulator
  detection on mobile; warn/lock on compromise. Via a mobile security SDK or
  vetted libs. Pure defensive tech, NO regulatory downside; helps store review.
- **Audit Log** — record of security-relevant actions (needs backend).
- **Wallet Risk Limits / Risk Scoring** — rule-based send limits / risk flags.
  Start simple (rules), evolve.
- **Encrypted Cloud Backup** — back up the CIPHERTEXT vault only (NEVER plaintext
  keys). Security-sensitive → audit attention; verify no plaintext ever leaves
  device.
- **Fraud/Anomaly Detection** — meaningful versions are ONGOING (data + heuristics),
  not a fixed N-week task. Start rule-based.
- **Compliance / governance EXPORT** ⚑ — exportable records of treasury actions
  for accounting/governance. RECORDS ONLY — explicitly NOT KYC/identity (which
  stays excluded below). Pairs with the ⚑ treasury cluster.
- **No-telemetry / fully-local mode** ◈ — a provable "phones home to no one" mode.
  A real claim incumbents (with their threat-intel APIs) can't make; differentiator
  for high-threat/privacy users. Tension with online scam-screening (S2) — make
  the trade-off a user choice.
- **Privacy routing** ◈ — Tor / RPC-privacy options for high-threat users.

## Then: freeze → independent audit → fix → ship
- The audit now covers S1–S4 (esp. M2, Social Recovery, Cloud Backup) — this is
  MORE than the EVM-only estimate (~$7k–$30k). Re-scope/quote accordingly
  (docs/Audit.scope.md).
- Cryptographic features (M2, Social Recovery, Cloud Backup) get hands-on
  verification AND explicit auditor focus — bugs there lose funds.

---

## Explicitly EXCLUDED (do NOT build for this non-custodial product)
These site pages sound security/compliance but contradict the strategy:
- **VASP Compliance, KYC, KYC/VASP Admin, Compliance Rules, Geo Blocking,
  Identity Management, DID Management** — operator-compliance / regulated-entity
  machinery. Building them can CREATE VASP/licensing obligations and break the
  non-custodial exemption. NOT user-security. Lawyer question, not a build task.
- **Security Admin Dashboard, Super Admin, Telemetry Admin, Institutional
  Custody, Trust Score** — admin/enterprise/ops or custodial. Custody breaks
  non-custodial. Skip for MVP.

> If the business ever pivots to a custodial/exchange model, that's a DIFFERENT
> product with licensing — led by lawyers, not the codebase — and a re-architecture.

---

## Realistic shape
Even this disciplined security subset (S1–S4) is ~2–4 MONTHS for you + Claude
Code, PLUS a larger audit. It also runs alongside the mobile (M1/M2) and (if you
proceed) BTC/SOL work — that's a lot of parallel fronts. SEQUENCE deliberately;
don't spread thin. Suggested: S1 (with mobile M2) → S2 → S3 → S4, with BTC/SOL
slotted as separate crypto phases per your call.

## The honest payoff
A non-custodial multi-chain wallet with hardware-backed keys, biometric +
duress-PIN access, approval revocation, address-poisoning protection, hardware-
wallet support, session control, and RASP — all AUDITED — is a legitimately
strong, differentiated, SELLABLE security wallet. That focused reality beats 170
hollow feature pages, and it's the version an acquirer's due diligence rewards.

## Related docs
- docs/M2.secure-storage.md — S1's core
- docs/Audit.scope.md — update scope as S1–S4 land
- docs/MVP.roadmap.md — how security fits the whole program (incl. legal Track B)
- docs/SECURITY_SELFREVIEW_FINDINGS.md — current verified-state of the core
