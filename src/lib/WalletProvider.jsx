// lib/WalletProvider.jsx
//
// React context for the unlocked wallet session.
//
// SECURITY RATIONALE
//   - The decrypted mnemonic lives ONLY in memory, ONLY while unlocked, and
//     is held in a ref (not React state) so it isn't copied into render
//     snapshots or devtools-inspectable state trees more than necessary.
//   - lock() clears it and best-effort overwrites. Auto-lock on a timer and
//     on tab hide reduces the exposure window.
//   - Nothing here is persisted except via the keyStore (ciphertext only).
//
// STORAGE SEAM (M2a): all vault persistence/crypto goes through the keyStore
// interface (wallet-core/keystore). On web this is the unchanged Argon2id +
// AES-GCM IndexedDB vault; native (M2b, Design B) swaps in a hardware-gated,
// hardware-backed-at-rest implementation behind the SAME interface without
// touching this component.
//
// LIMITATION (document in threat model): JavaScript cannot guarantee secrets
// are unrecoverable from memory after clearing. This minimizes, not
// eliminates, the window. Device-keystore wrapping is the stronger control
// and is the recommended next step.

import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';
import { generateMnemonic, validateMnemonic } from '@/wallet-core/mnemonic';
import { deriveEvmAccount } from '@/wallet-core/derivation';
import { deriveBtcAccount } from '@/wallet-core/btc/derivation';
import { deriveSolAccount } from '@/wallet-core/sol/derivation';
import { getKeyStore } from '@/wallet-core/keystore';
// MULTI-SEED VAULT (feat/multi-wallet-portfolio). ⚠️ AUDIT-CRITICAL container
// layer that holds N independent seeds INSIDE the one encrypted blob. It does no
// crypto — vault.js/keystore are unchanged; we just hand them a JSON container of
// mnemonics instead of one bare mnemonic, and parse it back. See multiVault.js.
import * as mv from '@/wallet-core/multiVault';
import {
  ensureWalletMeta,
  getWalletMeta,
  setWalletName,
  setWalletBackedUp,
  setEnabledAssets as setWalletEnabledAssets,
  toggleWalletAsset as toggleWalletAssetMeta,
  removeWalletMeta,
  setActiveWalletId as persistActiveWalletId,
  reconcileWalletMeta,
  clearAllWalletMeta,
  ALL_ASSET_SYMBOLS,
} from '@/lib/walletMeta';
// PORTFOLIOS (named groups of wallets; one-portfolio-per-wallet partition with an
// always-present "Main"). Non-secret organisation only — no seeds. See portfolios.js.
import {
  MAIN_PORTFOLIO_ID,
  reconcilePortfolios,
  createPortfolio as createPortfolioStore,
  renamePortfolio as renamePortfolioStore,
  deletePortfolio as deletePortfolioStore,
  assignWalletToPortfolio as assignWalletToPortfolioStore,
  setActivePortfolioId as persistActivePortfolioId,
  clearAllPortfolios,
} from '@/lib/portfolios';
import {
  setDuressVault,
  clearDuressVault,
  hasDuressVault,
} from '@/wallet-core/duress';
import {
  tryRevealHidden,
  createHiddenWallet,
  moveWalletToHidden,
  ensureStealthPool,
  hasStealthPool,
  wipeStealthPool,
} from '@/wallet-core/stealth';
import {
  setPanicVault,
  clearPanicVault,
  hasPanicVault,
  panicWipeLocal,
  inspectKeyMaterial,
} from '@/wallet-core/panic';
// SAST M2: the post-primary-miss deniability resolution runs a CONSTANT number
// of KDFs regardless of which features are configured, so the presence/count of
// panic/duress/hidden is not timeable at the prompt. See deniabilityUnlock.js.
import { resolveDeniabilityUnlock } from '@/wallet-core/deniabilityUnlock';
import { getOrCreateDeviceSalt, clearDeviceSalt } from '@/wallet-core/decoyFallback';
import { provisionDeniabilityChaff } from '@/wallet-core/provisionChaff';
import { getAuthModel, shouldCacheUnlockSecret, clearAuthModel } from '@/lib/authModel';
import {
  isBiometricUnlockEnabled,
  setBiometricUnlockEnabled,
  getBiometricStatus,
  BiometricGateError,
} from '@/lib/biometric';
// BIOMETRIC ONE-TAP UNLOCK CACHE (convenience over the existing vault). Stores
// the vault password behind the biometric gate so a returning user can unlock
// with Face ID instead of re-typing it. The password remains THE secret and the
// always-available fallback; this never touches vault crypto. See lib/biometricUnlock.js.
import {
  storeUnlockSecret,
  retrieveUnlockSecret,
  clearUnlockSecret,
} from '@/lib/biometricUnlock';
// PASSKEY UNLOCK GATE (S1). The dual of the biometric gate: an ADDITIONAL
// FIDO2/WebAuthn authentication factor in front of unlock. It is NOT key
// custody — it stores only a public credential id, never touches the seed
// vault, and the password path stays fully independent (passkey loss ≠ fund
// loss). See lib/passkey.js for the hard invariants.
import {
  isPasskeyUnlockEnabled,
  isPasskeyRegistered,
  getPasskeyStatus,
  verifyPasskeyAssertion,
  PASSKEY_GATE,
  PasskeyGateError,
  classifyPasskeyError,
} from '@/lib/passkey';
import {
  loadAutoLockValue,
  saveAutoLockValue,
  autoLockMsFromValue,
} from '@/lib/session';
import BiometricPrompt from '@/components/security/BiometricPrompt';
import PasskeyPrompt from '@/components/security/PasskeyPrompt';

const WalletCtx = createContext(null);

// User activity that should reset the idle auto-lock timer while unlocked.
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'focus'];
// Throttle re-arming the timer so a burst of activity doesn't thrash setTimeout.
const ACTIVITY_THROTTLE_MS = 1000;

// Platform-resolved storage seam. Web today; native (M2b) swaps in behind the
// same interface. Stable singleton, so it lives at module scope.
const keyStore = getKeyStore();

export function WalletProvider({ children }) {
  // MULTI-SEED CONTAINER (LIVE SECRETS while unlocked). Holds the parsed vault
  // container { wallets: [{ id, mnemonic }, ...] } — ALL seeds the vault unlocked.
  // Kept in a ref (not state) so live mnemonics are never copied into render
  // snapshots / devtools, exactly as the single mnemonic was before.
  const containerRef = useRef(null);
  // The active wallet's id, mirrored in a ref for synchronous reads by the
  // derive/sign helpers (which must not depend on a React state flush).
  const activeIdRef = useRef(null);
  // Active portfolio id mirrored in a ref so mutations (e.g. a newly added wallet
  // joining the current portfolio) read it without a stale-closure hazard.
  const activePortfolioRef = useRef(MAIN_PORTFOLIO_ID);
  const [isUnlocked, setUnlocked] = useState(false);
  // Public, non-secret per-wallet info for the UI: [{ id, name, backedUp,
  // enabledAssets }] — NO mnemonics. Derived from the container ids + walletMeta.
  const [wallets, setWallets] = useState([]);
  // Which wallet send/receive/derivation acts on (the "active wallet").
  const [activeWalletId, setActiveWalletIdState] = useState(null);
  // Public addresses per wallet for the unified portfolio: { id: {evm,btc,sol} }.
  // Derived locally from each seed — no network, no balances here.
  const [walletAddresses, setWalletAddresses] = useState({});
  // PORTFOLIOS: named groups of wallets. portfolios=[{id,name}]; walletPortfolioMap
  // maps walletId -> portfolioId (each wallet in exactly one). activePortfolioId is
  // the group currently shown. "Main" always exists and holds unassigned wallets.
  const [portfolios, setPortfolios] = useState([]);
  const [walletPortfolioMap, setWalletPortfolioMap] = useState({});
  const [activePortfolioId, setActivePortfolioIdState] = useState(MAIN_PORTFOLIO_ID);
  // EXPLORE-FIRST ONBOARDING: true when the device has NO vault and the user is
  // browsing the real UI VIEW-ONLY (honest $0 empty states, no auth, nothing to
  // protect). Wallet-requiring actions call requireWallet() to leave explore and
  // enter the create/import flow. Returning users (vault exists) never explore.
  const [exploreMode, setExploreMode] = useState(false);
  // DURESS / DECOY (S3): true when the CURRENT session was opened with the
  // duress password (a decoy vault) rather than the real one. Internal flag for
  // app logic; the normal wallet UI deliberately does NOT surface it, so a
  // coercer sees no "decoy mode" indicator. See wallet-core/duress.js.
  const [isDecoy, setIsDecoy] = useState(false);
  // STEALTH / HIDDEN WALLETS (S3 — Direction-C): true when the CURRENT session
  // was opened by a hidden wallet's reveal secret (entered at the SAME unlock
  // prompt) rather than the primary or duress password. Like isDecoy this is an
  // internal flag for app logic; the normal wallet UI deliberately does NOT
  // surface it, so an observer sees no "hidden wallet" indicator. A hidden
  // wallet is a real, independently-encrypted vault — see wallet-core/stealth.js.
  const [isHidden, setIsHidden] = useState(false);
  // PANIC WIPE (S3 — Direction-C): set true once a panic wipe has destroyed the
  // local key material this session, so the UI can confirm the wipe + show the
  // residual report. Reset on the next create/import/unlock (a fresh wallet).
  // This is NOT a secret; it is purely a UX/proof signal. See wallet-core/panic.js.
  const [wasWiped, setWasWiped] = useState(false);
  const [accounts, setAccounts] = useState([]); // public only: {address, path, index}
  // Phase BTC: the wallet's BIP-84 testnet account (PUBLIC only: {address, path}).
  // Derived from the SAME in-memory mnemonic alongside the EVM accounts; kept in
  // separate state so the EVM derivation path is untouched. Default network is
  // testnet (mainnet gated in btc/networks.js). null while locked.
  const [btcAccount, setBtcAccount] = useState(null);
  // Phase SOL: the wallet's Solana devnet account (PUBLIC only: {address, path}).
  // ed25519 / SLIP-0010 m/44'/501'/0'/0', derived from the SAME in-memory
  // mnemonic; separate state so the EVM/BTC paths are untouched. Default network
  // is devnet (mainnet gated in sol/networks.js). null while locked.
  const [solAccount, setSolAccount] = useState(null);
  const lockTimer = useRef(null);

  // Configurable idle auto-lock timeout. The picker value (e.g. '5', 'never')
  // is React state for the settings UI; a ref mirrors the resolved ms so the
  // timer/activity handlers always read the current value without being torn
  // down and re-created on every change. Default mirrors today's 5-minute lock.
  const [autoLockValue, setAutoLockValue] = useState(loadAutoLockValue);
  const autoLockMsRef = useRef(autoLockMsFromValue(autoLockValue));
  const lastActivityRef = useRef(0);     // throttle stamp for activity listener

  // PROVISIONAL biometric-unlock UI state (see lib/biometric.js header). Holds
  // the SIMULATED prompt's props while shown; null when hidden. The resolver
  // ref carries the in-flight Promise's resolve/reject so the overlay's result
  // can complete the awaited gate. None of this is secret or persisted.
  const [bioPrompt, setBioPrompt] = useState(null);
  const bioResolverRef = useRef(null);

  // PASSKEY (S1) demo-prompt state — exact parallel of the biometric prompt
  // above. Holds the SIMULATED passkey sheet's props while shown; null when
  // hidden. Not secret, not persisted. The real (web) passkey sheet is shown by
  // the browser from inside verifyPasskeyAssertion(), so this is demo-only.
  const [passkeyPrompt, setPasskeyPrompt] = useState(null);
  const passkeyResolverRef = useRef(null);

  // Show the simulated prompt and resolve when the user/auto-timer answers.
  // Rejecting on cancel makes unlock() fail loudly, exactly like a real cancel.
  const showSimulatedPrompt = useCallback((status) => new Promise((resolve, reject) => {
    bioResolverRef.current = { resolve, reject };
    setBioPrompt({ label: status.label });
  }), []);

  const resolveBioPrompt = useCallback((ok) => {
    const r = bioResolverRef.current;
    bioResolverRef.current = null;
    setBioPrompt(null);
    if (!r) return;
    if (ok) r.resolve();
    else r.reject(new Error('Biometric authentication was cancelled'));
  }, []);

  const showSimulatedPasskeyPrompt = useCallback((status) => new Promise((resolve, reject) => {
    passkeyResolverRef.current = { resolve, reject };
    setPasskeyPrompt({ label: status.label });
  }), []);

  const resolvePasskeyPrompt = useCallback((ok) => {
    const r = passkeyResolverRef.current;
    passkeyResolverRef.current = null;
    setPasskeyPrompt(null);
    if (!r) return;
    if (ok) r.resolve();
    else r.reject(new Error('Passkey authentication was cancelled'));
  }, []);

  // The app-layer biometric gate run before reading the vault. PROVISIONAL:
  //   - demo  : show the clearly-stubbed simulated prompt here.
  //   - native: the REAL OS prompt is presented inside keyStore.unlock() (M2b),
  //             so we do NOT double-prompt — this is a no-op there.
  //   - web   : no platform biometric exists; nothing to prompt (password still
  //             required by keyStore.unlock()).
  // Honest limitation: M2b's native gate currently always prompts when a vault
  // exists, so on a real device biometric is required regardless of this toggle;
  // full toggle enforcement on-device is part of the flagged audit/OS-enforced
  // rework. The toggle fully controls the demo path today.
  // It THROWS a BiometricGateError (reason 'cancelled') when the gate is shown
  // and the user cancels/fails it, so unlock() fails CLOSED and the UI can offer
  // the password-only escape hatch (the dual of the passkey escape hatch). The
  // escape hatch never weakens the vault — keyStore.unlock(password) below still
  // requires the correct password (the real control); skipping the biometric
  // factor is no weaker than the app's baseline custody.
  const runBiometricGate = useCallback(async () => {
    if (!isBiometricUnlockEnabled()) return;
    const status = await getBiometricStatus();
    if (status.mode === 'demo') {
      try {
        await showSimulatedPrompt(status); // rejects on cancel
      } catch (err) {
        throw new BiometricGateError('cancelled', err); // fail closed → escape hatch
      }
    }
    // native/web: no app-layer prompt (see comment above).
  }, [showSimulatedPrompt]);

  // The app-layer PASSKEY gate run before reading the vault — the dual of
  // runBiometricGate. It is a CONVENIENCE factor layered on the password, NOT a
  // replacement for it: the password still decrypts the vault, so a lost/broken
  // passkey never costs funds (passkey loss ≠ fund loss). Returns a PASSKEY_GATE
  // status; THROWS a PasskeyGateError (with reason cancelled|error) when an
  // attempted assertion fails, so unlock() can fail closed and the UI can offer
  // the password-only escape hatch. See lib/passkey.js ESCAPE-HATCH THREAT MODEL.
  //   - off / not registered : SKIPPED (password unlock unchanged).
  //   - demo  : show the clearly-stubbed simulated passkey sheet; cancel → throw.
  //   - web + available : present the REAL browser passkey sheet; cancel/failure
  //             throws (fail closed) and is classified for the escape hatch.
  //   - web + UNAVAILABLE (no platform authenticator / WebAuthn gone) : the gate
  //             cannot even prompt, so requiring it would brick EVERY unlock.
  //             Degrade to the password path, but RETURN the UNAVAILABLE status so
  //             unlock() can SIGNAL the dropped factor (M-1/M-2) — never silent.
  // A successful assertion returns NO decryption material — it is purely a gate
  // signal. The vault is still opened by keyStore.unlock(password) below.
  const runPasskeyGate = useCallback(async () => {
    if (!isPasskeyUnlockEnabled() || !isPasskeyRegistered()) {
      return { status: PASSKEY_GATE.SKIPPED };
    }
    const status = await getPasskeyStatus();
    if (status.mode === 'demo') {
      // Simulated sheet. A cancel rejects with a plain Error → classify as a
      // cancel so the demo exercises the SAME fail-closed + escape-hatch flow as
      // real web (and so the cancel path can be load-app verified in demo).
      try {
        await showSimulatedPasskeyPrompt(status);
      } catch (err) {
        throw new PasskeyGateError('cancelled', err);
      }
      return { status: PASSKEY_GATE.PASSED };
    }
    if (!status.available) {
      // The configured passkey CANNOT run on this device right now. Do NOT brick
      // the vault behind a factor it can't satisfy — degrade to the password path
      // and let unlock() signal it. (SAST M-2: previously a silent skip.)
      return { status: PASSKEY_GATE.UNAVAILABLE, detail: status.detail };
    }
    try {
      await verifyPasskeyAssertion(); // fail closed on cancel/failure
    } catch (err) {
      // Classify cancel-vs-broken so the UI can decide whether to surface the
      // password-only escape hatch (SAST M-3). We still THROW here — the unlock
      // fails closed; the escape hatch is a separate, deliberate user action.
      throw new PasskeyGateError(classifyPasskeyError(err), err);
    }
    return { status: PASSKEY_GATE.PASSED };
  }, [showSimulatedPasskeyPrompt]);

  const lock = useCallback(() => {
    const c = containerRef.current;
    if (c && Array.isArray(c.wallets)) {
      // best-effort overwrite of EVERY seed before dropping the container — the
      // same hygiene the single mnemonic got, applied across all wallets.
      for (const w of c.wallets) {
        try { w.mnemonic = ' '.repeat(w.mnemonic.length); } catch { /* noop */ }
      }
    }
    containerRef.current = null;
    activeIdRef.current = null;
    activePortfolioRef.current = MAIN_PORTFOLIO_ID;
    setUnlocked(false);
    setIsDecoy(false);
    setIsHidden(false);
    setWallets([]);
    setActiveWalletIdState(null);
    setWalletAddresses({});
    setPortfolios([]);
    setWalletPortfolioMap({});
    setActivePortfolioIdState(MAIN_PORTFOLIO_ID);
    setAccounts([]);
    setBtcAccount(null);
    setSolAccount(null);
    keyStore.lock(); // no-op on web; drops the hardware grant on native (M2b)
  }, []);

  // (Re)arm the idle auto-lock timer for the CURRENT timeout preference. Safe to
  // call anytime: it clears any pending timer first, and arms a new one only
  // while unlocked and when the user hasn't chosen "Never". This is the single
  // idle-lock mechanism — it routes through lock() exactly like every other path.
  const armTimer = useCallback(() => {
    if (lockTimer.current) { clearTimeout(lockTimer.current); lockTimer.current = null; }
    if (!containerRef.current) return;       // locked → nothing to arm
    const ms = autoLockMsRef.current;
    if (ms == null) return;                  // "Never" → no idle lock
    lockTimer.current = setTimeout(lock, ms);
  }, [lock]);

  // touch() = "user did something, reset the idle countdown". Kept as the name
  // the wallet operations already call (create/import/unlock/withPrivateKey).
  const touch = useCallback(() => { armTimer(); }, [armTimer]);

  // Change the auto-lock timeout from the settings UI: persist, update the live
  // ref, reflect in state, and immediately re-arm so the new value takes effect
  // without waiting for the next activity.
  const setAutoLockTimeout = useCallback((value) => {
    saveAutoLockValue(value);
    autoLockMsRef.current = autoLockMsFromValue(value);
    setAutoLockValue(value);
    armTimer();
  }, [armTimer]);

  // STEALTH (S3): on mount, if this device already has a primary vault, seed the
  // chaff slot pool so its presence tracks "has a wallet" (universal) rather than
  // "uses hidden wallets". Idempotent and non-destructive (never overwrites a real
  // hidden-wallet slot). Best-effort: swallow storage errors so a hiccup here can
  // never block the app. Runs once on mount.
  useEffect(() => {
    let cancelled = false;
    keyStore.hasVault()
      .then((has) => { if (has && !cancelled) return ensureStealthPool(); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Auto-lock on app-background: web tab hidden (fallback) + native pause.
  // Native (M2b): keyStore.setLockHook wires @capacitor/app's pause/appStateChange
  // to lock(); web has no such hook so visibilitychange is the fallback.
  useEffect(() => {
    const onHide = () => { if (document.hidden) lock(); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [lock]);

  // Reset the idle timer on real user activity while unlocked. Throttled so a
  // stream of events doesn't churn the timer. Only attached while unlocked, so a
  // locked wallet has zero listeners and never re-arms behind the user's back.
  useEffect(() => {
    if (!isUnlocked) return undefined;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastActivityRef.current < ACTIVITY_THROTTLE_MS) return;
      lastActivityRef.current = now;
      armTimer();
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
  }, [isUnlocked, armTimer]);

  // M2b (native only): also lock on a reliable OS background signal. The native
  // keyStore exposes setLockHook so its @capacitor/app pause listener can drop
  // the live secret. Web's keyStore has no such method, so this optional call is
  // a no-op on web and the behaviour above is unchanged.
  useEffect(() => {
    keyStore.setLockHook?.(lock);
    return () => keyStore.setLockHook?.(null);
  }, [lock]);

  // ── MULTI-SEED SESSION HELPERS ─────────────────────────────────────────────
  // The single source of truth for "which seed do send/receive/derivation use":
  // the ACTIVE wallet's mnemonic, read synchronously from the container. Returns
  // null when locked (no container). Falls back to the first wallet if the active
  // id is somehow stale, so a session never derives from a missing wallet.
  const getActiveMnemonic = useCallback(() => {
    const c = containerRef.current;
    if (!c || !c.wallets || c.wallets.length === 0) return null;
    const w = mv.findWallet(c, activeIdRef.current) || c.wallets[0];
    return w ? w.mnemonic : null;
  }, []);

  // Rebuild the public `wallets` state from the container ids + walletMeta. NO
  // mnemonics leave the ref. Used after any add/remove/rename/backup change.
  const refreshWalletsState = useCallback(() => {
    const c = containerRef.current;
    if (!c) { setWallets([]); return; }
    const ids = mv.listWalletIds(c);
    setWallets(ids.map((id, i) => {
      const m = getWalletMeta(id, `Wallet ${i + 1}`);
      return { id, name: m.name, backedUp: m.backedUp, enabledAssets: m.enabledAssets };
    }));
    setActiveWalletIdState(activeIdRef.current);
  }, []);

  // Reconcile + load portfolio state against the current container's wallet ids.
  // Ensures "Main" exists, every wallet is in exactly one portfolio, orphan
  // mappings are pruned, and the active portfolio is valid. Non-secret.
  const refreshPortfoliosState = useCallback(() => {
    const c = containerRef.current;
    if (!c) { setPortfolios([]); setWalletPortfolioMap({}); setActivePortfolioIdState(MAIN_PORTFOLIO_ID); return; }
    const { portfolios: pf, walletMap, activePortfolioId: active } = reconcilePortfolios(mv.listWalletIds(c));
    setPortfolios(pf);
    setWalletPortfolioMap(walletMap);
    activePortfolioRef.current = active;
    setActivePortfolioIdState(active);
  }, []);

  // ── PORTFOLIO ADDRESS DERIVATION ────────────────────────────────────────────
  // Derive every wallet's PUBLIC multi-chain addresses (evm/btc/sol) for the
  // unified portfolio. Local-only: no network, no balances, no private keys
  // retained. Each wallet derives strictly from its OWN seed (isolation).
  const deriveAllAddresses = useCallback(() => {
    const c = containerRef.current;
    if (!c) { setWalletAddresses({}); return {}; }
    const map = {};
    for (const w of c.wallets) {
      try {
        map[w.id] = {
          evm: deriveEvmAccount(w.mnemonic, 0).address,
          btc: deriveBtcAccount(w.mnemonic, { networkKey: 'testnet' }).address,
          sol: deriveSolAccount(w.mnemonic).address,
        };
      } catch { /* skip a wallet that fails to derive rather than break the view */ }
    }
    setWalletAddresses(map);
    return map;
  }, []);

  // Derive a set of public accounts from the in-memory mnemonic.
  const deriveAccounts = useCallback((count = 1) => {
    const active = getActiveMnemonic();
    if (!active) throw new Error('Wallet is locked');
    const list = [];
    for (let i = 0; i < count; i++) {
      const { address, path } = deriveEvmAccount(active, i);
      list.push({ address, path, index: i }); // NOTE: no privateKey stored here
    }
    setAccounts(list);
    return list;
  }, []);

  // Derive the BIP-84 BTC account (PUBLIC address only) from the in-memory
  // mnemonic. Separate from deriveAccounts() so the EVM path is untouched.
  // Defaults to testnet; returns {address, path}. No keys stored here.
  const deriveBtc = useCallback((networkKey = 'testnet') => {
    const active = getActiveMnemonic();
    if (!active) throw new Error('Wallet is locked');
    const { address, path } = deriveBtcAccount(active, { networkKey });
    const acct = { address, path, networkKey };
    setBtcAccount(acct);
    return acct;
  }, []);

  // Derive the Solana account (PUBLIC address only) from the in-memory mnemonic.
  // ed25519 / SLIP-0010 — a different curve from EVM/BTC, separate from both
  // derivation paths. Defaults to devnet; returns {address, path}. No keys stored.
  const deriveSol = useCallback((networkKey = 'devnet') => {
    const active = getActiveMnemonic();
    if (!active) throw new Error('Wallet is locked');
    const { address, path } = deriveSolAccount(active);
    const acct = { address, path, networkKey };
    setSolAccount(acct);
    return acct;
  }, []);

  // Derive the ACTIVE wallet's accounts (EVM/BTC/SOL) AND every wallet's public
  // portfolio addresses, in one call. Used after unlock / create / import /
  // switch / add / remove so both the active-wallet views and the unified
  // portfolio stay in sync.
  const deriveActiveAndAll = useCallback(() => {
    deriveAccounts(1);
    deriveBtc();
    deriveSol();
    deriveAllAddresses();
  }, [deriveAccounts, deriveBtc, deriveSol, deriveAllAddresses]);

  // PANIC WIPE (S3 — Direction-C). ⚠️ DESTRUCTIVE + SAFETY-CRITICAL — see
  // wallet-core/panic.js. Irreversibly destroy ALL local key material:
  //   - native (M2b): the hardware-backed primary vault, via keyStore.clearVault();
  //   - web: the entire 'veyrnox-vault' IndexedDB store (primary + duress decoy +
  //     stealth pool + panic marker) and the demo address-residue maps, via
  //     panicWipeLocal() — which also returns a post-wipe inspection report.
  // Then drop the live in-memory secret (lock) and flag wasWiped so the UI can
  // confirm + display proof. HONEST LIMIT: this destroys the LOCAL device copy
  // only — a seed backup the user holds elsewhere still recovers the wallet (by
  // design; wipe protects the device, not the seed). Best-effort on the native
  // clear so an already-cleared vault can't block the (more important) local wipe.
  const panicWipe = useCallback(async () => {
    try { await keyStore.clearVault(); } catch { /* may already be gone */ }
    const residual = await panicWipeLocal();
    // Also destroy the biometric one-tap cache + preference: it holds a copy of
    // the vault password, so a wipe must take it too.
    setBiometricUnlockEnabled(false);
    try { await clearUnlockSecret(); } catch { /* best-effort */ }
    // Multi-wallet metadata (names/backup-flags/asset prefs/active pointer) is
    // non-secret, but a wipe should leave no residue tying the device to the
    // destroyed wallets. Clearing it also makes the next launch a clean
    // explore-mode first-run rather than referencing wallets that no longer exist.
    clearAllWalletMeta();
    clearAllPortfolios();
    lock();              // drop in-memory secret + reset session flags
    setWasWiped(true);   // UX/proof signal only (not a secret)
    return residual;     // { indexedDbKeys, vaultBlobCount, localStorageResidue, clean }
  }, [lock]);

  // FAIL-CLOSED ONBOARDING ROLLBACK. Tear down a half-provisioned PIN wallet when
  // chaff provisioning fails mid-creation (see lib/pinOnboarding.js). This is the
  // local teardown panicWipe does, MINUS the wasWiped panic UX — a setup rollback,
  // not a user-invoked wipe. Leaves a clean first-run: no primary, no chaff slots,
  // no cohort marker, no decoy salt, in-memory secret dropped. Best-effort per step
  // so a flaky sub-clear can't strand a defenseless-but-"ready" wallet behind it.
  const discardIncompleteWallet = useCallback(async () => {
    try { await keyStore.clearVault(); } catch { /* native branch; may already be gone */ }
    try { await panicWipeLocal(); } catch { /* best-effort */ }
    setBiometricUnlockEnabled(false);
    try { await clearUnlockSecret(); } catch { /* best-effort */ }
    clearAllWalletMeta();
    clearAllPortfolios();
    clearAuthModel();   // drop any 'pin' cohort marker (matters for the recovery rollback case)
    clearDeviceSalt();  // drop any seeded decoy salt (recovery rollback case)
    lock();             // drop the in-memory secret + reset session flags (isUnlocked -> false)
    // Deliberately NO setWasWiped(true): this is a setup-failure rollback, not a panic wipe.
  }, [lock]);

  // Create a brand-new wallet (the FIRST wallet on this device): generate one
  // seed, wrap it in a fresh multi-seed container as wallet #1, encrypt the
  // SERIALISED container, persist ciphertext, unlock. The crypto is unchanged —
  // we hand keyStore the container JSON instead of a bare mnemonic.
  //
  // BACKUP TRACKING: the new wallet is recorded as NOT-yet-backed-up
  // (backedUp:false) so the mandatory backup screen + the prominent unbacked
  // warning are live until the user confirms via confirmWalletBackup(). New
  // wallets default to the headline assets (the other EVM chains are opt-in).
  const createWallet = useCallback(async (password, strength = 128) => {
    const mnemonic = generateMnemonic(strength);
    const { container, walletId } = mv.migrateLegacyMnemonic(mnemonic);
    await keyStore.createVault(mv.serializeContainer(container), password);
    containerRef.current = container;
    activeIdRef.current = walletId;
    ensureWalletMeta(walletId, { name: 'Wallet 1', backedUp: false });
    persistActiveWalletId(walletId);
    setUnlocked(true);
    setIsDecoy(false);
    setIsHidden(false);
    setExploreMode(false);
    setWasWiped(false); // a fresh wallet exists again; clear any prior wipe signal
    // A brand-new wallet must not inherit a previous wallet's biometric one-tap
    // cache/preference (its password wouldn't decrypt this vault). Reset so
    // onboarding re-offers Face ID for THIS wallet. Best-effort.
    setBiometricUnlockEnabled(false);
    void clearUnlockSecret().catch(() => {});
    // STEALTH (S3): a primary vault now exists, so seed the chaff slot pool. Doing
    // it here (and on import/unlock) ties the pool's presence to "has a wallet"
    // — universal among users — rather than to hidden-wallet usage. Best-effort:
    // a storage hiccup must never break wallet creation.
    void ensureStealthPool().catch(() => {});
    refreshWalletsState();
    refreshPortfoliosState();
    touch();
    deriveActiveAndAll();
    // Return mnemonic ONCE for the user to back up; caller must not persist it.
    return mnemonic;
  }, [refreshWalletsState, refreshPortfoliosState, deriveActiveAndAll, touch]);

  // Import an existing mnemonic as the FIRST wallet on this device. Wrapped as
  // wallet #1 of a fresh container. Marked backedUp:true — the user supplied the
  // seed, so by definition they hold the backup (no nag for an imported wallet).
  const importWallet = useCallback(async (mnemonic, password) => {
    if (!validateMnemonic(mnemonic)) throw new Error('Invalid recovery phrase');
    const { container, walletId } = mv.migrateLegacyMnemonic(mnemonic);
    await keyStore.createVault(mv.serializeContainer(container), password);
    containerRef.current = container;
    activeIdRef.current = walletId;
    ensureWalletMeta(walletId, { name: 'Wallet 1', backedUp: true });
    persistActiveWalletId(walletId);
    setUnlocked(true);
    setIsDecoy(false);
    setIsHidden(false);
    setExploreMode(false);
    setWasWiped(false); // a fresh wallet exists again; clear any prior wipe signal
    // Reset any prior wallet's biometric one-tap cache/preference (see createWallet).
    setBiometricUnlockEnabled(false);
    void clearUnlockSecret().catch(() => {});
    void ensureStealthPool().catch(() => {}); // seed chaff pool (see createWallet)
    refreshWalletsState();
    refreshPortfoliosState();
    touch();
    deriveActiveAndAll();
  }, [refreshWalletsState, refreshPortfoliosState, deriveActiveAndAll, touch]);

  // ── MULTI-WALLET MANAGEMENT (re-prompt password to mutate the SEED SET) ──────
  //
  // Adding/importing/removing a SEED re-encrypts the multi-seed container, which
  // needs the vault password. By design we do NOT keep the password in memory
  // (only the seeds are resident, as before) — instead each of these operations
  // takes the password and RE-AUTHENTICATES by decrypting the current vault. A
  // wrong password throws the SAME generic error as unlock and changes nothing.
  // Re-auth before touching the key vault is a deliberate security property.
  //
  // Decrypt the CURRENT primary vault, returning the authoritative container.
  // Doubles as password verification for the mutations below. Primary-only.
  const decryptPrimaryContainer = useCallback(async (password) => {
    const plaintext = await keyStore.unlock(password); // generic throw on wrong pw / no vault
    return mv.parseVault(plaintext).container;
  }, []);

  // ADD a brand-new wallet (new seed) to the vault. Returns { walletId, mnemonic }
  // — the mnemonic ONCE so the UI can run the MANDATORY per-wallet backup screen.
  // The wallet is recorded backedUp:false until confirmWalletBackup() so the
  // prominent unbacked-wallet warning is live until the user confirms.
  const addWallet = useCallback(async (password, opts = {}) => {
    if (isDecoy || isHidden) throw new Error('Adding wallets is unavailable in this session.');
    const { strength = 128, name, enabledAssets } = opts;
    const current = await decryptPrimaryContainer(password); // verifies password
    const mnemonic = generateMnemonic(strength);
    const { container, walletId } = mv.addWallet(current, mnemonic);
    await keyStore.createVault(mv.serializeContainer(container), password);
    containerRef.current = container;
    ensureWalletMeta(walletId, { name: name || `Wallet ${mv.walletCount(container)}`, backedUp: false, enabledAssets });
    assignWalletToPortfolioStore(walletId, activePortfolioRef.current); // joins the current portfolio
    activeIdRef.current = walletId;
    persistActiveWalletId(walletId);
    reconcileWalletMeta(mv.listWalletIds(container));
    refreshWalletsState();
    refreshPortfoliosState();
    touch();
    deriveActiveAndAll();
    return { walletId, mnemonic };
  }, [isDecoy, isHidden, decryptPrimaryContainer, refreshWalletsState, refreshPortfoliosState, deriveActiveAndAll, touch]);

  // IMPORT an existing seed as an ADDITIONAL wallet in the vault. Marked
  // backedUp:true (the user supplied the seed). Rejects a seed already present.
  const importAdditionalWallet = useCallback(async (password, mnemonic, opts = {}) => {
    if (isDecoy || isHidden) throw new Error('Importing wallets is unavailable in this session.');
    const { name, enabledAssets } = opts;
    const current = await decryptPrimaryContainer(password);
    const { container, walletId } = mv.addWallet(current, (mnemonic || '').trim()); // validates + dedupes
    await keyStore.createVault(mv.serializeContainer(container), password);
    containerRef.current = container;
    ensureWalletMeta(walletId, { name: name || `Wallet ${mv.walletCount(container)}`, backedUp: true, enabledAssets });
    assignWalletToPortfolioStore(walletId, activePortfolioRef.current); // joins the current portfolio
    activeIdRef.current = walletId;
    persistActiveWalletId(walletId);
    reconcileWalletMeta(mv.listWalletIds(container));
    refreshWalletsState();
    refreshPortfoliosState();
    touch();
    deriveActiveAndAll();
    return { walletId };
  }, [isDecoy, isHidden, decryptPrimaryContainer, refreshWalletsState, refreshPortfoliosState, deriveActiveAndAll, touch]);

  // REMOVE a wallet (seed) from the vault. Refuses to remove the last wallet (use
  // panicWipe / clearVault to leave nothing). The other wallets are untouched.
  const removeWallet = useCallback(async (password, walletId) => {
    if (isDecoy || isHidden) throw new Error('Removing wallets is unavailable in this session.');
    const current = await decryptPrimaryContainer(password);
    const container = mv.removeWallet(current, walletId); // throws if last / not found
    await keyStore.createVault(mv.serializeContainer(container), password);
    containerRef.current = container;
    removeWalletMeta(walletId);
    const ids = mv.listWalletIds(container);
    if (activeIdRef.current === walletId) {
      activeIdRef.current = ids[0];
      persistActiveWalletId(ids[0]);
    }
    reconcileWalletMeta(ids);
    refreshWalletsState();
    refreshPortfoliosState();
    touch();
    deriveActiveAndAll();
  }, [isDecoy, isHidden, decryptPrimaryContainer, refreshWalletsState, refreshPortfoliosState, deriveActiveAndAll, touch]);

  // Reveal a wallet's mnemonic FOR BACKUP from the in-memory container (the
  // session already holds every seed while unlocked, so this needs no password —
  // it is the same exposure as withPrivateKey). LIVE SECRET: the caller shows it
  // once for backup and must never persist it. Returns null when locked.
  const revealWalletMnemonic = useCallback((walletId) => {
    const c = containerRef.current;
    if (!c) return null;
    const w = mv.findWallet(c, walletId || activeIdRef.current);
    return w ? w.mnemonic : null;
  }, []);

  // Confirm the user has backed up a wallet's seed (defaults to the active one).
  // Cheap localStorage flip — no password, no re-encrypt (it is not secret).
  const confirmWalletBackup = useCallback((walletId) => {
    const id = walletId || activeIdRef.current;
    if (!id) return;
    setWalletBackedUp(id, true);
    refreshWalletsState();
  }, [refreshWalletsState]);

  // Rename a wallet (cosmetic, non-secret localStorage; no password needed).
  const renameWallet = useCallback((walletId, name) => {
    setWalletName(walletId, name);
    refreshWalletsState();
  }, [refreshWalletsState]);

  // Switch the ACTIVE wallet (what send/receive/derivation act on). Cheap —
  // re-derives the active accounts; no password, no vault read.
  const switchWallet = useCallback((walletId) => {
    const c = containerRef.current;
    if (!c || !mv.findWallet(c, walletId)) return;
    activeIdRef.current = walletId;
    persistActiveWalletId(walletId);
    setActiveWalletIdState(walletId);
    touch();
    deriveActiveAndAll();
  }, [deriveActiveAndAll, touch]);

  // Per-wallet asset visibility (non-secret localStorage; no password).
  const setWalletAssets = useCallback((walletId, symbols) => {
    setWalletEnabledAssets(walletId, symbols);
    refreshWalletsState();
  }, [refreshWalletsState]);
  const toggleWalletAsset = useCallback((walletId, symbol) => {
    toggleWalletAssetMeta(walletId, symbol);
    refreshWalletsState();
  }, [refreshWalletsState]);

  // ── EXPLORE-FIRST ONBOARDING ────────────────────────────────────────────────
  const enterExplore = useCallback(() => setExploreMode(true), []);
  const leaveExplore = useCallback(() => setExploreMode(false), []);
  // requireWallet(): a wallet-requiring action was tapped while exploring (no
  // vault yet). Leave explore so the gate surfaces the create/import flow. Returns
  // true when the action is BLOCKED (no unlocked wallet) so callers short-circuit.
  const requireWallet = useCallback(() => {
    if (isUnlocked) return false;
    setExploreMode(false);
    return true;
  }, [isUnlocked]);

  // ── PORTFOLIO MANAGEMENT (non-secret grouping; no password, no vault read) ───
  // Disabled in a decoy/hidden session (single-wallet, ephemeral — never mutate
  // the persisted portfolio store there).
  const setActivePortfolio = useCallback((portfolioId) => {
    const id = portfolioId || MAIN_PORTFOLIO_ID;
    activePortfolioRef.current = id;
    persistActivePortfolioId(id);
    setActivePortfolioIdState(id);
  }, []);
  const createPortfolio = useCallback((name) => {
    if (isDecoy || isHidden) return null;
    const p = createPortfolioStore(name);
    refreshPortfoliosState();
    return p;
  }, [isDecoy, isHidden, refreshPortfoliosState]);
  const renamePortfolio = useCallback((id, name) => {
    if (isDecoy || isHidden) return;
    renamePortfolioStore(id, name);
    refreshPortfoliosState();
  }, [isDecoy, isHidden, refreshPortfoliosState]);
  const deletePortfolio = useCallback((id) => {
    if (isDecoy || isHidden) return;
    deletePortfolioStore(id);
    refreshPortfoliosState();
  }, [isDecoy, isHidden, refreshPortfoliosState]);
  const assignWalletToPortfolio = useCallback((walletId, portfolioId) => {
    if (isDecoy || isHidden) return;
    assignWalletToPortfolioStore(walletId, portfolioId);
    refreshPortfoliosState();
  }, [isDecoy, isHidden, refreshPortfoliosState]);

  // CHANGE THE VAULT PASSWORD (S1 — Account Access / Reset). Re-encrypt the
  // existing vault under a new password while keeping the SAME seed. This is the
  // ONLY "reset" a non-custodial wallet can offer for someone who still knows
  // their password: it re-wraps the seed, it does NOT recover a forgotten one
  // (we hold no key escrow — a forgotten password is recovered ONLY by
  // re-importing the seed via importWallet). It goes through keyStore, which
  // verifies the current password by decrypting the stored blob (a wrong current
  // password throws and changes nothing) and re-encrypts via the unchanged
  // Argon2id+AES-GCM crypto. The seed is unchanged, so the unlocked session and
  // every derived account stay valid — no re-derive, no re-lock. We do NOT hold
  // the password in plaintext, so the caller passes the current password through
  // for verification (defence in depth alongside the unlocked session).
  const changePassword = useCallback(async (currentPassword, newPassword) => {
    await keyStore.changePassword(currentPassword, newPassword);
    // If biometric one-tap unlock is on, the cached password just went stale —
    // re-cache the NEW one so Face ID keeps working. (Best-effort; if it fails
    // the user still has the new password as the fallback.)
    // Never re-cache the REAL PIN behind the biometric gate (KEK spec §2/§11
    // Face-ID-to-decoy guard; decision lives in shouldCacheUnlockSecret,
    // lib/authModel.js). In the
    // PIN cohort the biometric cache holds the DURESS PIN (Face-ID-to-decoy); the
    // secret changed here is the REAL PIN, and caching it would make Face ID open
    // the real set — the coercion bypass §2/§11 forbid. Password cohort is
    // unchanged (re-cache the new password so Face ID keeps working).
    if (shouldCacheUnlockSecret({ authModel: getAuthModel(), biometricEnabled: isBiometricUnlockEnabled() })) {
      try { await storeUnlockSecret(newPassword); } catch { /* fall back to password */ }
    }
    // Keep the session alive on its existing in-memory secret. touch() resets the
    // idle auto-lock so a successful change doesn't leave a stale countdown.
    touch();
  }, [touch]);

  // Unlock an existing vault with the password.
  //
  // opts.skipPasskey (SAST M-3 ESCAPE HATCH): when true, bypass the passkey gate
  // and unlock with the password alone. This is NOT a casual "skip the 2nd
  // factor" path — the UI only offers it AFTER the passkey gate has actually
  // FAILED (a broken/deleted/unavailable credential), and it STILL requires the
  // correct vault password below (the password is the real control, so this is
  // no weaker than the app's baseline custody). A plain cancel of a WORKING
  // passkey does NOT set this — that still fails closed. See lib/passkey.js.
  //
  // Returns { passkeySkipped } so the caller can SIGNAL to the user when the
  // passkey factor was dropped (escape hatch taken, or no authenticator
  // available) instead of silently proceeding (SAST M-1/M-2).
  const unlock = useCallback(async (password, opts = {}) => {
    // PROVISIONAL app-layer biometric gate. In demo this shows the simulated
    // prompt; on native the real OS prompt fires inside keyStore.unlock(). A
    // cancel here throws a BiometricGateError and aborts the unlock before any
    // vault read.
    //
    // opts.skipBiometric (ESCAPE HATCH, dual of opts.skipPasskey): when true,
    // bypass the app-layer biometric prompt and unlock with the password alone.
    // The UI only offers this AFTER the biometric gate has actually FAILED, and
    // it STILL requires the correct vault password below — so it is NO weaker
    // than the app's baseline custody. It exists so a failed/cancelled biometric
    // can never permanently strand a user from a vault their password opens.
    // (On native the OS biometric sheet lives inside keyStore.unlock() and is
    // not affected by this app-layer skip; the OS provides its own passcode
    // fallback there. This hatch covers the demo/app-layer gate.)
    if (!opts.skipBiometric) {
      await runBiometricGate();
    }
    // PASSKEY GATE (S1): an additional FIDO2 factor, parallel to the biometric
    // gate. No-op unless the user registered a passkey AND enabled the toggle.
    // A cancel/failure throws (fail closed) and aborts the unlock before any
    // vault read; the password remains the independent path that decrypts the
    // vault. The deliberate password-only escape hatch (opts.skipPasskey) is the
    // ONLY way past a failed gate, and it still requires the password below.
    let passkeySkipped = null;
    if (opts.skipPasskey) {
      passkeySkipped = 'escape-hatch';
    } else {
      const gate = await runPasskeyGate();
      if (gate.status === PASSKEY_GATE.UNAVAILABLE) passkeySkipped = 'unavailable';
    }
    // Signal (not secret) when the biometric convenience factor was bypassed via
    // the escape hatch, so the UI can disclose it rather than silently proceed.
    const biometricSkipped = opts.skipBiometric ? 'escape-hatch' : null;
    // keyStore.unlock throws "No wallet found on this device" when absent and
    // rethrows decryptVault's wrong-password/tamper error — same as before.
    let mnemonic;
    let decoy = false;
    let hidden = false;
    try {
      mnemonic = await keyStore.unlock(password);
    } catch (primaryErr) {
      // The primary unlock failed. BEFORE surfacing that failure, consult the
      // deniability/emergency paths. resolveDeniabilityUnlock (SAST M2) runs a
      // CONSTANT number of Argon2id KDFs (exactly 3) regardless of which features
      // are configured and with NO early-return short-circuit, so the presence and
      // COUNT of panic/duress/hidden cannot be inferred by timing wrong guesses at
      // the prompt. We evaluate all paths, then branch on the boolean results here
      // in priority order. On a total miss we re-throw the ORIGINAL primary error,
      // so the message, behaviour, and work-per-attempt are identical whether or
      // not any feature is in use — no tell.
      //
      //   0. PANIC WIPE (wallet-core/panic.js): a dedicated panic PIN that
      //      IRREVERSIBLY destroys all local key material. Acted on FIRST so a
      //      deliberate destroy intent is never shadowed by another path. NO
      //      confirmation — under genuine duress a dialog is a liability. After the
      //      wipe we throw the SAME generic primary error (a wrong-password look),
      //      so the prompt gives no triumphant "wiped!" tell. A wrong password can
      //      never match (exact GCM decrypt).
      //   1. DURESS / DECOY (wallet-core/duress.js): a secondary password that
      //      opens a low-value decoy surrendered under coercion.
      //   2. STEALTH / HIDDEN WALLETS (wallet-core/stealth.js): a dedicated secret
      //      that reveals one of the user's HIDDEN wallets, via the SAME prompt.
      // opts.pinModel: set by the PIN-cohort entry point (WalletEntry's PIN pad).
      // It enables Option A — a non-enrolled PIN opens a deterministic decoy below
      // instead of throwing. The password cohort never sets it (unchanged behaviour).
      const pinModel = opts.pinModel === true;
      const { panic, duressMnemonic, hiddenMnemonic, fallbackDecoyMnemonic } =
        await resolveDeniabilityUnlock(
          password,
          pinModel
            ? { deterministicFallback: true, deviceSalt: getOrCreateDeviceSalt() }
            : {},
        );
      if (panic) {
        await panicWipe();
        throw primaryErr; // keys destroyed; surface a plain wrong-password failure
      }
      if (duressMnemonic != null) {
        mnemonic = duressMnemonic;
        decoy = true;
      } else if (hiddenMnemonic != null) {
        mnemonic = hiddenMnemonic;
        hidden = true;
      } else if (fallbackDecoyMnemonic != null) {
        // OPTION A (§7): a non-enrolled PIN opens a fresh, empty, deterministic
        // decoy as an ephemeral session — NO error state, NO oracle. PIN cohort
        // only (fallback is null for the password cohort, which throws below).
        mnemonic = fallbackDecoyMnemonic;
        decoy = true;
      } else {
        throw primaryErr; // password cohort total miss: unchanged behaviour
      }
    }
    // `mnemonic` here is the DECRYPTED payload: on the primary path it is a
    // multi-seed container JSON (or a legacy bare mnemonic to be migrated); on
    // the deniability path it is a single bare decoy/hidden mnemonic. parseVault
    // normalises both into a container (the decoy/hidden one in-memory only).
    const { container, migrated } = mv.parseVault(mnemonic);
    containerRef.current = container;
    const isPrimary = !decoy && !hidden;

    if (isPrimary) {
      // LOSSLESS SINGLE-SEED -> MULTI-SEED MIGRATION. If the primary vault was a
      // legacy bare mnemonic, re-encrypt it as a container under the SAME password
      // and persist. Best-effort (mirrors the M3 KDF rekey): a failed re-encrypt
      // must NOT block unlock — the user still gets their wallet and migration
      // retries on the next unlock. The decrypt above already used the unchanged
      // crypto, so the wallet's funds/addresses are byte-identical.
      if (migrated) {
        const firstId = mv.listWalletIds(container)[0];
        // The migrated wallet went through mandatory backup at its ORIGINAL
        // creation, so backedUp:true (no spurious nag for existing users), and it
        // keeps ALL assets visible so nothing the user saw disappears.
        ensureWalletMeta(firstId, { name: 'Wallet 1', backedUp: true, enabledAssets: [...ALL_ASSET_SYMBOLS] });
        try { await keyStore.createVault(mv.serializeContainer(container), password); }
        catch { /* best-effort; retried next unlock */ }
      }
      const { activeWalletId: active } = reconcileWalletMeta(mv.listWalletIds(container));
      activeIdRef.current = active;
      setIsDecoy(false);
      setIsHidden(false);
      refreshWalletsState();
      refreshPortfoliosState();
      // SELF-HEAL: a PIN-cohort device must always carry both deniability slots
      // (storage-footprint parity). If an earlier provision failed, backfill chaff
      // now. Idempotent + never-overwrite, so this never clobbers a personalized
      // credential and never runs for the password cohort. Best-effort (mirrors
      // ensureStealthPool): a storage hiccup must not block unlock. opts.pinModel
      // is the PIN-cohort gate (pinModel const is scoped to the catch block above).
      if (opts.pinModel === true) void provisionDeniabilityChaff().catch(() => {});
    } else {
      // DECOY / HIDDEN: a single-wallet, EPHEMERAL session. We do NOT persist a
      // container or touch walletMeta — the duress/stealth storages stay exactly
      // as those features wrote them (a single bare mnemonic), preserving their
      // plausible deniability. Build transient public state in-memory only, so the
      // coerced/observed view looks like an ordinary single-wallet wallet.
      const ids = mv.listWalletIds(container);
      activeIdRef.current = ids[0];
      setIsDecoy(decoy);
      setIsHidden(hidden);
      setWallets(ids.map((id, i) => ({ id, name: `Wallet ${i + 1}`, backedUp: true, enabledAssets: [...ALL_ASSET_SYMBOLS] })));
      setActiveWalletIdState(ids[0]);
      // Transient single "Main" portfolio for the decoy/hidden session — never
      // touch the persisted portfolio store (deniability + no pollution).
      setPortfolios([{ id: MAIN_PORTFOLIO_ID, name: 'Main' }]);
      setWalletPortfolioMap({ [ids[0]]: MAIN_PORTFOLIO_ID });
      activePortfolioRef.current = MAIN_PORTFOLIO_ID;
      setActivePortfolioIdState(MAIN_PORTFOLIO_ID);
    }

    setUnlocked(true);
    setExploreMode(false);
    setWasWiped(false); // a wallet opened successfully; clear any prior wipe signal
    // Keep the chaff pool seeded for this device (idempotent; never overwrites a
    // real hidden-wallet slot). Best-effort. See createWallet for the rationale.
    void ensureStealthPool().catch(() => {});
    touch();
    deriveActiveAndAll();
    // Signal (not secret): tell the caller whether either convenience factor was
    // dropped for this unlock so the UI can disclose it rather than silently
    // proceeding.
    return { passkeySkipped, biometricSkipped };
  }, [refreshWalletsState, refreshPortfoliosState, deriveActiveAndAll, touch, runBiometricGate, runPasskeyGate, panicWipe]);

  // BIOMETRIC ONE-TAP UNLOCK (convenience over the existing vault).
  //
  // enableBiometricUnlock(password): turn on Face ID unlock for a returning
  // session. Called by first-run create/import (the only places that legitimately
  // hold the plaintext vault password). It runs the biometric prompt once to
  // confirm the user can satisfy it, then caches the password behind the
  // biometric gate (lib/biometricUnlock.js) and flips the persisted preference.
  // The password stays THE secret and the always-available fallback; this adds a
  // convenience factor and NEVER weakens the vault. Returns false (and enables
  // nothing) on plain web or when biometrics are unavailable/cancelled.
  const enableBiometricUnlock = useCallback(async (password) => {
    const status = await getBiometricStatus();
    if (!status.available) return false; // web / no platform biometric → password only
    if (status.mode === 'demo') {
      try { await showSimulatedPrompt(status); } // prove it works now; cancel → don't enable
      catch { return false; }
    }
    // native available: the REAL OS sheet gates retrieval at unlock time; store now.
    try {
      const stored = await storeUnlockSecret(password);
      if (!stored) return false;
    } catch { return false; }
    setBiometricUnlockEnabled(true);
    return true;
  }, [showSimulatedPrompt]);

  // Turn Face ID unlock back off: clear the persisted preference AND wipe the
  // cached password so it never lingers at rest once the feature is disabled.
  const disableBiometricUnlock = useCallback(async () => {
    setBiometricUnlockEnabled(false);
    try { await clearUnlockSecret(); } catch { /* best-effort */ }
  }, []);

  // unlockWithBiometric(): the one-tap returning-user path. Satisfy the biometric
  // gate, retrieve the cached vault password, then unlock with it.
  //   - demo: the clearly-labelled SIMULATED prompt is shown here.
  //   - native: retrieveUnlockSecret() now performs a REAL OS biometric match as
  //     a hard precondition of releasing the cached password (lib/biometricUnlock
  //     chokepoint); a cancel/failure THROWS and the secret is never read. We map
  //     that throw to a BiometricGateError so the UI falls back to the password.
  //     keyStore.unlock() below then presents its OWN OS biometric sheet to gate
  //     the vault-blob decrypt — so native one-tap shows the sheet twice (the
  //     disclosed cost of OS-enforcing the cache without touching wallet-core).
  // We pass skipBiometric so the app-layer (demo) gate isn't run twice. THROWS a
  // BiometricGateError on cancel/unavailable/missing-cache so the UI falls back
  // to the vault password field — which always works (it is the real key).
  const unlockWithBiometric = useCallback(async () => {
    const status = await getBiometricStatus();
    if (!status.available) throw new BiometricGateError('unavailable');
    if (status.mode === 'demo') {
      try { await showSimulatedPrompt(status); }
      catch (err) { throw new BiometricGateError('cancelled', err); }
    }
    // native: the OS biometric sheet fires inside retrieveUnlockSecret() (to
    // release the cache) and again inside keyStore.unlock() (to read the vault).
    let password;
    try {
      password = await retrieveUnlockSecret();
    } catch (err) {
      // A cancelled/failed biometric match on the cache release. Fail closed and
      // route to the password fallback, same as a cancelled demo prompt.
      throw new BiometricGateError('cancelled', err);
    }
    if (password == null) throw new BiometricGateError('no-secret');
    return unlock(password, { skipBiometric: true });
  }, [showSimulatedPrompt, unlock]);

  // PROVISIONAL: fire the prompt on demand for the Security settings "Test"
  // button, so the simulated sheet can be shown on the simulator without an
  // actual unlock. Resolves true on success, false on cancel. Demo-only today;
  // native/web report status without an OS prompt to avoid a confusing no-op.
  const biometricPreview = useCallback(async () => {
    const status = await getBiometricStatus();
    if (status.mode !== 'demo') return false;
    try {
      await showSimulatedPrompt(status);
      return true;
    } catch {
      return false;
    }
  }, [showSimulatedPrompt]);

  // PASSKEY (S1): fire the gate on demand for the Security settings "Test"
  // button. In demo this shows the simulated sheet; on real web it presents the
  // browser passkey sheet for the registered credential. Resolves true on a
  // successful assertion, false on cancel/failure. Returns no secret.
  const passkeyPreview = useCallback(async () => {
    const status = await getPasskeyStatus();
    try {
      if (status.mode === 'demo') {
        await showSimulatedPasskeyPrompt(status);
        return true;
      }
      if (!status.registered || !status.available) return false;
      await verifyPasskeyAssertion();
      return true;
    } catch {
      return false;
    }
  }, [showSimulatedPasskeyPrompt]);

  // Provide the private key for a derivation index to a caller that needs to
  // sign, WITHOUT storing it. The caller (send flow) uses it immediately and
  // lets it go out of scope. Never log or persist the return value.
  const withPrivateKey = useCallback((index, fn) => {
    const active = getActiveMnemonic();
    if (!active) throw new Error('Wallet is locked');
    touch();
    const { privateKey } = deriveEvmAccount(active, index);
    return fn(privateKey);
  }, [touch]);

  // BTC counterpart: provide the BIP-84 private+public key bytes for the BTC
  // account transiently to a signer (e.g. the send path), WITHOUT storing them.
  // Same contract as withPrivateKey — used immediately, then dropped. Never log.
  const withBtcPrivateKey = useCallback((fn, networkKey = 'testnet') => {
    const active = getActiveMnemonic();
    if (!active) throw new Error('Wallet is locked');
    touch();
    const { privateKey, publicKey, address } = deriveBtcAccount(active, { networkKey });
    return fn({ privateKey, publicKey, address });
  }, [touch]);

  // SOL counterpart: provide the ed25519 private+public key bytes for the Solana
  // account transiently to a signer (e.g. the send path), WITHOUT storing them.
  // privateKey is the 32-byte ed25519 seed scalar. Same contract as the others —
  // used immediately, then dropped. Never log. networkKey is accepted for API
  // symmetry (the same address derives across all Solana clusters).
  const withSolPrivateKey = useCallback((fn) => {
    const active = getActiveMnemonic();
    if (!active) throw new Error('Wallet is locked');
    touch();
    const { privateKey, publicKey, address } = deriveSolAccount(active);
    return fn({ privateKey, publicKey, address });
  }, [touch]);

  // DURESS / DECOY management (S3). Configure or remove the decoy vault that the
  // duress password opens. setDuressPin generates a FRESH decoy BIP-39 mnemonic,
  // encrypts it with the duress password via the SAME crypto as the primary
  // vault, and persists it (see wallet-core/duress.js). It returns the decoy
  // mnemonic ONCE so the demo can display a backup; callers must not persist the
  // return value. The duress password must differ from the real one (the caller
  // validates) — if they matched, the primary unlock would win and the decoy
  // would never open. These never touch networks/signing: testnet-safe.
  const setDuressPin = useCallback(async (duressPassword, strength = 128) => {
    const decoyMnemonic = generateMnemonic(strength);
    await setDuressVault(decoyMnemonic, duressPassword);
    // Also return the decoy's PUBLIC EVM address so the UI can show where to
    // FUND the decoy (a decoy is only plausible once it holds a small, real,
    // block-explorer-verifiable amount). Derived here from the in-memory decoy
    // mnemonic via the SAME derivation as the primary wallet; no key persisted.
    const { address } = deriveEvmAccount(decoyMnemonic, 0);
    return { mnemonic: decoyMnemonic, address };
  }, []);

  const removeDuressPin = useCallback(() => clearDuressVault(), []);

  // STEALTH / HIDDEN WALLETS management (S3). Create a hidden wallet revealed by
  // a dedicated secret entered at the normal unlock prompt. Generates a FRESH
  // BIP-39 mnemonic, encrypts it with the secret via the SAME crypto as the
  // primary vault, and stores it in the secret's slot in the chaff pool (see
  // wallet-core/stealth.js). Returns { mnemonic, address } ONCE so the UI can
  // show a backup + a fund-me address; callers must not persist the return value.
  // The secret must differ from the primary password and any duress PIN (the
  // page warns — we never hold those in plaintext to check). Touches no network
  // or signing: testnet-safe.
  // Returns the hidden wallet's full PUBLIC multi-chain identity (evm/btc/sol
  // addresses) so the UI can show every fund target. A hidden wallet is a real
  // BIP-39 wallet, so these come from the SAME derivation as the primary wallet
  // (see wallet-core/stealth.js -> deriveHiddenIdentity). Address derivation is
  // local — no network query, no balance fetch (that is opt-in in the UI for
  // privacy; see lib/hiddenBalance.js).
  const addHiddenWallet = useCallback(async (secret, strength = 128) => {
    const { mnemonic, address, evm, btc, sol, existing } = await createHiddenWallet(secret, strength);
    return { mnemonic, address, evm, btc, sol, existing };
  }, []);

  // STEALTH — MOVE AN EXISTING WALLET INTO HIDDEN (S3). Takes a wallet the user
  // already has (its recovery phrase) and stores it in the hidden pool under a
  // reveal secret, reusing the SAME store path as addHiddenWallet (see
  // wallet-core/stealth.js -> moveWalletToHidden). It self-verifies the wallet is
  // revealable BEFORE returning, so the caller may purge the wallet's visible
  // record only after this resolves (never lose a wallet mid-move). Returns the
  // wallet's PUBLIC EVM address + slot. This is the RISKIER "hide a previously-
  // visible wallet" variant — the caller MUST show the transition-tell warning.
  const moveWalletHidden = useCallback((mnemonic, secret) => moveWalletToHidden(mnemonic, secret), []);

  // Read-only peek: does `secret` reveal a hidden wallet, and at what PUBLIC EVM
  // address? Returns { address } or null WITHOUT changing the unlocked session
  // (unlike unlock(), which opens it). The caller must already know the secret, so
  // this leaks nothing; used by the move flow to prove a wallet was hidden, and a
  // wrong secret returns null exactly like a miss. Never returns key material.
  const peekHiddenWallet = useCallback(async (secret) => {
    const m = await tryRevealHidden(secret);
    if (m == null) return null;
    const { address } = deriveEvmAccount(m, 0);
    return { address };
  }, []);

  // Seed the chaff pool on demand (idempotent, non-destructive). Used by the
  // management/demo UI so the pool exists before a reveal is attempted.
  const initStealthPool = useCallback(() => ensureStealthPool(), []);
  // Coarse local wipe of every stealth slot (real + chaff). Demo reset / panic.
  const removeAllHiddenWallets = useCallback(() => wipeStealthPool(), []);

  // PANIC WIPE management (S3 — see wallet-core/panic.js + panicWipe above).
  // setPanicPin stores the panic-PIN marker; removePanicPin clears just that
  // marker (wiping nothing else); hasPanicPin is the raw store check;
  // inspectKeyMaterial is the NON-destructive "what local key material exists?"
  // probe used to PROVE a wipe left nothing recoverable. setPanicPin must differ
  // from the primary/duress/stealth secrets (the page warns — we never hold those
  // in plaintext to check). None of these touch networks/signing: testnet-safe.
  const setPanicPin = useCallback((panicPassword) => setPanicVault(panicPassword), []);
  const removePanicPin = useCallback(() => clearPanicVault(), []);

  const value = {
    isUnlocked,
    // ── MULTI-WALLET (feat/multi-wallet-portfolio) ──
    // Public per-wallet info [{ id, name, backedUp, enabledAssets }] — no seeds.
    wallets,
    // Active wallet id (what send/receive/derivation act on) + switcher.
    activeWalletId,
    switchWallet,
    // Public addresses per wallet for the unified portfolio: { id: {evm,btc,sol} }.
    walletAddresses,
    // Mutations: add (new seed), import-additional (existing seed), remove. Each
    // takes the vault password (re-auth) and re-encrypts the multi-seed container.
    addWallet,
    importAdditionalWallet,
    removeWallet,
    // Cheap, non-secret (localStorage) per-wallet updates — no password needed.
    confirmWalletBackup,
    renameWallet,
    setWalletAssets,
    toggleWalletAsset,
    // Reveal a wallet's seed for the mandatory backup screen (LIVE SECRET).
    revealWalletMnemonic,
    // PORTFOLIOS: named groups of wallets (one-portfolio-per-wallet; "Main" default).
    portfolios,
    activePortfolioId,
    walletPortfolioMap,
    setActivePortfolio,
    createPortfolio,
    renamePortfolio,
    deletePortfolio,
    assignWalletToPortfolio,
    // EXPLORE-FIRST ONBOARDING: view-only browse before any wallet exists.
    exploreMode,
    enterExplore,
    leaveExplore,
    requireWallet,
    // DURESS / DECOY (S3): is the current session a decoy? Off by default.
    isDecoy,
    // STEALTH (S3): is the current session a revealed HIDDEN wallet? Off by
    // default. Like isDecoy, the normal wallet UI must NOT surface this.
    isHidden,
    accounts,
    // Phase BTC: public BIP-84 account {address, path, networkKey} (testnet),
    // null while locked. deriveBtc() re-derives for a given network;
    // withBtcPrivateKey() hands the transient signing key to the send path.
    btcAccount,
    deriveBtc,
    withBtcPrivateKey,
    // Phase SOL: public Solana account {address, path, networkKey} (devnet),
    // null while locked. deriveSol() re-derives; withSolPrivateKey() hands the
    // transient ed25519 signing key to the send path.
    solAccount,
    deriveSol,
    withSolPrivateKey,
    hasVault: keyStore.hasVault,
    // Duress / decoy controls (see wallet-core/duress.js). hasDuressPin() is the
    // raw store check; set/remove manage the decoy vault.
    hasDuressPin: hasDuressVault,
    setDuressPin,
    removeDuressPin,
    // Stealth / hidden-wallet controls (see wallet-core/stealth.js). hasStealthPool
    // reflects only the universal baseline pool, NOT whether hidden wallets exist.
    addHiddenWallet,
    // Move an EXISTING wallet (recovery phrase) into hidden + read-only peek.
    moveWalletToHidden: moveWalletHidden,
    peekHiddenWallet,
    hasStealthPool,
    initStealthPool,
    removeAllHiddenWallets,
    // PANIC WIPE (S3 — Direction-C). wasWiped: did a panic wipe destroy local key
    // material this session? panicWipe(): the destructive action (returns a
    // post-wipe report). set/remove/hasPanicPin manage the panic PIN; the panic
    // PIN also fires panicWipe automatically when entered at the unlock prompt.
    // inspectKeyMaterial(): non-destructive proof of what local key material exists.
    wasWiped,
    panicWipe,
    // FAIL-CLOSED ONBOARDING ROLLBACK: tear down a half-provisioned PIN wallet
    // when chaff provisioning fails mid-creation (lib/pinOnboarding.js). Setup
    // rollback, not a panic wipe (no wasWiped). Wired by WalletEntry's orchestrators.
    discardIncompleteWallet,
    hasPanicPin: hasPanicVault,
    setPanicPin,
    removePanicPin,
    inspectKeyMaterial,
    createWallet,
    importWallet,
    unlock,
    // Account Access / Reset (S1): re-encrypt the vault under a new password
    // (same seed). NOT recovery — a forgotten password is recovered only by
    // re-importing the seed via importWallet. See pages/WalletAccessReset.jsx.
    changePassword,
    lock,
    deriveAccounts,
    withPrivateKey,
    clearVault: keyStore.clearVault,
    biometricPreview,
    // BIOMETRIC ONE-TAP UNLOCK (convenience over the vault; password stays the
    // fallback). enableBiometricUnlock(password) caches the password behind the
    // biometric gate (used by first-run create/import); disableBiometricUnlock()
    // turns it off and wipes the cache; unlockWithBiometric() is the returning-
    // user one-tap path. See lib/biometricUnlock.js.
    enableBiometricUnlock,
    disableBiometricUnlock,
    unlockWithBiometric,
    // PASSKEY (S1): preview/test the passkey gate from settings. Registration,
    // removal, status and the unlock preference are read/written directly from
    // lib/passkey.js by the settings UI; only the gate + simulated prompt need
    // to live here (the overlay is rendered by this provider).
    passkeyPreview,
    // Session / auto-lock controls (see lib/session.js). UI reads the current
    // timeout preference and changes it; lock status is `isUnlocked` above.
    autoLockValue,
    setAutoLockTimeout,
  };

  return (
    <WalletCtx.Provider value={value}>
      {children}
      {/* PROVISIONAL / demo-only simulated biometric sheet. On native the real
          OS prompt is shown by the OS from inside keyStore.unlock(). */}
      {bioPrompt && (
        <BiometricPrompt label={bioPrompt.label} onResult={resolveBioPrompt} />
      )}
      {/* PROVISIONAL / demo-only simulated passkey sheet (S1). On real web the
          browser presents the actual passkey sheet from verifyPasskeyAssertion. */}
      {passkeyPrompt && (
        <PasskeyPrompt label={passkeyPrompt.label} onResult={resolvePasskeyPrompt} />
      )}
    </WalletCtx.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletCtx);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
