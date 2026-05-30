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
//   - Nothing here is persisted except via vaultStore (ciphertext only).
//
// LIMITATION (document in threat model): JavaScript cannot guarantee secrets
// are unrecoverable from memory after clearing. This minimizes, not
// eliminates, the window. Device-keystore wrapping is the stronger control
// and is the recommended next step.

import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';
import { generateMnemonic, validateMnemonic } from '@/wallet-core/mnemonic';
import { encryptVault, decryptVault } from '@/wallet-core/vault';
import { deriveEvmAccount } from '@/wallet-core/derivation';
import { saveVault, loadVault, hasVault, clearVault } from '@/wallet-core/evm/vaultStore';

const WalletCtx = createContext(null);
const AUTO_LOCK_MS = 5 * 60 * 1000; // 5 minutes idle

export function WalletProvider({ children }) {
  const mnemonicRef = useRef(null);      // LIVE SECRET while unlocked
  const [isUnlocked, setUnlocked] = useState(false);
  const [accounts, setAccounts] = useState([]); // public only: {address, path, index}
  const lockTimer = useRef(null);

  const lock = useCallback(() => {
    if (mnemonicRef.current) {
      // best-effort overwrite before dropping the reference
      try { mnemonicRef.current = '\u0000'.repeat(mnemonicRef.current.length); } catch { /* noop */ }
    }
    mnemonicRef.current = null;
    setUnlocked(false);
    setAccounts([]);
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
    const blob = await encryptVault(mnemonic, password);
    await saveVault(blob);
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
    const blob = await encryptVault(mnemonic, password);
    await saveVault(blob);
    mnemonicRef.current = mnemonic;
    setUnlocked(true);
    touch();
    deriveAccounts(1);
  }, [deriveAccounts, touch]);

  // Unlock an existing vault with the password.
  const unlock = useCallback(async (password) => {
    const blob = await loadVault();
    if (!blob) throw new Error('No wallet found on this device');
    const mnemonic = await decryptVault(blob, password); // throws on wrong pw
    mnemonicRef.current = mnemonic;
    setUnlocked(true);
    touch();
    deriveAccounts(1);
  }, [deriveAccounts, touch]);

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
    hasVault,
    createWallet,
    importWallet,
    unlock,
    lock,
    deriveAccounts,
    withPrivateKey,
    clearVault,
  };

  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletCtx);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
