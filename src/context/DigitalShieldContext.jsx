// @ts-nocheck
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const DigitalShieldContext = createContext(null);

export function DigitalShieldProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [lastImportedAt, setLastImportedAt] = useState(null);
  const providerPromiseRef = useRef(null);

  const loadProvider = useCallback(async () => {
    if (!providerPromiseRef.current) {
      providerPromiseRef.current = import('@/wallet-core/hw/provider.js').then(({ getHardwareSignerProvider }) => (
        getHardwareSignerProvider('digital-shield')
      ));
    }
    return providerPromiseRef.current;
  }, []);

  const importProfile = useCallback(async (input) => {
    const provider = await loadProvider();
    const parsed = provider.parseImport(input);
    setProfile(parsed);
    setLastImportedAt(Date.now());
    return parsed;
  }, [loadProvider]);

  const clearProfile = useCallback(() => {
    setProfile(null);
    setLastImportedAt(null);
  }, []);

  const value = useMemo(() => ({
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
