// Shared modal a11y hook: focus trap, Escape to close, focus restore on unmount.
// Used by hand-rolled overlay dialogs that keep their own DOM (CSS-module layouts
// where a full Radix Dialog refactor would be too invasive). Radix Dialog is
// still the preferred primitive for new modals.

import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// active: gate the trap when the modal is conditionally mounted.
// onEscape: invoked when Escape is pressed inside the modal.
export function useModalA11y({ active = true, onEscape } = {}) {
  const containerRef = useRef(null);
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;
    const previouslyFocused = document.activeElement;

    // Move focus into the modal (first focusable, else the container itself).
    const focusables = () =>
      Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
      );
    const first = focusables()[0];
    if (first) {
      first.focus();
    } else if (typeof container.focus === 'function') {
      container.setAttribute('tabindex', '-1');
      container.focus();
    }

    function handleKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onEscapeRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey) {
        if (activeEl === firstEl || !container.contains(activeEl)) {
          e.preventDefault();
          lastEl.focus();
        }
      } else if (activeEl === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    container.addEventListener('keydown', handleKey);
    return () => {
      container.removeEventListener('keydown', handleKey);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        try { previouslyFocused.focus(); } catch { /* ignore */ }
      }
    };
  }, [active]);

  return containerRef;
}
