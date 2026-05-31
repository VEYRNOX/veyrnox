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
// AES-GCM IndexedDB vault; native (M2b, Design B) swaps in a hardware-wrapped
// implementation behind the SAME interface without touching this component.
//
// LIMITATION (document in threat model): JavaScript cannot guarantee secrets
// are unrecoverable from memory after clearing. This minimizes, not
// eliminates, the window. Device-keystore wrapping is the stronger control
// and is the recommended next step.

import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';
import { generateMnemonic, validateMnemonic } from '@/wallet-core/mnemonic';
import { deriveEvmAccount } from '@/wallet-core/derivation';
import { getKeyStore } from '@/wallet-core/keystore';
import { isBiometricUnlockEnabled, getBiometricStatus } from '@/lib/biometric';
import BiometricPrompt from '@/components/security/BiometricPrompt';

const WalletCtx = createContext(null);
const AUTO_LOCK_MS = 5 * 60 * 1000; // 5 minutes idle

// Platform-resolved storage seam. Web today; native (M2b) swaps in behind the
// same interface. Stable singleton, so it lives at module scope.
const keyStore = getKeyStore();

export function WalletProvider({ children }) {
  const mnemonicRef = useRef(null);      // LIVE SECRET while unlocked
  const [isUnlocked, setUnlocked] = useState(false);
  const [accounts, setAccounts] = useState([]); // public only: {address, path, index}
  const lockTimer = useRef(null);

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
    setAccounts([]);
    keyStore.lock(); // no-op on web; drops the hardware grant on native (M2b)
  }, []);

  const touch = useCallback(() => {
    if (lockTimer.current) clearTimeout(lockTimer.current);
    lockTimer.current = setTimeout(lock, AUTO_LOCK_MS);
  }, [lock]);

  // Auto-lock when tab is hidden or on idle timeout.
  useEffect(() => {
    const onHide = () => { if (document.hidden) lock(); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [lock]);

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

  // Create a brand-new wallet: generate -> encrypt -> persist ciphertext -> unlock.
  const createWallet = useCallback(async (password, strength = 128) => {
    const mnemonic = generateMnemonic(strength);
    await keyStore.createVault(mnemonic, password);
    mnemonicRef.current = mnemonic;
    setUnlocked(true);
    touch();
    deriveAccounts(1);
    // Return mnemonic ONCE for the user to back up; caller must not persist it.
    return mnemonic;
  }, [deriveAccounts, touch]);

  // Import an existing mnemonic.
  const importWallet = useCallback(async (mnemonic, password) => {
    if (!validateMnemonic(mnemonic)) throw new Error('Invalid recovery phrase');
    await keyStore.createVault(mnemonic, password);
    mnemonicRef.current = mnemonic;
    setUnlocked(true);
    touch();
    deriveAccounts(1);
  }, [deriveAccounts, touch]);

  // Unlock an existing vault with the password.
  const unlock = useCallback(async (password) => {
    // PROVISIONAL app-layer biometric gate. In demo this shows the simulated
    // prompt; on native the real OS prompt fires inside keyStore.unlock(). A
    // cancel here throws and aborts the unlock before any vault read.
    await runBiometricGate();
    // keyStore.unlock throws "No wallet found on this device" when absent and
    // rethrows decryptVault's wrong-password/tamper error — same as before.
    const mnemonic = await keyStore.unlock(password);
    mnemonicRef.current = mnemonic;
    setUnlocked(true);
    touch();
    deriveAccounts(1);
  }, [deriveAccounts, touch, runBiometricGate]);

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

  const value = {
    isUnlocked,
    accounts,
    hasVault: keyStore.hasVault,
    createWallet,
    importWallet,
    unlock,
    lock,
    deriveAccounts,
    withPrivateKey,
    clearVault: keyStore.clearVault,
    biometricPreview,
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
