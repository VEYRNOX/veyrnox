# On-device verification checklist — post security sprint

Covers the six security merges now on `main` (2FA gate+verify #224/#247, CSP #227,
CSP dedupe/tighten #250, npm audit #249, BTC validation #251, H2 deniability padding
#230). Web + CI already verify the JS logic; this checklist covers the **native
Capacitor WKWebView / Android WebView** paths that web CI cannot reach.

Primary target: **iOS Simulator + a real iPhone** (you have a Mac). Android notes inline.

---

## 0. Build & install
```bash
git pull                                   # current main
npm install
npm run build && npx cap sync ios          # build web + sync into iOS (runs pod install)
npx cap open ios                           # Xcode → pick a simulator/device → Run
#   Android: npx cap sync android && npx cap run android
```
- [ ] Build completes with no errors (the #226 Ledger-external fix means optional HW deps don't break it).
- [ ] App installs and launches to the onboarding/explore screen.

> Keep **Safari ▸ Develop ▸ [Simulator/iPhone] ▸ (the app WebView) ▸ Console** open the whole time. Any **"Refused to … Content Security Policy"** line is a CSP failure — note the blocked URL + directive.

---

## 1. CSP under the native WebView  (#227 / #250) — HIGHEST PRIORITY
This is the one thing web CI can't prove. The deduped policy must enforce *and* not break the app.
- [ ] App boots — **no blank/white screen** (script-src/style-src not over-blocking).
- [ ] **Create a wallet** → succeeds. This compiles **Argon2id WASM** under `script-src 'wasm-unsafe-eval'`; if unlock/create hangs or errors, the CSP is blocking WASM. *(Most likely failure mode.)*
- [ ] **Unlock** an existing wallet → succeeds (same WASM path).
- [ ] Dashboard **prices + balances load** for every chain (ETH/ARB/OP/AVAX/MATIC/BTC/SOL) → confirms `connect-src` allows each RPC/price host (publicnode, cryptocompare, mempool.space, *.solana.com, etearscan, etc.).
- [ ] Console shows **zero** `Content-Security-Policy` violations during all of the above.
- [ ] Confirm `api.ensideas.com` / bonfida are **not** needed — ENS resolves (on-chain) and SNS is honest-disabled, so their absence from `connect-src` (the #250 tightening) must not break anything.

**On failure:** note the blocked host+directive; fix = add the host to `connect-src` in `index.html` (or relax the directive), or revert #250/#227.

---

## 2. H2 vault-format migration  (#230) — IRREVERSIBLE, TEST CAREFULLY
The migration rewrites an existing on-disk vault to the fixed-length padded format. A bug here can brick a wallet, so test with a wallet you can afford to lose (testnet).
- [ ] **Before upgrading:** on a build *without* #230 (or a fresh prior install), create a wallet, note its **receive address(es)** and balances. Optionally set a **duress PIN** and an **Action Password**. Background/foreground so it persists.
- [ ] Install **this** build over it (don't wipe data).
- [ ] **Unlock** → opens, and the **same address(es) + balances** appear (funds byte-identical; only the container shape changed).
- [ ] Unlock isn't blocked or slow in a new way (migration is best-effort/awaited-once).
- [ ] **Force-quit + reopen** → unlocks again cleanly (migration is idempotent — no re-migrate loop, no second-unlock failure).
- [ ] If an **Action Password** was set: a send now prompts for it and the **correct** password passes (the #247 verify fix), a wrong one is rejected.

**On failure (any funds/unlock issue):** do NOT ship; capture the state and revert #230.

---

## 3. Deniability — "no tell"  (#230 / I3)
The point of H2 is that decoy/hidden sets are byte-indistinguishable from the real one.
- [ ] **Decoy/duress unlock** (duress PIN) opens a plausible single-wallet view; no error, no hint it's a decoy.
- [ ] Decoy session **also enforces its Action Password** on send (2FA parity — no bypass).
- [ ] **Hidden wallet** unlock works and is similarly indistinguishable.
- [ ] Dashboard/analytics show **no wallet-count tell** across real vs decoy (the #193 D1–D3 fix).
- [ ] No last-unlock timestamp / notification leak in a decoy/hidden session.

---

## 4. Send path — validation + 2FA  (#251 / #224 / #247)
Per chain (ETH/ARB/OP/BTC/SOL), testnet amounts:
- [ ] **BTC recipient validation (#251):** pasting a **mistyped/bad-checksum** BTC address is rejected at the recipient field (can't advance); a valid `tb1…`/`bc1…` is accepted.
- [ ] Self-send warning still fires (#191 S3).
- [ ] With an Action Password set, **every** send (real + decoy) requires it at the signing chokepoint (#224 gate); correct password proceeds, wrong is blocked (#247 verify).
- [ ] A real testnet send broadcasts and confirms for each chain you exercise.

---

## 5. Sign-off
- [ ] All of §1–§4 pass on **iOS** (Simulator + ≥1 real iPhone).
- [ ] Spot-check the same on **Android** (§1 CSP boot/unlock + §2 migration at minimum).
- [ ] Console clean (no CSP violations, no uncaught errors) across the run.

If everything passes, the security sprint is fully verified end-to-end (web + native) and
`main` is clear for whatever ships next. Record any failure with the exact console line.

---

## 7. Hardware KEK (H-NEW-D) — native SE/StrongBox  (#495 #496 #497 #502) — PHYSICAL DEVICE ONLY

Web/CI and JS unit tests mock the native plugin; the secure-element behaviour below can
ONLY be verified on real hardware. See `docs/audit-triage/hardware-kek-audit-package-2026-07-01.md`.

### 7a. Enroll + KEK-gated unlock persists
- [ ] Settings → enable Hardware protection → badge **ON**.
- [ ] **Cold force-stop** the app, reopen → unlock prompts Face ID / fingerprint; badge stays **ON**.
- [ ] iOS: logcat/idevicesyslog shows `getHardwareFactor: SUCCESS`; Android: `StrengthRequested: 15`.
- [ ] Vault reads back as `kek-dek` (no bare re-write on unlock — #497).

### 7b. Remove + badge honesty (#497 / #502)
- [ ] Remove hardware protection → badge **OFF**.
- [ ] Force-stop → reopen → badge stays **OFF** (reads vault `kekWrap`, stale credential self-heals).
- [ ] Reset / re-import wallet → badge **OFF** on the fresh bare vault.

### 7c. Biometric re-enrollment invalidation — **THE OUTSTANDING I6 TEST** (both platforms)
This is the core hardware-binding property and the last device leg before "verified".
- [ ] Enroll KEK; confirm Face ID / fingerprint unlock works (baseline).
- [ ] OS Settings → **add or re-enroll a biometric** (new face / new fingerprint).
- [ ] Reopen Veyrnox → attempt unlock.
- [ ] **PASS = fail-closed:** the stale SE/StrongBox key is invalidated → unlock does NOT
      succeed via the old key → it requires **password/PIN fallback** (no silent bypass).
- [ ] iOS expected: `getHardwareFactor` rejects (key-invalidated / DECRYPT_FAILED).
- [ ] Android expected: `KeyPermanentlyInvalidatedException` → credential cleared + explicit error.
- [ ] **FAIL = silent success** with the new biometric (would mean the ACL/invalidation binding
      is not enforced) — record and STOP.

### 7d. Real send from KEK-enrolled vault
- [ ] iOS: DONE — Sepolia `0xf09c036c…` + `0x0b13d553…` (see audit package §6).
- [ ] Android: OUTSTANDING — capture a Sepolia send from a StrongBox-enrolled vault + txid.
