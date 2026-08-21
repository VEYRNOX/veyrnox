// @ts-nocheck
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { getHardwareSignerProvider } from '@/wallet-core/hw/provider.js';

const DigitalShieldContext = createContext(null);

const provider = getHardwareSignerProvider('digital-shield');

export function DigitalShieldProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [lastImportedAt, setLastImportedAt] = useState(null);

  const importProfile = useCallback((input) => {
    const parsed = provider.parseImport(input);
    setProfile(parsed);
    setLastImportedAt(Date.now());
    return parsed;
  }, []);

  const clearProfile = useCallback(() => {
    setProfile(null);
    setLastImportedAt(null);
  }, []);

  const value = useMemo(() => ({
    provider,
    profile,
    lastImportedAt,
    connected: !!profile,
    importProfile,
    clearProfile,
    evmAccount: profile?.accounts?.evm ?? null,
    btcAccount: profile?.accounts?.btc ?? null,
    solAccount: profile?.accounts?.solana ?? null,
  }), [profile, lastImportedAt, importProfile, clearProfile]);

  return (
    <DigitalShieldContext.Provider value={value}>
      {children}
    </DigitalShieldContext.Provider>
  );
}

export function useDigitalShield() {
  const ctx = useContext(DigitalShieldContext);
  if (!ctx) throw new Error('useDigitalShield must be used within DigitalShieldProvider');
  return ctx;
}
