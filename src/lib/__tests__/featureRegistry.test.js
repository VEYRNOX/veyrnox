// src/lib/__tests__/featureRegistry.test.js
import { describe, it, expect } from 'vitest';
import {
  getFeatureStatus,
  isLive,
  isDisabled,
  isCut,
  cutPaths,
  disabledPaths,
  featureRouteOutcome,
  REASONS,
} from '../featureRegistry';

describe('getFeatureStatus', () => {
  it('defaults unknown paths to live', () => {
    expect(getFeatureStatus('/send').status).toBe('live');
    expect(isLive('/send')).toBe(true);
  });

  it('classifies the targeting-vector social pages as cut (spec §4)', () => {
    expect(getFeatureStatus('/leaderboard').status).toBe('cut');
    expect(getFeatureStatus('/public-profiles').status).toBe('cut');
    expect(getFeatureStatus('/shared-portfolio').status).toBe('cut');
    expect(isCut('/leaderboard')).toBe(true);
  });

  it('classifies referrals as cut for this release (spec §4)', () => {
    const entry = getFeatureStatus('/referrals');
    expect(entry.status).toBe('cut');
    expect(isCut('/referrals')).toBe(true);
  });

  it('every cut/disabled entry carries a user-facing note', () => {
    for (const path of [...cutPaths(), ...disabledPaths()]) {
      expect(typeof getFeatureStatus(path).note).toBe('string');
      expect(getFeatureStatus(path).note.length).toBeGreaterThan(0);
    }
  });

  it('returns a fresh copy so a caller cannot corrupt the registry', () => {
    const first = getFeatureStatus('/leaderboard'); // a listed (cut) path
    first.status = 'live';
    first.note = 'tampered';
    const second = getFeatureStatus('/leaderboard');
    expect(second.status).toBe('cut');
    expect(second.note).not.toBe('tampered');
  });

  it('normalises a trailing slash so it cannot bypass the gate', () => {
    expect(getFeatureStatus('/leaderboard/').status).toBe('cut');
    expect(getFeatureStatus('/referrals/').status).toBe('cut');
    expect(featureRouteOutcome('/leaderboard/')).toBe('notFound');
    expect(getFeatureStatus('/').status).toBe('live'); // root is untouched
  });
});

describe('cutPaths / disabledPaths', () => {
  it('includes the originally-locked decisions', () => {
    for (const p of ['/leaderboard', '/public-profiles', '/shared-portfolio']) {
      expect(cutPaths()).toContain(p);
    }
    expect(cutPaths()).toContain('/referrals');
  });
});

describe('featureRouteOutcome', () => {
  it('maps status to a render outcome', () => {
    expect(featureRouteOutcome('/send')).toBe('render');
    expect(featureRouteOutcome('/referrals')).toBe('notFound');
    expect(featureRouteOutcome('/leaderboard')).toBe('notFound');
  });
});
