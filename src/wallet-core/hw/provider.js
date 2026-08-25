import { digitalShieldProvider } from './digitalShield.js';

const PROVIDERS = Object.freeze({
  [digitalShieldProvider.id]: digitalShieldProvider,
});

export function getHardwareSignerProvider(id) {
  const provider = PROVIDERS[id];
  if (!provider) throw new Error(`Unknown hardware signer provider: ${id}`);
  return provider;
}

export function listHardwareSignerProviders() {
  return Object.values(PROVIDERS);
}

