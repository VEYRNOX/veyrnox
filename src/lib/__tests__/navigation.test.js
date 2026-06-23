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

  it('includes live features added in this release (referrals now live)', () => {
    expect(allNavPaths).toContain('/referrals');
  });

  it('leaves live features untouched', () => {
    expect(allNavPaths).toContain('/send');
    expect(allNavPaths).toContain('/duress-pin');
  });

  it('includes Personal Backup in the Security group', () => {
    expect(allNavPaths).toContain('/cloud-backup');
    const entry = navGroups.flatMap((g) => g.items).find((i) => i.path === '/cloud-backup');
    expect(entry?.label).toBe('Personal Backup');
    const secGroup = navGroups.find((g) => g.items.some((i) => i.path === '/cloud-backup'));
    expect(secGroup?.label).toBe('Security');
  });

  it('includes the RASP Security tile in the nav (Security group)', () => {
    expect(allNavPaths).toContain('/rasp-security');
    const rasp = navGroups.flatMap((g) => g.items).find((i) => i.path === '/rasp-security');
    expect(rasp?.label).toBe('RASP Security');
  });

  it('drops no group entirely (no empty groups rendered)', () => {
    expect(navGroups.every((g) => g.items.length > 0)).toBe(true);
  });
});
