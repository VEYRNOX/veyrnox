// lib/customTokenStore.js — primary-session custom-token display preferences.
// Stores public contract metadata only. Deniable sessions neither read nor write
// the shared list, because even token names would reveal real-session interests.

import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession.js';
import { validateStoredCustomToken } from '@/wallet-core/evm/customTokens.js';

export const CUSTOM_TOKEN_STORAGE_KEY = 'veyrnox-custom-tokens';
export const CUSTOM_TOKEN_LIMIT = 50;

function deniabilityActive() {
  try {
    return isDeniabilityOrDemoActive() !== false;
  } catch {
    return true;
  }
}

function assertWritableSession() {
  if (deniabilityActive()) {
    throw new Error('Custom tokens cannot be changed in a private session.');
  }
}

export function listCustomTokens() {
  // Gate BEFORE localStorage.getItem: a decoy must not even inspect whether a
  // primary token list exists.
  if (deniabilityActive()) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_TOKEN_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    const unique = new Map();
    for (const value of parsed.slice(0, CUSTOM_TOKEN_LIMIT)) {
      try {
        const token = validateStoredCustomToken(value);
        unique.set(token.id, token);
      } catch {
        // Corrupt/untrusted entries are dropped rather than reaching display/RPC.
      }
    }
    return [...unique.values()];
  } catch {
    return [];
  }
}

export function saveCustomToken(value) {
  assertWritableSession();
  const token = validateStoredCustomToken(value);
  const current = listCustomTokens();
  const existing = current.findIndex((item) => item.id === token.id);
  if (existing >= 0) current[existing] = token;
  else {
    if (current.length >= CUSTOM_TOKEN_LIMIT) {
      throw new Error(`You can save up to ${CUSTOM_TOKEN_LIMIT} custom tokens.`);
    }
    current.push(token);
  }
  try {
    localStorage.setItem(CUSTOM_TOKEN_STORAGE_KEY, JSON.stringify(current));
  } catch {
    throw new Error('The custom token could not be saved on this device.');
  }
  return token;
}

export function removeCustomToken(id) {
  assertWritableSession();
  if (typeof id !== 'string' || id.length > 100) return false;
  const current = listCustomTokens();
  const next = current.filter((token) => token.id !== id);
  if (next.length === current.length) return false;
  try {
    if (next.length === 0) localStorage.removeItem(CUSTOM_TOKEN_STORAGE_KEY);
    else localStorage.setItem(CUSTOM_TOKEN_STORAGE_KEY, JSON.stringify(next));
  } catch {
    throw new Error('The custom token could not be removed on this device.');
  }
  return true;
}
