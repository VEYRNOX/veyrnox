// #2628 — visible React output, rather than a mounted node, is the watchdog's
// health signal. The static boot shell prevents a white screen before scripts
// load, but cannot count as a healthy application paint.
//
// Each case below was mutation-checked: the fix was reverted in place and the
// case confirmed red, then restored. Note what that costs if skipped — a pin
// that stays green under its own mutation reads as coverage and is not, which
// is the exact shape of the FirstPaintNotBlankTests assertion that let #2595
// survive three weeks.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const WATCHDOG = fs.readFileSync(
  path.resolve(__dirname, '../../public/boot-watchdog.js'),
  'utf8',
);

// The deadline the file actually declares, read rather than duplicated — a
// hardcoded value here would silently stop matching if the constant moved.
const DEADLINE_MS = Number(/var DEADLINE_MS = (\d+);/.exec(WATCHDOG)[1]);
const POLL_MS = Number(/var POLL_MS = (\d+);/.exec(WATCHDOG)[1]);

function bootWithShell() {
  document.body.innerHTML =
    '<div id="root"><div id="boot-shell"><div>V</div></div></div>';
}

function runWatchdog() {
  // eslint-disable-next-line no-new-func
  new Function(WATCHDOG)();
}

function paint(element) {
  element.getBoundingClientRect = () => ({ width: 100, height: 100 });
}

const fallbackShown = () =>
  document.body.textContent.includes("couldn’t start");

describe('boot watchdog health signal (#2628)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('shows the fallback when only the static shell is visible', () => {
    bootWithShell();
    paint(document.getElementById('boot-shell'));
    paint(document.querySelector('#boot-shell div'));
    runWatchdog();

    vi.advanceTimersByTime(DEADLINE_MS - 1);
    expect(fallbackShown()).toBe(false);

    vi.advanceTimersByTime(DEADLINE_MS + 1000);
    expect(fallbackShown()).toBe(true);
    expect(document.getElementById('veyrnox-boot-reload')).not.toBeNull();
  });

  it('removes the fallback when visible React content paints after the deadline', () => {
    bootWithShell();
    runWatchdog();

    vi.advanceTimersByTime(DEADLINE_MS);
    expect(fallbackShown()).toBe(true);

    const app = document.createElement('main');
    paint(app);
    document.getElementById('root').appendChild(app);
    vi.advanceTimersByTime(POLL_MS);

    expect(fallbackShown()).toBe(false);
  });

  it('falls back to the mount check when no shell is present (fail-closed)', () => {
    // A stale OTA bundle or a regressed index.html has no #boot-shell. Treating
    // a missing marker as healthy would disable the watchdog silently, which is
    // what #2595 was. An empty #root must still produce the fallback.
    document.body.innerHTML = '<div id="root"></div>';
    runWatchdog();

    vi.advanceTimersByTime(DEADLINE_MS + 1000);
    expect(fallbackShown()).toBe(true);
  });

  it('index.html ships the shell inside #root, with no script dependency', () => {
    // The shell prevents the initial white screen, so its absence from index.html
    // breaks production behavior while every test here still passes on fixtures.
    const html = fs.readFileSync(
      path.resolve(__dirname, '../../index.html'),
      'utf8',
    );
    const root = /<div id="root">([\s\S]*?)<\/body>/.exec(html)[1];
    expect(root).toContain('id="boot-shell"');
    // style-src allows 'unsafe-inline'; script-src does not. The shell must
    // paint with no script of any kind, including an inline handler.
    expect(/<script/i.test(root.split('</div>')[0])).toBe(false);
  });
});
