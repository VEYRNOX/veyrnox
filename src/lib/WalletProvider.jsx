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
import { getKeyStore } from '@/wallet-core/keystore';
import {
  tryDuressUnlock,
  setDuressVault,
  clearDuressVault,
  hasDuressVault,
} from '@/wallet-core/duress';
import { isBiometricUnlockEnabled, getBiometricStatus } from '@/lib/biometric';
import {
  loadAutoLockValue,
  saveAutoLockValue,
  autoLockMsFromValue,
} from '@/lib/session';
import BiometricPrompt from '@/components/security/BiometricPrompt';

const WalletCtx = createContext(null);

// User activity that should reset the idle auto-lock timer while unlocked.
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'focus'];
// Throttle re-arming the timer so a burst of activity doesn't thrash setTimeout.
const ACTIVITY_THROTTLE_MS = 1000;

// Platform-resolved storage seam. Web today; native (M2b) swaps in behind the
// same interface. Stable singleton, so it lives at module scope.
const keyStore = getKeyStore();

export function WalletProvider({ children }) {
  const mnemonicRef = useRef(null);      // LIVE SECRET while unlocked
  const [isUnlocked, setUnlocked] = useState(false);
  // DURESS / DECOY (S3): true when the CURRENT session was opened with the
  // duress password (a decoy vault) rather than the real one. Internal flag for
  // app logic; the normal wallet UI deliberately does NOT surface it, so a
  // coercer sees no "decoy mode" indicator. See wallet-core/duress.js.
  const [isDecoy, setIsDecoy] = useState(false);
  const [accounts, setAccounts] = useState([]); // public only: {address, path, index}
  // Phase BTC: the wallet's BIP-84 testnet account (PUBLIC only: {address, path}).
  // Derived from the SAME in-memory mnemonic alongside the EVM accounts; kept in
  // separate state so the EVM derivation path is untouched. Default network is
  // testnet (mainnet gated in btc/networks.js). null while locked.
  const [btcAccount, setBtcAccount] = useState(null);
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
  const runBiometricGate = useCallback(async () => {
    if (!isBiometricUnlockEnabled()) return;
    const status = await getBiometricStatus();
    if (status.mode === 'demo') {
      await showSimulatedPrompt(status); // rejects on cancel → aborts unlock
    }
    // native/web: no app-layer prompt (see comment above).
  }, [showSimulatedPrompt]);

  const lock = useCallback(() => {
    if (mnemonicRef.current) {
      // best-effort overwrite before dropping the reference
      try { mnemonicRef.current = '\u0000'.repeat(mnemonicRef.current.length); } catch { /* noop */ }
    }
    mnemonicRef.current = null;
    setUnlocked(false);
    setIsDecoy(false);
    setAccounts([]);
    setBtcAccount(null);
    keyStore.lock(); // no-op on web; drops the hardware grant on native (M2b)
  }, []);

  // (Re)arm the idle auto-lock timer for the CURRENT timeout preference. Safe to
  // call anytime: it clears any pending timer first, and arms a new one only
  // while unlocked and when the user hasn't chosen "Never". This is the single
  // idle-lock mechanism — it routes through lock() exactly like every other path.
  const armTimer = useCallback(() => {
    if (lockTimer.current) { clearTimeout(lockTimer.current); lockTimer.current = null; }
    if (!mnemonicRef.current) return;        // locked → nothing to arm
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

  // Derive a set of public accounts from the in-memory mnemonic.
  const deriveAccounts = useCallback((count = 1) => {
    if (!mnemonicRef.current) throw new Error('Wallet is locked');
    const list = [];
    for (let i = 0; i < count; i++) {
      const { address, path } = deriveEvmAccount(mnemonicRef.current, i);
      list.push({ address, path, index: i }); // NOTE: no privateKey stored here
    }
    setAccounts(list);
    return list;
  }, []);

  // Derive the BIP-84 BTC account (PUBLIC address only) from the in-memory
  // mnemonic. Separate from deriveAccounts() so the EVM path is untouched.
  // Defaults to testnet; returns {address, path}. No keys stored here.
  const deriveBtc = useCallback((networkKey = 'testnet') => {
    if (!mnemonicRef.current) throw new Error('Wallet is locked');
    const { address, path } = deriveBtcAccount(mnemonicRef.current, { networkKey });
    const acct = { address, path, networkKey };
    setBtcAccount(acct);
    return acct;
  }, []);

  // Create a brand-new wallet: generate -> encrypt -> persist ciphertext -> unlock.
  const createWallet = useCallback(async (password, strength = 128) => {
    const mnemonic = generateMnemonic(strength);
    await keyStore.createVault(mnemonic, password);
    mnemonicRef.current = mnemonic;
    setUnlocked(true);
    setIsDecoy(false);
    touch();
    deriveAccounts(1);
    deriveBtc();
    // Return mnemonic ONCE for the user to back up; caller must not persist it.
    return mnemonic;
  }, [deriveAccounts, deriveBtc, touch]);

  // Import an existing mnemonic.
  const importWallet = useCallback(async (mnemonic, password) => {
    if (!validateMnemonic(mnemonic)) throw new Error('Invalid recovery phrase');
    await keyStore.createVault(mnemonic, password);
    mnemonicRef.current = mnemonic;
    setUnlocked(true);
    setIsDecoy(false);
    touch();
    deriveAccounts(1);
    deriveBtc();
  }, [deriveAccounts, deriveBtc, touch]);

  // Unlock an existing vault with the password.
  const unlock = useCallback(async (password) => {
    // PROVISIONAL app-layer biometric gate. In demo this shows the simulated
    // prompt; on native the real OS prompt fires inside keyStore.unlock(). A
    // cancel here throws and aborts the unlock before any vault read.
    await runBiometricGate();
    // keyStore.unlock throws "No wallet found on this device" when absent and
    // rethrows decryptVault's wrong-password/tamper error — same as before.
    let mnemonic;
    let decoy = false;
    try {
      mnemonic = await keyStore.unlock(password);
    } catch (primaryErr) {
      // DURESS / DECOY (S3). The primary unlock failed. BEFORE surfacing that
      // failure, check whether this password opens a DECOY (duress) vault. On a
      // miss we re-throw the ORIGINAL error, so the message, behaviour, and
      // work-per-attempt are identical whether or not a duress vault exists —
      // the duress path leaves no tell at the unlock prompt. tryDuressUnlock
      // returns null (never throws) on a wrong password / no decoy configured.
      // See wallet-core/duress.js for the design and its honest limitations.
      const decoyMnemonic = await tryDuressUnlock(password);
      if (decoyMnemonic == null) throw primaryErr;
      mnemonic = decoyMnemonic;
      decoy = true;
    }
    mnemonicRef.current = mnemonic;
    setUnlocked(true);
    setIsDecoy(decoy);
    touch();
    deriveAccounts(1);
    deriveBtc();
  }, [deriveAccounts, deriveBtc, touch, runBiometricGate]);

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

  // Provide the private key for a derivation index to a caller that needs to
  // sign, WITHOUT storing it. The caller (send flow) uses it immediately and
  // lets it go out of scope. Never log or persist the return value.
  const withPrivateKey = useCallback((index, fn) => {
    if (!mnemonicRef.current) throw new Error('Wallet is locked');
    touch();
    const { privateKey } = deriveEvmAccount(mnemonicRef.current, index);
    return fn(privateKey);
  }, [touch]);

  // BTC counterpart: provide the BIP-84 private+public key bytes for the BTC
  // account transiently to a signer (e.g. the send path), WITHOUT storing them.
  // Same contract as withPrivateKey — used immediately, then dropped. Never log.
  const withBtcPrivateKey = useCallback((fn, networkKey = 'testnet') => {
    if (!mnemonicRef.current) throw new Error('Wallet is locked');
    touch();
    const { privateKey, publicKey, address } = deriveBtcAccount(mnemonicRef.current, { networkKey });
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

  const value = {
    isUnlocked,
    // DURESS / DECOY (S3): is the current session a decoy? Off by default.
    isDecoy,
    accounts,
    // Phase BTC: public BIP-84 account {address, path, networkKey} (testnet),
    // null while locked. deriveBtc() re-derives for a given network;
    // withBtcPrivateKey() hands the transient signing key to the send path.
    btcAccount,
    deriveBtc,
    withBtcPrivateKey,
    hasVault: keyStore.hasVault,
    // Duress / decoy controls (see wallet-core/duress.js). hasDuressPin() is the
    // raw store check; set/remove manage the decoy vault.
    hasDuressPin: hasDuressVault,
    setDuressPin,
    removeDuressPin,
    createWallet,
    importWallet,
    unlock,
    lock,
    deriveAccounts,
    withPrivateKey,
    clearVault: keyStore.clearVault,
    biometricPreview,
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
    </WalletCtx.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletCtx);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
