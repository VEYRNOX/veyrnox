// src/pages/__tests__/CustomDashboardWidgets.dnd-mount.test.jsx
//
// CustomDashboardWidgets is the ONLY consumer of @hello-pangea/dnd in the app,
// and until this file it had no unit test and no e2e coverage. That gap is why
// the 17 -> 18 major bump (PR #1363) merged on a green pipeline that had, in
// fact, never executed a single line of this page.
//
// What this pins is the mount contract between the page and the library — the
// thing a major React/dnd version bump actually breaks:
//   - DragDropContext + Droppable mount and expose the droppable id
//   - every widget renders a Draggable, in the declared order
//   - every Draggable's dragHandleProps are actually spread onto an element
//     (drop the spread and the page still renders, but nothing is draggable —
//     a silent failure no smoke test would catch)
//   - React logs no errors or warnings while doing it, which is how a React 19
//     incompatibility surfaces (ref-as-prop, removed findDOMNode, and friends)
//
// The `data-rfd-*` attributes are the library's own public DOM contract, set
// from the `provided.droppableProps` / `draggableProps` / `dragHandleProps`
// the page spreads. If a future major renames them this test fails loudly,
// which is the correct outcome: it means the integration changed.
//
// HONEST LIMIT (I4): this does NOT verify that dragging works. Committing a
// drag needs real layout and trusted input events; jsdom has neither, and a
// test that faked them would assert nothing. Drag behaviour remains manually
// verified only. This file is the regression net for "does it still mount",
// not a claim of full coverage.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import CustomDashboardWidgets from '../CustomDashboardWidgets';

// Mirrors DEFAULT_WIDGETS in the page, in declaration order.
const EXPECTED_WIDGET_IDS = [
  'portfolio_value',
  'asset_chart',
  'portfolio_chart',
  'transaction_list',
  'news_feed',
  'gas_tracker',
  'watchlist',
  'health_score',
  'quick_actions',
  'price_alerts',
];

const ids = (nodes) => Array.from(nodes).map((n) => n.getAttribute('data-rfd-draggable-id'));

describe('CustomDashboardWidgets — @hello-pangea/dnd mount contract', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('mounts the DragDropContext and its droppable', () => {
    const { container } = render(<CustomDashboardWidgets />);

    expect(screen.getByText('Dashboard Widgets')).toBeInTheDocument();
    expect(container.querySelector('[data-rfd-droppable-id="widgets"]')).toBeInTheDocument();
  });

  it('renders one Draggable per widget, in declared order', () => {
    const { container } = render(<CustomDashboardWidgets />);

    const draggables = container.querySelectorAll('[data-rfd-draggable-id]');
    expect(draggables).toHaveLength(EXPECTED_WIDGET_IDS.length);
    expect(ids(draggables)).toEqual(EXPECTED_WIDGET_IDS);
  });

  it('gives every Draggable a drag handle', () => {
    // The page spreads dragHandleProps onto the grip icon. Without this the
    // list still renders and looks correct, but is entirely undraggable.
    const { container } = render(<CustomDashboardWidgets />);

    const handles = container.querySelectorAll('[data-rfd-drag-handle-draggable-id]');
    expect(handles).toHaveLength(EXPECTED_WIDGET_IDS.length);
    expect(
      Array.from(handles).map((h) => h.getAttribute('data-rfd-drag-handle-draggable-id')),
    ).toEqual(EXPECTED_WIDGET_IDS);
  });

  it('honours a persisted widget order from localStorage', () => {
    // Reordering is what the drag ultimately persists, so the read-back path
    // is worth pinning even though the drag itself cannot be driven here.
    const reversed = [...EXPECTED_WIDGET_IDS].reverse();
    localStorage.setItem(
      'dashboard-widget-config',
      JSON.stringify(reversed.map((id) => ({ id, enabled: true }))),
    );

    const { container } = render(<CustomDashboardWidgets />);

    expect(ids(container.querySelectorAll('[data-rfd-draggable-id]'))).toEqual(reversed);
  });

  it('mounts without React errors or warnings', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<CustomDashboardWidgets />);

    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
