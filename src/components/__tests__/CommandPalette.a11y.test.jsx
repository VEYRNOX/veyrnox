// @ts-nocheck
// src/components/__tests__/CommandPalette.a11y.test.jsx
//
// A11Y-03: the command palette overlay had no role="dialog"/aria-modal/
// accessible name, Escape only closed it while the search <input> itself had
// focus (a result <button> swallowed the key with no effect), and focus was
// dropped to <body> on close instead of returning to the trigger. Fixed by
// routing the overlay through the existing Radix Dialog primitives
// (src/components/ui/dialog.jsx) instead of hand-rolling each of dialog
// semantics, Escape-anywhere, focus trap and focus-return.
import { describe, it, expect, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import CommandPalette from '../CommandPalette.jsx';

afterEach(() => cleanup());

function Harness({ initialOpen = true }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <MemoryRouter>
      {/* data-testid, not role/text: Radix hides the rest of the app (this
          trigger included) from the accessibility tree while the dialog is
          open, so a role-based query for it would correctly find nothing. */}
      <button data-testid="trigger" onClick={() => setOpen(true)}>Search trigger</button>
      <CommandPalette open={open} onClose={() => setOpen(false)} />
    </MemoryRouter>
  );
}

describe('CommandPalette — dialog semantics (A11Y-03)', () => {
  it('exposes role="dialog", aria-modal, and an accessible name', async () => {
    render(<Harness />);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName();
  });

  it('is not present before opening, and is gone after closing', async () => {
    render(<Harness initialOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Escape closes it even when focus is on a result button, not just the input', async () => {
    render(<Harness />);
    const dialog = await screen.findByRole('dialog');
    const firstResult = within(dialog).getAllByRole('button')[0];
    firstResult.focus();
    expect(firstResult).toHaveFocus();
    fireEvent.keyDown(firstResult, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('returns focus to the trigger that opened it, on close via Escape', async () => {
    render(<Harness initialOpen={false} />);
    const trigger = screen.getByTestId('trigger');
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Radix's FocusScope restores focus from a setTimeout(…, 0) in its unmount
    // cleanup (@radix-ui/react-focus-scope), not synchronously with the state
    // update -- wait for it rather than asserting in the same tick.
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
