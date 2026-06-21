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
>
> STATUS (verified vs code on `main`, 2026-06-03): S1 ✅ largely built, S2 ✅ core
> built, S3 deniability stack ✅ built (PROVISIONAL, testnet/demo), S4 🟡 first
> item built (audit log). ALL security features remain PROVISIONAL pending the independent audit.
> Markers: ✅ built · 🟡 partial · 📋 specced · 💡 idea · ❌ removed. At-a-glance
> truth: **docs/Feature-Status.md** (authoritative when docs disagree).

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

## No-autonomous-value rule (applies to EVERY feature, not just AI)
**No feature may move value or mutate balances without a user signature through
wallet-core signing.** Every transaction is signed by the user with their own
keys (the `signing.js` / vault path); nothing transacts autonomously. Concretely:
- NO feature may call `base44.entities.Wallet.update({ balance })` (or any balance
  mutation) to "execute" a buy/sell/payment/transfer. Balances are derived from
  the chain, which is the source of truth (see the Send flow in `SendCrypto.jsx`:
  it records the REAL chain hash and never writes balances).
- NO feature may fabricate a `confirmed`/`completed` transaction record to stand
  in for a real signed broadcast.
- **Demo-mode shortcuts must NEVER carry over to the mainnet path.** Backend
  balance mutations are acceptable ONLY as throwaway demo scaffolding and must be
  replaced by user-signed wallet-core flows before any mainnet wiring.
- A feature that transacts autonomously = OUT OF SCOPE (spec §C) and breaks
  self-custody — the same hard line as the AI guardrails above.

History: `Rebalance`/`Rebalance History` were removed and `Recurring Payments`
had its auto-debit path gutted (now schedule/reminder only, hands off to Send for
user signing) for violating this rule — **PR #47 is MERGED on `main`** (gap closed).
(`AIRebalancer` remains as ADVISORY-ONLY LLM recommendations — it never moves funds,
so it is allowed, not a violation.)

---

## S1 — Foundation security (bedrock; overlaps mobile M2)
~3–4 weeks. The base everything else relies on.
> ✅ BUILT (PROVISIONAL): biometric unlock (app-layer gate), passkey Level-1
> unlock gate (+ password escape hatch — SAST M-3), session manager + auto-lock,
> KDF work-factor raise + param migration (M3). 🟡 native secure storage (M2b
> app-layer; OS-enforced M2c/M2d still 📋). ✅ account access / change password +
> seed recovery (PR #50, non-custodial). 📋 passkey Level-2 PRF vault-protect.
- **M2 native secure storage + biometrics** — Secure Enclave/Keychain (iOS) +
  Android Keystore/StrongBox; biometric unlock. (Full spec: docs/M2.secure-
  storage.md. Covers the site's "Biometric Auth" + "Samsung Keystore" pages.)
  - [ ] Native keystore biometric gating — independent audit on real iOS + Android devices (deferred; pending Android build milestone)
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
    thing to get wrong (lock-out = lost funds). Design explicitly. (Note: Social
    Recovery, once the intended fallback here, is ❌ removed — so device-loss
    recovery rests on the user's own seed backup + the account-access seed-recovery
    path, not guardians.) 
  - AUDIT NOTE: Level 2 is cryptographic → its own audit attention.
- Finish core: HD Wallet Manager, Wallet Seed QR, Import Private Key (mostly done).
- AUDIT NOTE: M2 is security-critical → strict pre-merge review + in audit scope.
- **At-rest KDF work factor raised + parameter migration** ◈ — **IMPLEMENTED.**
  ⚠️ **THE CHOSEN PARAMETERS REQUIRE INDEPENDENT AUDIT VALIDATION.** ⚠️ Addresses
  SAST finding **M3**: on web the password is the SOLE factor protecting the seed
  (no hardware key-wrap; `web.js isSecureHardwareAvailable() === false`), and the
  vault KDF is not gating an interactive login — it stands between an exfiltrated
  ciphertext blob and the seed, offline and GPU/ASIC-crackable. 64 MiB / t=3 cleared
  only the OWASP interactive-login floor, low for this threat.
  - **OLD → NEW:** Argon2id `memorySize` **64 MiB → 192 MiB** (`65536 → 196608`
    KiB), `iterations` 3, `parallelism` 1, `hashLength` 32. ~3× memory-hardness
    (memory is the lever against parallel cracking hardware). Deliberately balanced
    for a phone rather than maxed: measured unlock-KDF latency (desktop browser,
    native WASM) 64 MiB ~160 ms → 192 MiB ~440 ms; a low-end phone runs ~2–4× slower
    (~1–1.7 s), tolerable for an infrequent seed-vault unlock. A flat 256 MiB
    (~720 ms desktop, ~2–3 s low-end phone + webview memory pressure) was rejected as
    too aggressive WITHOUT per-device tuning.
  - **MIGRATION (no lockout).** `decryptVault` now derives with the params recorded
    in EACH blob (`paramsFromVault`), so vaults written at 64 MiB still open. After a
    successful unlock, `webKeyStore.unlock` transparently re-encrypts at the new
    params (`vaultNeedsRekey` → `encryptVault` → `saveVault`), upgrade-only and
    best-effort (a failed rekey never blocks unlock; it retries next time). This
    mechanism also EXISTS so the audit can later raise the params (e.g. to 256 MiB on
    capable devices, tuned by device class) without locking anyone out.
  - **⚠️ AUDIT MUST VALIDATE:** the chosen point on the security/unlock-latency curve
    against real low-end hardware, ideally adding per-device-class tuning; that the
    migration cannot strand or downgrade a vault; and enforcing a real password-
    strength floor (zxcvbn-style) at vault creation, since the KDF only raises the
    bar — it cannot rescue a weak password. `KDF_PARAMS` is exported so the stealth
    chaff pool advertises the SAME params (else chaff vs real blobs would differ by
    their `kdf` field — a deniability tell).
  - **TEST.** `src/wallet-core/__tests__/vault-migration.test.js` — old-params vault
    still decrypts; new vaults record new params; `vaultNeedsRekey` flags correctly;
    `webKeyStore.unlock` migrates on first unlock (and is a no-op after); a wrong
    password neither migrates nor leaks. See `src/wallet-core/vault.js`,
    `src/wallet-core/keystore/web.js`, `src/wallet-core/stealth.js` (chaff params).

## S2 — Transaction safety (high user-protection; reuses calldata work)
~3–4 weeks.
> ✅ BUILT: token approvals view + REVOKE; address-poisoning / look-alike
> warnings (wired into send, informs-not-blocks); spam-token filter; calldata
> decode + unlimited-allowance warning; per-chain recipient address validation;
> transaction simulation (LOCAL-first pre-sign preview, `simulate.js`); anomaly /
> fraud detection (LOCAL heuristics `anomaly.js`, PR #54); Security Dashboard
> (read-only posture view, PR #53). ✅ suspicious-address screening (local
> on-device blocklist + OFAC sanctions snapshot, PR #70/#71). 📋 NOT BUILT: remote
> threat-intel feed (deferred on privacy grounds); dApp security alerts; AI explanation.
- **Token Approvals** — view + REVOKE ERC-20 allowances (the top drain vector).
  Reuses Phase B calldata/approval logic.
- **Suspicious Address Checker** — ✅ BUILT (LOCAL-ONLY). The privacy trade-off below was decided in favour of NO phone-home: screening runs against on-device lists, not a third-party API. `evm/suspicious.js` is a pluggable-provider screen wired into the send risk assessment; `screenAddress` routes by family so EVM and BTC are both screened at runtime. Two local providers ship: a general blocklist (PR #70; burn sinks + a sanctioned address, scam/drainer categories deliberately EMPTY pending a maintained feed — no fabricated entries) and an OFAC sanctions provider (PR #71) over a bundled, dated OFAC SDN snapshot (`data/ofac-sanctioned.json`, rebuildable via `scripts/refresh-ofac-blocklist.mjs`; delisting-aware, e.g. Tornado Cash excluded post-2025; SOL not covered). Warns-not-blocks, never claims "safe". OFAC shipping is gated on legal review (sanctions data in a financial product).
  - **REMOTE threat-intel feed (Blockaid / Wallet Guard / ScamSniffer-style)** — 📋 NOT BUILT, deliberately deferred. Such a feed means sending the address/tx to a 3rd-party API — leaking user intent off-device, which conflicts with a privacy-respecting self-custody wallet. If ever added it must be an off-by-default, disclosed opt-in; the local screen above is the always-on default.
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
~3–4 weeks. (Social Recovery — which would have pushed this longer — is ❌ removed;
see the removed record under "Explicitly EXCLUDED".)
> ✅ BUILT (PROVISIONAL, testnet/demo): Duress PIN, Stealth/hidden wallets,
> Panic wipe, constant-KDF unlock timing (details below). 📋 NOT BUILT: Hardware
> wallet (UI shell only), Login activity (UI shell only), Crypto Will/inheritance.
> ❌ REMOVED: Social Recovery (audit-blocked, never shipped), Multi-Sig
> (UI shell w/ fake addresses; page/route/nav/catalogue deleted) — see the
> removed record in "Explicitly EXCLUDED" below.
- **Duress PIN** ✅ — decoy PIN opens an empty/fake wallet under coercion. Self-
  contained, high value. (`src/wallet-core/duress.js`.)
- **Hardware Wallet support** — Ledger/Trezor connect via established libs
  (strongest key security for power users).
- **Login Activity** (+ map) — show recent access events (needs backend to record).
- **Social Recovery** (guardian / Shamir's-Secret-Sharing) — ❌ REMOVED
  [audit-blocked-and-not-advertised]. Cryptographically nontrivial, never shipped,
  no longer advertised; removed from UI/catalogue. (A flaw here would lose or leak
  the seed — it stays out until/unless a dedicated audited design is greenlit.)
- **Crypto Will / inheritance** ◈ — self-custody only (secret-sharing +
  dead-man's-switch design; NEVER custodial, NEVER adjudicates death). High
  cryptographic risk + LEGAL/estate dimensions → audit attention AND a lawyer. 📋
  roadmap (not near-term).
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
  - **MULTI-CHAIN IDENTITY (follow-up).** A revealed hidden wallet now shows its
    full EVM + BTC + SOL identity, not just ETH. Because a hidden wallet is a real
    BIP-39 wallet, its BTC (BIP-84 testnet) and SOL (ed25519 devnet) addresses come
    from the EXISTING derivation (`deriveBtcAddress`/`deriveSolAddress` — the same
    paths `WalletProvider.deriveBtc/deriveSol` use for the primary wallet); on
    reveal the provider already populates `btcAccount`/`solAccount`, so no new
    derivation or crypto is added. Deniability is UNCHANGED: deriving extra
    addresses is pure local computation that writes nothing — the uniform slot
    pool, hidden count, and identical-error-on-miss all hold (asserted in tests).
    PRIVACY: a hidden-wallet balance query is a PHONE-HOME surface (it contacts a
    public RPC/Esplora node and reveals an address; checking ETH+BTC+SOL could let
    nodes correlate them). The wallet has no private/local balance path yet (S4),
    so balance checks are OPT-IN/manual — revealing a hidden wallet is network-
    silent; the UI fetches only on an explicit tap and says so. HONEST LIMIT kept
    in-UI for all three chains: stealth hides a wallet IN THE APP, not ON-CHAIN
    (the addresses are public on explorers). See `src/lib/hiddenBalance.js`.
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
- **Panic wipe** ◈ — emergency local destruction of key material. **IMPLEMENTED
  (PROVISIONAL, testnet/demo) — ⚠️ DESTRUCTIVE + SAFETY-CRITICAL, FLAGGED FOR
  SPECIFIC AUDIT SCRUTINY.** For a user under threat who needs to ensure nothing
  is recoverable from the device. The destructive counterpart to Duress + Stealth:
  where those HIDE keys, this DESTROYS them. Routes through the existing
  keystore/WalletProvider; the primitive lives in `src/wallet-core/panic.js`
  (vault.js / vaultStore.js / signing.js UNCHANGED — it reuses encryptVault/
  decryptVault for the panic marker and re-opens the shared IndexedDB by name,
  plain storage plumbing only).
  - **TWO TRIGGERS (the misfire/threat-model tradeoff, documented).**
    (1) **Panic/wipe PIN at unlock** (primary, duress-appropriate): a dedicated PIN
    entered at the SAME unlock prompt as every other secret fires the wipe with
    **NO confirmation** — under genuine duress a "are you sure?" dialog is a
    liability (a coercer can cancel it; it signals what's happening). Wired into
    `WalletProvider.unlock` as the FIRST fallback after the primary unlock fails
    (before duress + stealth), so a deliberate destroy intent is never shadowed;
    after the wipe it throws the SAME generic wrong-password error (no "wiped!"
    tell). MISFIRE PROTECTION: the marker is a real AES-GCM blob, so the wipe
    fires ONLY on an exact decrypt match (a wrong password can never trigger it);
    it is checked only AFTER the primary unlock fails (your REAL password never
    wipes); and it requires a deliberate ≥6-char PIN (vs duress's 4) chosen
    specifically to destroy. The accepted residual: a user who types EXACTLY their
    panic/wipe PIN by accident loses the local copy — mitigated by the length floor +
    "set it to something you'd never type" guidance, accepted because
    duress-usability requires no dialog. (2) **In-app guarded action**
    (deliberate, non-duress decommissioning): a type-to-confirm (`WIPE`) +
    acknowledgement-checkbox button on the PanicWipe page, where a confirmation IS
    appropriate (no coercion to design around).
  - **WHAT IT DESTROYS.** The WHOLE `veyrnox-vault`/`vault` store is `clear()`-ed
    (so a future-added key can't silently survive) AND the database is best-effort
    deleted: this removes the primary vault (`primary`), the duress decoy
    (`secondary`), the entire stealth pool (`vault:1..N`, real + chaff), and the
    panic marker (`tertiary`). It also clears the DEMO-only address-residue maps in
    localStorage (`veyrnox-decoy-demo-balances` / `veyrnox-hidden-demo-balances` —
    not key material, but they name addresses). On NATIVE (M2b) the hardware-backed
    primary vault lives outside IndexedDB, so `WalletProvider.panicWipe` ALSO calls
    `keyStore.clearVault()`. Then it drops the live in-memory secret (`lock()`).
  - **HONEST LIMITS (stated plainly to the user + flagged for audit).** Panic wipe
    destroys the **LOCAL device copy only**. A **seed backup the user holds
    elsewhere** (paper, password manager, another device) STILL recovers the wallet
    — INTENDED: wipe protects the *device*, not the *seed*. On-chain
    addresses/history stay public forever. Flash-media forensic recovery is OUT OF
    SCOPE — we delete logical IndexedDB records, NOT cryptographically sanitise the
    storage medium (wear-levelling/snapshots/swap); the mitigation is that only
    ciphertext (Argon2id + AES-GCM) was ever stored, so a recovered blob is still
    gated by the never-stored password. TIMING: like duress, when a panic/wipe PIN IS
    configured the unlock-miss path runs one extra KDF, so the *presence* (not the
    value) of a panic/wipe PIN is in principle timeable. Native hardware-backed
    duress/stealth still not wired (web/demo today). Provisional; this path needs
    specific audit scrutiny.
  - **RESIDUAL-STORAGE PROOF.** `inspectKeyMaterial()` (non-destructive) enumerates
    the vault store keys + residue maps and returns `{ indexedDbKeys, vaultBlobCount,
    localStorageResidue, clean }`. The PanicWipe demo snapshots it BEFORE (15 blobs:
    primary + secondary + tertiary + 12 stealth slots) and AFTER (empty, `clean:
    true`) to PROVE nothing recoverable remains. See `src/wallet-core/panic.js`,
    `src/pages/PanicWipe.jsx`, `scripts/verify-panic.mjs`,
    `src/wallet-core/__tests__/panic.test.js`. Tests 129→137.
- **Constant-KDF unlock timing across the deniability stack** ◈ — **IMPLEMENTED
  (PROVISIONAL).** ⚠️ **DENIABILITY-SECURITY CHANGE — REQUIRES INDEPENDENT AUDIT
  VALIDATION.** ⚠️ Addresses SAST finding **M2**: each deniability module
  (`panic.js`/`duress.js`/`stealth.js`) analyzed its OWN unlock timing correctly
  in isolation, but the COMBINED failed-unlock path ran a VARIABLE number of
  Argon2id KDFs depending on which features were configured (2 none / 3 duress-or-
  panic / 4 both, + the always-on stealth pool), and a successful duress unlock
  short-circuited before stealth — so an attacker timing a few wrong guesses at the
  prompt could infer the PRESENCE/COUNT of configured deniability features, exactly
  what they must hide.
  - **FIX.** `src/wallet-core/deniabilityUnlock.js` (`resolveDeniabilityUnlock`)
    runs a CONSTANT number of KDFs (exactly 3: panic + duress + stealth) on EVERY
    post-primary-miss resolution, regardless of configuration and with NO early-
    return short-circuit: an ABSENT panic/duress feature is padded with a DUMMY KDF
    on a throwaway chaff blob; the always-seeded stealth pool guarantees its reveal
    is one KDF. `WalletProvider.unlock` evaluates all paths, then branches on the
    results in priority order (panic > duress > hidden). A wrong password, a duress
    hit, a hidden hit, and a panic hit all cost a constant 4 KDFs (1 primary + 3).
  - **⚠️ WHY THIS NEEDS THE AUDIT (the blind spot).** This is a SELF-AUTHORED timing
    fix to self-authored timing code — precisely the confirmation-biased blind spot
    an independent audit exists to catch. The SAST claim and this fix rest on
    code-reading + KDF-cost reasoning + a KDF-COUNT test, **NOT** a real timing-
    harness measurement under device/scheduler/GC noise. The audit must (a) measure
    actual wall-clock timing on-device across configs, (b) validate the constant-
    count claim against the orchestration, and (c) assess the residuals below.
  - **RESIDUAL TIMING VARIANCE (documented, not eliminated).** (1) A CORRECT PRIMARY
    unlock returns after 1 KDF (never enters this path) and is faster than any other
    outcome — this leaks only "the typed secret was the primary password" (learnable
    only by someone who already holds it), NOT deniability-feature presence/count
    (every non-primary outcome is an identical 4-KDF cost); equalizing it would 4x
    every legitimate unlock, so we deliberately do not. (2) Non-KDF per-branch work
    (an extra IndexedDB GET, the GCM tag check, mnemonic derivation on a hit) differs
    by microseconds against ~100 ms KDFs — below the KDF-set measurement floor but
    not provably zero. (3) If the at-rest KDF params change (SAST M3), keep the
    dummy-KDF chaff blob's params in sync so the dummy COST still matches a real
    attempt (the COUNT is invariant regardless).
  - **TEST.** `src/wallet-core/__tests__/deniability-timing.test.js` wraps
    hash-wasm's `argon2id` to count real KDF invocations and asserts a constant 3
    across {none, duress, panic, both, hidden, all} configs on a wrong password,
    plus that duress/hidden/panic HITS cost the same (no short-circuit tell). See
    `src/wallet-core/deniabilityUnlock.js`, `src/lib/WalletProvider.jsx`.

### S3 — TREASURY / BUSINESS cluster (⚑ — the Direction-B wedge)
> ⚑ These are NOT consumer features. They only matter if Veyrnox commits to the
> BUSINESS/TREASURY audience (most fundable wedge — incumbents don't compete,
> businesses PAY = revenue model). If that wedge is chosen, this cluster moves to
> an EARLY dedicated phase (right after Foundation) because for that audience it
> IS the product, not a security add-on. See docs/WalletRoadmap.md WEDGE NOTE.
> NB: **Multi-Sig is ❌ removed** [audit-blocked-and-not-advertised] — it shipped
> only as a UI shell with fake addresses and its page/route/nav/catalogue were
> deleted. The rest of this cluster remains an unbuilt ⚑ wedge idea, contingent on
> a Multi-Sig core being designed + audited first.
- **Multi-sig wallets (2-of-3, 3-of-5)** — ❌ REMOVED [audit-blocked-and-not-advertised] (UI shell w/ fake addresses; page/route/nav/catalogue deleted).
- **Multi-sig TREASURY (org-grade)** ⚑ — shared treasury with controls (depends on a Multi-Sig core — currently removed).
- **Approval workflows** ⚑ — proposer → approver(s) → execute, with audit trail.
- **Role-based / multi-user access** ⚑ — propose vs approve vs view permissions.
- **Spending policies / daily limits** ⚑◈ — caps + rules on what can move.
- **Time-locks** ⚑◈ — delayed execution on moves (anti-theft / anti-coercion).
- **Address allowlists** ⚑◈ — send only to pre-approved addresses.

## S4 — Hardening & monitoring
~3–4 weeks.
> 🟡 FIRST ITEM BUILT — Audit Log implemented (PR #72, local/in-vault); RASP / Risk Limits /
> Cloud Backup / Anomaly Detection exist only as UI shells. No-telemetry mode +
> privacy routing remain 💡 ideas.
- **RASP** (Runtime App Self-Protection) — jailbreak/root/tamper/debugger/emulator
  detection on mobile; warn/lock on compromise. Via a mobile security SDK or
  vetted libs. Pure defensive tech, NO regulatory downside; helps store review.
- **Audit Log** — 🟡 BUILT (primitive only — UNWIRED & not surfaced) (PR #72, opt-in, OFF by default, LOCAL — no backend). Per the legend above `🟡 = partial`: the primitive is code-complete + tested but not functional (no call sites; surfacing held HONEST-DISABLED). `auditLog.js` stores entries as a single AES-GCM blob in the shared vault store under a neutral key, byte-shaped like every other vault blob (not a forensic tell) and destroyed by panic wipe. A hard in-code denylist refuses any duress/stealth/hidden/panic/decoy/seed event (independent of the allowlist); only benign `{type, ts}` events are logged, ring-buffered. NOTE: built as a local in-vault primitive, NOT the "needs backend" design originally sketched here; not yet wired into call sites. The D1–D7 storage shape and wiring remain audit-gated — see `docs/audit-log-login-activity-deniability-decision.md`.
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
- The audit now covers S1–S4 (esp. M2, the deniability stack, Cloud Backup) — this
  is MORE than the EVM-only estimate (~$7k–$30k). Re-scope/quote accordingly
  (docs/Audit.scope.md). (Social Recovery is ❌ removed, so it is NOT in scope.)
- Cryptographic features (M2, deniability stack, Cloud Backup) get hands-on
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

### ❌ Removed from the app (consolidated record)
> Reason tags: [off-wedge] not core to the wedge · [breaks-self-custody] would move
> value without a user signature · [audit-blocked-and-not-advertised] cryptographically
> sensitive, never shipped, no longer advertised · [out-of-scope-regulated]
> custodial/regulated, never in scope.
- ❌ Social Recovery (guardian / Shamir SSS) — [audit-blocked-and-not-advertised] never built; removed from UI/catalogue.
- ❌ Multi-Sig wallets (personal + treasury) — [audit-blocked-and-not-advertised] UI shell w/ fake addresses only; page/route/nav/catalogue removed.
- ❌ Rebalance + Rebalance History — [breaks-self-custody] autonomous value movement; removed (PR #47).
- ❌ Recurring auto-debit — [breaks-self-custody] auto-debit path gutted (PR #47); Recurring Payments is now schedule/reminder only, hands off to Send for user signing.
- ❌ Sui — [off-wedge] chain trim (PR #48).
- ❌ Cosmos / IBC — [off-wedge] chain trim (PR #48); derive stub left unwired in wallet-core.
- ❌ Web Bridge — [off-wedge] dApp/swap gateway (PR #48).
- ❌ ENS Registration — [off-wedge] registration removed (PR #48); ENS/SNS resolution kept as ✅.
- ❌ Mobile App PWA — [off-wedge] (PR #48); native Capacitor shell remains.
- ❌ Mobile Widget — [off-wedge] (PR #48).
- ❌ Custodial / regulated cluster — [out-of-scope-regulated] never in scope: swaps/DEX, limit/OCO/TWAP/trailing/grid orders, trading bots/AI trading bots, perps/options/tokenized stocks, social/copy trading, DCA, staking-as-a-service, DeFi yield/farming, lending/borrowing, fiat on/off-ramp, bank links, CEX deposit/exchange connections, KYC/VASP/DID/trust-score/geo-blocking/compliance, institutional custody, enterprise/super-admin/telemetry/white-label/DAO governance+treasury/payroll/webhook builder/feature flags/perf monitoring/fee-wallet/automation rules, crypto subscriptions, smart-contract deploy, NFT minting/fractionalization, encrypted messaging.

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
