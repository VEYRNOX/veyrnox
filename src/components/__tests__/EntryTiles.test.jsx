// EntryTiles — Slice D1 of the entry-picker (plan
// docs/superpowers/plans/2026-08-10-entry-tiles-slice-d1.md).
//
// Pins the tile contract: three tiles (New / Have / Advanced), each firing a
// path string through `onSelect`. NO localStorage writes (I3 no residue). NO
// wallet-data reads — the component must be structurally free of
// useWallet/WalletProvider so it can render pre-vault.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import EntryTiles from '@/components/EntryTiles';

afterEach(() => cleanup());

describe('EntryTiles', () => {
  it('renders 4 tiles with distinct accessible names', () => {
    render(<EntryTiles onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /new wallet/i })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /have.*wallet|import|existing/i }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /file backup/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /recovery shares/i })).toBeTruthy();
  });

  it('each tile invokes onSelect with its path', () => {
    const onSelect = vi.fn();
    render(<EntryTiles onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /new wallet/i }));
    fireEvent.click(
      screen.getByRole('button', { name: /have.*wallet|import|existing/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: /file backup/i }));
    expect(onSelect).toHaveBeenNthCalledWith(1, 'new');
    expect(onSelect).toHaveBeenNthCalledWith(2, 'have');
    expect(onSelect).toHaveBeenNthCalledWith(3, 'advanced');
  });

  it('onSelect fires exactly once per click (no double-fire)', () => {
    const onSelect = vi.fn();
    render(<EntryTiles onSelect={onSelect} />);
    const newBtn = screen.getByRole('button', { name: /new wallet/i });
    fireEvent.click(newBtn);
    fireEvent.click(newBtn);
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenNthCalledWith(1, 'new');
    expect(onSelect).toHaveBeenNthCalledWith(2, 'new');
  });

  it('does not write to localStorage on any tile click (I3 no residue)', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    render(<EntryTiles onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /new wallet/i }));
    fireEvent.click(
      screen.getByRole('button', { name: /have.*wallet|import|existing/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: /file backup/i }));
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('imports no wallet-state hook or provider (structural I3 guarantee)', () => {
    // Structural check — cheaper and stricter than a mount-without-provider
    // probe: EntryTiles must not reach into WalletProvider at all. Any future
    // regression that adds `useWallet` here (e.g. to display an address on the
    // tile) breaks the "pre-vault, no wallet reads" contract in D1's plan.
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      resolve(here, '..', 'EntryTiles.jsx'),
      'utf8',
    );
    expect(source).not.toMatch(/useWallet\b/);
    expect(source).not.toMatch(/WalletProvider\b/);
    expect(source).not.toMatch(/WalletContext\b/); // reviewer P3: also catch a direct useContext(WalletContext) that skips the hook alias
  });
});
