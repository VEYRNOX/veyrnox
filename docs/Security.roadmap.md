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
  contained, high value. **IMPLEMENTED (PROVISIONAL, testnet/demo).** Design:
  the decoy is a REAL, SEPARATELY-ENCRYPTED vault (its own BIP-39 mnemonic),
  encrypted/decrypted with the SAME crypto as the primary vault (vault.js,
  unchanged). It routes through the EXISTING unlock flow — `WalletProvider.unlock`
  tries `keyStore.unlock` first and, only on failure, consults the decoy
  (`wallet-core/duress.js`), re-throwing the ORIGINAL error on a miss so the
  prompt gives no tell. Delivers RUNTIME deniability (identical UI / error text /
  work-per-attempt). HONEST LIMITS (flagged for audit): NOT hidden-volume storage
  (forensic inspection can see a second blob exists); a "no decoy configured"
  state does 1 KDF vs 2 when one exists (feature-presence, not contents, is
  timeable); native hardware-backed decoy slot not yet wired (web/demo today).
  See `src/wallet-core/duress.js`, `src/pages/DuressPin.jsx`.
  - **DECOY BALANCE (follow-up).** The decoy can now hold + display a small,
    REAL, block-explorer-verifiable testnet balance so it is plausible under
    coercion (an empty decoy is suspicious). The balance is resolved by
    `src/lib/decoyBalance.js`: a live on-chain `eth_getBalance` read on
    real/native (same source of truth as the rest of the wallet — never a
    hardcoded UI number), and a SEEDED amount in demo (a fresh decoy address
    can't hold live funds on a simulator) clearly labelled "demo — simulated".
    The page shows the decoy address + live balance + faucet hint so the user
    can fund it with an amount they're willing to sacrifice. Added honest
    plausibility limits in-UI (no tx history = less lived-in; sophisticated
    coercers; provisional pending audit). Deniability properties unchanged.
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
  (plausible deniability). Pairs with Duress PIN. **IMPLEMENTED (PROVISIONAL,
  testnet/demo).** Design: a user creates one or more HIDDEN wallets that never
  appear in the normal UI (no list, no count, no indicator) and are revealed only
  by typing their dedicated secret at the EXISTING unlock prompt — `WalletProvider
  .unlock` tries `keyStore.unlock`, then the duress decoy, then the stealth reveal
  (`wallet-core/stealth.js`), re-throwing the ORIGINAL error on a total miss so the
  prompt gives no tell. Each hidden wallet is a REAL, separately-encrypted vault
  (own BIP-39 mnemonic, vault.js crypto UNCHANGED). It is the DUAL of Duress (there
  the hidden thing is your real wallet; here the visible wallet is real and the
  hidden ones are extras). **Storage deniability — improves on the duress artifact
  tell:** hidden wallets live among a FIXED POOL of identical, vault-shaped slots
  (in the SAME `veyrnox-vault`/`vault` store); the rest are random CHAFF sized like
  a real encrypted mnemonic. AES-GCM ciphertext is indistinguishable from random,
  so a storage dump cannot tell which — or HOW MANY — slots are real vs chaff (the
  count is hidden, unlike duress's single keyed blob). The pool is seeded for EVERY
  wallet-bearing device, so its presence tracks "has a wallet" (universal), not
  "uses hidden wallets". Placement = slot `SHA-256(secret) mod N`; reveal runs
  exactly ONE KDF on that slot, so presence/count are not timeable. HONEST LIMITS
  (flagged for audit): NOT a hidden volume — a forensic compare against a pristine
  install can see the POOL exists (just not its real-vs-chaff contents/count); no
  claim to defeat statistical blob analysis; write-time snapshotting (before/after)
  can catch a chaff→real change; rare two-secrets-one-slot collision overwrites the
  earlier wallet (no enumerable index is kept ON PURPOSE — an index readable with
  the main password would let a coercer enumerate hidden wallets — so a forgotten
  secret = an unrecoverable wallet); native hardware-backed pool not yet wired
  (web/demo today). See `src/wallet-core/stealth.js`, `src/pages/StealthWallets.jsx`,
  `scripts/verify-stealth.mjs`.
  - **MOVE AN EXISTING WALLET INTO HIDDEN (follow-up — RISKIER VARIANT, needs
    audit).** Beyond creating a *fresh* hidden wallet, the user can move a wallet
    they already have into the pool: `moveWalletToHidden(mnemonic, secret)` reuses
    the EXACT same store path as `createHiddenWallet` (ensure pool → secret-derived
    slot → `encryptVault` → put), so the resulting slot is byte-shaped identically
    to a fresh hidden wallet and to chaff — pool size, hidden count, one-KDF reveal,
    and identical-error-on-miss are ALL unchanged. The user supplies the wallet's
    recovery phrase (the app holds only public data for visible wallets); an EVM
    address-match guards that you can only hide a wallet you control, and a clobber
    guard refuses to overwrite a different wallet already under that secret. The
    move SELF-VERIFIES the wallet is revealable BEFORE the UI purges its visible
    record, so a wallet can never be deleted-from-view yet not hidden.
    - **TRANSITION TELL (the key honest limit, warned in-UI + flagged for audit):**
      hiding a *previously-visible* wallet is WEAKER than a fresh hidden wallet. A
      coercer who saw the app before can notice the wallet is now gone and demand it
      back, and a BEFORE/AFTER device comparison can detect both the removed visible
      record AND the one slot that changed from chaff→real. A fresh hidden wallet
      leaves nothing to miss; this variant is for wallets the adversary has NOT
      catalogued. The UI requires an explicit acknowledgement before proceeding.
    - **RESIDUAL-ARTIFACT ANALYSIS (honest).** On move we delete the visible `Wallet`
      record (label, address, cached balance) and invalidate its query caches → no
      leftover reference in the normal in-app UI. Remaining artifacts: (1) the stealth
      slot changed chaff→real (same write-time limit as a fresh hidden wallet);
      (2) the *absence* of the previously-present visible record is itself detectable
      by before/after comparison; (3) in real/native builds the `Wallet` entity is
      backend-synced, so a backend that logs deletions could show "a wallet record
      was removed at T" (a server-side tell outside the device); (4) on-chain the
      address/history stay public forever; (5) we do NOT scrub cross-references such
      as past `Transaction` records or address-book entries that mention the address
      (scrubbing history would itself be suspicious) — a thorough inspector could
      infer the wallet from those. In DEMO the visible list is an in-memory mock, so
      after a reload nothing persists. Provisional; this path specifically needs
      audit scrutiny. See `moveWalletToHidden` / `peekHiddenWallet`.
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
