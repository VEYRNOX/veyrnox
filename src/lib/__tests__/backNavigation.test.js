import { beforeEach, describe, expect, it } from 'vitest';
import {
  getFallbackBackTarget,
  getStoredBackTarget,
  hasBrowserBackHistory,
  rememberCurrentRoute,
} from '../backNavigation';

describe('backNavigation', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(null, '');
  });

  it('tracks the previous in-app route for replace-style navigation', () => {
    rememberCurrentRoute({ pathname: '/' });
    rememberCurrentRoute({ pathname: '/settings' });
    expect(getStoredBackTarget({ pathname: '/settings', search: '', hash: '', state: null })).toBe('/');
  });

  it('prefers an explicit returnTo route over stored history', () => {
    rememberCurrentRoute({ pathname: '/' });
    rememberCurrentRoute({ pathname: '/send' });
    expect(
      getStoredBackTarget({
        pathname: '/verify',
        search: '',
        hash: '',
        state: { returnTo: '/send?asset=ETH' },
      }),
    ).toBe('/send?asset=ETH');
  });

  it('falls back to the parent route when there is no stored history', () => {
    expect(getFallbackBackTarget({ pathname: '/buy/in-progress', search: '', hash: '' })).toBe('/buy');
    expect(getFallbackBackTarget({ pathname: '/', search: '', hash: '' })).toBe(null);
  });

  it('uses the history idx when available to detect browser back support', () => {
    window.history.replaceState({ idx: 0 }, '');
    expect(hasBrowserBackHistory()).toBe(false);
    window.history.replaceState({ idx: 2 }, '');
    expect(hasBrowserBackHistory()).toBe(true);
  });
});
