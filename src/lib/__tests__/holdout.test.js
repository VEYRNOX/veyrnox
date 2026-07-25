// src/lib/__tests__/holdout.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { assignHoldout, isInHoldout, getHoldoutGroup } from '@/lib/holdout';

describe('holdout', () => {
  beforeEach(() => localStorage.clear());

  it('returns null before assignment', () => {
    expect(getHoldoutGroup()).toBe(null);
    expect(isInHoldout()).toBe(false);
  });

  it('assigns and persists', () => {
    assignHoldout();
    const group = getHoldoutGroup();
    expect(['control', 'treatment']).toContain(group);
  });

  it('does not reassign once set', () => {
    localStorage.setItem('veyrnox-holdout', 'control');
    assignHoldout();
    expect(getHoldoutGroup()).toBe('control');
  });

  it('isInHoldout returns true for control', () => {
    localStorage.setItem('veyrnox-holdout', 'control');
    expect(isInHoldout()).toBe(true);
  });

  it('isInHoldout returns false for treatment', () => {
    localStorage.setItem('veyrnox-holdout', 'treatment');
    expect(isInHoldout()).toBe(false);
  });
});
