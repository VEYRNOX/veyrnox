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

  it('classifies referrals as disabled pending a serverless build (spec §4)', () => {
    const entry = getFeatureStatus('/referrals');
    expect(entry.status).toBe('disabled');
    expect(entry.reason).toBe(REASONS.SERVER);
    expect(isDisabled('/referrals')).toBe(true);
  });

  it('every cut/disabled entry carries a user-facing note', () => {
    for (const path of [...cutPaths(), ...disabledPaths()]) {
      expect(typeof getFeatureStatus(path).note).toBe('string');
      expect(getFeatureStatus(path).note.length).toBeGreaterThan(0);
    }
  });
});

describe('cutPaths / disabledPaths', () => {
  it('returns the expected sets', () => {
    expect(cutPaths().sort()).toEqual(
      ['/leaderboard', '/public-profiles', '/shared-portfolio'].sort(),
    );
    expect(disabledPaths().sort()).toEqual(['/referrals'].sort());
  });
});

describe('featureRouteOutcome', () => {
  it('maps status to a render outcome', () => {
    expect(featureRouteOutcome('/send')).toBe('render');
    expect(featureRouteOutcome('/referrals')).toBe('disabled');
    expect(featureRouteOutcome('/leaderboard')).toBe('notFound');
  });
});
