# Manual iOS Simulator Test — Multi-Wallet + Portfolios

Branch: `feat/multi-wallet-portfolio`. This is a **manual** script for YOU to run on
the iOS Simulator — the agent does not run the simulator. It exercises the
explore-first onboarding, the multi-seed vault, per-wallet mandatory backup,
portfolios, and lossless persistence across relaunch + unlock.

> ⚠️ The multi-seed vault is the highest-risk change in the project and is flagged
> for **independent audit review before mainnet** (see the PR description / report).
> This is a **testnet** build — assets point at Sepolia / BTC-testnet / SOL-devnet.

---

## 0. Build & launch (local build — the real on-device vault, NOT demo)

```bash
cd /Users/aljobson/Downloads/veyrnox-secure

# Build the web bundle and sync it into the native iOS project.
# Use the plain local build so the REAL vault gate is active (explore + unlock),
# NOT the demo tour. (Demo: `npm run mobile:build:demo`.)
npm run mobile:build

# Open the iOS project in Xcode, then Run (▶) on a simulator (e.g. iPhone 15).
npx cap open ios
#   — or, if you have a simulator booted and CLI run configured:
#   npx cap run ios
```

If you need a clean device first: in the Simulator, **Device ▸ Erase All Content
and Settings**, or delete the Veyrnox app, so there is **no existing vault**.

Sanity check before testing:

```bash
npm test            # 352 passing (leads with the vault isolation + migration tests)
npm run check:rng   # CSPRNG guard: pass
npm run lint        # clean
npm run build       # succeeds
```

---

## 1. Explore mode (fresh device, NO wallet → view-only, no auth)

1. Launch the app on a fresh simulator (no vault).
2. **Expect:** the real app UI loads directly — NO password/Face ID wall.
   - Header shows **"Portfolio Value $0"** and **"You're exploring — view only. No wallet yet."**
   - A dashed card with **"Create or import a wallet"**.
   - Greyed ETH / BTC / SOL placeholders at **0.00**.
   - A persistent bottom banner: **"Exploring — view only"** + **"Create or import"**.
3. Tap around the bottom nav (Send / Receive / More). **Expect:** screens are
   navigable and show honest empty/locked states (no fake balances, no auth prompt).
4. ✅ Pass criteria: real UI is browsable, everything reads **$0 / empty**, nothing
   asks you to authenticate, and the CTA is always reachable.

## 2. Create Wallet 1 (named, assets picked, seed shown + confirmed, all chains)

1. Tap **"Create or import a wallet"** (CTA) → tap **"Create a new wallet"**.
2. Enter a vault password (≥ 8 chars), e.g. `vaultpass123`. Tap **"Set Password & Generate Seed"**.
3. **Expect:** the **mandatory seed-backup screen** — *"Your Seed Phrase (shown once)"*.
   Tap the eye to reveal **12 words**. (This is Wallet 1's seed; it derives ETH/EVM,
   BTC, and SOL — one seed, all chains.) You cannot enter the app without confirming.
4. Tap **"I've backed it up — Enter Wallet"**.
5. **Expect:** the **portfolio** loads:
   - Portfolio chip row: **"Main"** (active) + **"Portfolios"** manager button.
   - **"MAIN · TOTAL VALUE $0"**, **"1 wallet in this portfolio"**.
   - The **Wallet 1** card shows the 5 default headline assets (ETH, USDC, USDT, BTC, SOL)
     each at `0 / $0`. (Assets are a *display* choice; the seed holds every chain.)
6. ✅ Pass: Wallet 1 created, seed shown once + confirmed, lands in **Main**, backed-up.

## 3. Import Wallet 2 (paste seed → all chains auto-derived, name + assets)

1. Tap **"Add wallet"**.
2. In the dialog, tap the **"Import seed"** tab.
3. Paste a **valid 12/24-word BIP-39 phrase** (any test seed you control —
   e.g. `legal winner thank year wave sausage worth useful legal winner thank yellow`).
   - **Note:** you are NOT asked which chain — a seed is not chain-specific; all
     chains derive automatically.
4. Set **Wallet name** = `Savings`. Optionally toggle which **assets to show**.
5. Enter the **vault password** (`vaultpass123` — re-auth to change the seed vault).
6. Tap **"Import wallet"**.
7. **Expect:** back on the portfolio: **"2 wallets in this portfolio"**, both
   **Wallet 1** and **Savings** cards present, each deriving its own addresses.
8. ✅ Pass: a second independent seed imported, all chains derived, no chain prompt.

   *(To instead test CREATE of a 2nd wallet: use the "Create new" tab — you'll get
   the same mandatory seed-backup step inside the dialog before it's active.)*

## 4. Portfolio shows both wallets' cryptos + a USD total

1. On **Main**, confirm the **TOTAL VALUE** line sums both wallets, and each wallet
   card lists its enabled cryptos with per-asset amount + USD value.
2. (Optional, to see non-zero values: fund a derived testnet address from a faucet
   — Receive ▸ pick the asset ▸ copy address ▸ faucet — then pull-to-refresh. The
   per-asset amount and the portfolio USD total update from the existing price feed.)
3. ✅ Pass: individual per-crypto amounts **and** a portfolio USD total are shown.

## 5. Unbacked-up warning works

1. The imported `Savings` wallet is marked backed up (you supplied its seed). To see
   the warning, **create** a wallet via **Add wallet ▸ Create new**, but on the
   seed-backup step **close the dialog without confirming** (tap outside / the X).
2. **Expect:** a prominent yellow banner **"N wallets not backed up"** with a
   **"Back up '<name>'"** chip. Tap it → the seed is re-shown → **"mark backed up"**
   clears that wallet from the warning.
3. ✅ Pass: unbacked wallets are tracked and prominently warned; backing up clears it.

## 6. Create a 2nd portfolio + move a wallet

1. Tap the **"Portfolios"** chip (manager). Type a name, e.g. `Cold Storage`, tap **Add**.
2. **Expect:** a new **"Cold Storage"** chip appears in the switcher.
3. On a wallet card, tap the **⋮** menu ▸ **"Move to portfolio"** ▸ choose **Cold Storage**.
4. Switch between the **Main** and **Cold Storage** chips. **Expect:** each shows only
   its own wallets and its own USD total (a wallet lives in exactly one portfolio).
5. ✅ Pass: multiple portfolios; wallets assignable; per-portfolio totals.

## 7. Relaunch → unlock → everything present (lossless persistence)

1. Force-quit the app (swipe up in the app switcher) and relaunch — OR lock via the
   header **Exit** button.
2. **Expect:** the **returning-user unlock gate** (Face ID if enabled, else the vault
   password). There is **no explore mode** now (a vault exists).
3. Unlock with `vaultpass123`.
4. **Expect:** **both wallets** (Wallet 1 + Savings) are present, in their portfolios,
   with the same addresses; the **Cold Storage** portfolio persists; backup flags persist.
5. ✅ Pass: multi-seed vault + portfolio assignments survive a full relaunch + unlock.

## 8. (Optional) Single-seed migration — prove an OLD vault still opens

If you have a build/device with a **pre-change single-seed vault** (one created before
this branch):

1. Install this branch's build over it (do NOT erase the app).
2. Unlock with the existing password.
3. **Expect:** it opens as **"Wallet 1"** in **Main**, with the **same addresses/funds**
   as before (lossless migration). On unlock it is transparently re-encrypted into the
   multi-seed container under the same password — no re-entry of the seed, no fund change.
4. ✅ Pass: an existing single-seed user is migrated losslessly.

---

## What to watch for (failure signals)

- Any screen that shows **fake balances** in explore mode (must be $0/empty).
- Any path that lets you enter the app with a freshly-created wallet **without**
  seeing/confirming its seed (mandatory backup must never be skippable).
- A wallet that, after relaunch, shows **different addresses** (would indicate a
  derivation/migration bug — STOP and report).
- The unlock gate accepting a **wrong** password (it must fail generically).
- Duress / stealth / panic: entering a **duress/panic/hidden** secret at unlock must
  still behave exactly as before (single decoy/hidden wallet view; panic wipes). These
  are unchanged by multi-wallet — see the report for how they interact.
