// src/lib/advisorBridge.js
//
// Tiny browser event bridge between page-local security surfaces (like SendCrypto)
// and the global SecurityAdvisor drawer mounted in Layout. Pure client-side, no
// network, no persistence.

export const ADVISOR_CONTEXT_EVENT = 'veyrnox:advisor-context';
export const ADVISOR_OPEN_EVENT = 'veyrnox:advisor-open';

/**
 * Publish live non-secret context for the global Security Advisor.
 *
 * @param {Record<string, unknown>|null} detail
 */
export function publishAdvisorContext(detail) {
  if (typeof window === 'undefined' || typeof CustomEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(ADVISOR_CONTEXT_EVENT, { detail }));
}

/**
 * Ask the global Security Advisor to open, optionally with a preloaded question
 * and/or live non-secret context payload.
 *
 * @param {{ question?: string, autoSend?: boolean, context?: Record<string, unknown>|null }} [detail]
 */
export function openAdvisor(detail = {}) {
  if (typeof window === 'undefined' || typeof CustomEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(ADVISOR_OPEN_EVENT, { detail }));
}
