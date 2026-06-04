// src/lib/__tests__/navigation.test.js
import { describe, it, expect } from 'vitest';
import { navGroups, searchableRoutes } from '../navigation';

const allNavPaths = navGroups.flatMap((g) => g.items.map((i) => i.path));

describe('navigation respects the feature registry', () => {
  it('drops every cut path from the sidebar/More nav', () => {
    expect(allNavPaths).not.toContain('/leaderboard');
    expect(allNavPaths).not.toContain('/public-profiles');
    expect(allNavPaths).not.toContain('/shared-portfolio');
  });

  it('drops every cut path from search', () => {
    const searchPaths = searchableRoutes.map((r) => r.path);
    expect(searchPaths).not.toContain('/leaderboard');
    expect(searchPaths).not.toContain('/public-profiles');
    expect(searchPaths).not.toContain('/shared-portfolio');
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
