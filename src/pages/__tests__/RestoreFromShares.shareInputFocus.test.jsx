// RestoreFromShares — ONB-03: the "Or paste JSON" textarea must not lose
// focus or collapse after the first character. `ShareInput` used to be
// declared INSIDE the parent component, so every keystroke (each one calls
// setShareA/setShareB) redefined it with a new function identity — React
// unmounted and remounted the whole <ShareInput> subtree on every keystroke,
// discarding the uncontrolled <details open> state and DOM focus. Hoisted to
// module scope in this fix; this pins that typing several characters keeps
// focus, accumulates the full value, and the disclosure stays open.
//
// user-event's type() dispatches one keydown/input per character, which is
// what a real user (or a printed-backup transcription) does. A single
// fireEvent.change fill — the pattern RestoreFromShares.encrypted-share
// .test.jsx's pasteShares() helper deliberately uses for its own unrelated
// purpose — fires exactly one input event and would NOT have caught this
// remount-on-keystroke bug (the finding's own evidence: "a single
// programmatic paste/fill ... still lands correctly").

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({ restoreFromRecoveryBundles: vi.fn(), vaultExists: false }),
}));

import RestoreFromShares from '@/pages/RestoreFromShares';

afterEach(() => cleanup());

describe('RestoreFromShares — "Or paste JSON" textarea keeps focus while typing (ONB-03)', () => {
  it('stays open and accumulates every keystroke instead of collapsing after the first', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <RestoreFromShares />
      </MemoryRouter>,
    );

    // Expand Share 1's disclosure.
    await user.click(screen.getAllByText('Or paste JSON')[0]);

    const textarea = /** @type {HTMLTextAreaElement} */ (screen.getAllByPlaceholderText(/"shareIndex"/i)[0]);
    const details = /** @type {HTMLDetailsElement} */ (textarea.closest('details'));
    expect(details.open).toBe(true);

    await user.click(textarea);
    expect(document.activeElement).toBe(textarea);

    // Type multiple characters one at a time — this is the exact repro from
    // the finding ("Type a single character ... details panel immediately
    // collapses ... a second character is NOT received").
    // user-event's keyboard syntax treats "{"/"}" as special-key delimiters,
    // so this uses plain characters rather than escaping real bundle JSON.
    await user.type(textarea, 'abc123xyz');

    expect(textarea.value).toBe('abc123xyz');
    expect(document.activeElement).toBe(textarea);
    expect(details.open).toBe(true);
  });
});
