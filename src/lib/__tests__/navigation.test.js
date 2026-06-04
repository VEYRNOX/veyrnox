// src/lib/__tests__/navigation.test.js
import { describe, it, expect } from 'vitest';
import { navGroups, searchableRoutes } from '../navigation';
import { cutPaths } from '../featureRegistry';

const allNavPaths = navGroups.flatMap((g) => g.items.map((i) => i.path));

describe('navigation respects the feature registry', () => {
  it('drops every cut path from the sidebar/More nav', () => {
    cutPaths().forEach((p) => expect(allNavPaths).not.toContain(p));
  });

  it('drops every cut path from search', () => {
    const searchPaths = searchableRoutes.map((r) => r.path);
    cutPaths().forEach((p) => expect(searchPaths).not.toContain(p));
  });

  it('keeps disabled features visible (referrals still in nav)', () => {
    expect(allNavPaths).toContain('/referrals');
  });

  it('leaves live features untouched', () => {
    expect(allNavPaths).toContain('/send');
    expect(allNavPaths).toContain('/duress-pin');
  });

  it('drops no group entirely (no empty groups rendered)', () => {
    expect(navGroups.every((g) => g.items.length > 0)).toBe(true);
  });
});
