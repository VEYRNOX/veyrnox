// #2628 — the boot watchdog's HEALTH SIGNAL, not whether it can execute (#2595).
//
// The old signal was `root.firstChild`. Because main.jsx calls
// createRoot(...).render(...) as its LAST statement, that flag flips the instant
// the entry chunk finishes evaluating — so it reports healthy for any bundle
// that evaluated, whatever it went on to render, and it cannot report at all
// during a slow evaluation because setTimeout does not preempt synchronous work.
//
// The signal is now the static #boot-shell element that index.html paints before
// any script runs. React clears #root on its first commit, so the shell going
// away means real UI committed.
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
// hardcoded 10000 here would silently stop matching if the constant moved.
const DEADLINE_MS = Number(/var DEADLINE_MS = (\d+);/.exec(WATCHDOG)[1]);

function bootWithShell() {
  document.body.innerHTML =
    '<div id="root"><div id="boot-shell"><div>V</div></div></div>';
}

function runWatchdog() {
  // eslint-disable-next-line no-new-func
  new Function(WATCHDOG)();
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

  it('shows the fallback when the shell is never cleared (React never committed)', () => {
    bootWithShell();
    runWatchdog();

    vi.advanceTimersByTime(DEADLINE_MS - 1);
    expect(fallbackShown()).toBe(false);

    vi.advanceTimersByTime(DEADLINE_MS + 1000);
    expect(fallbackShown()).toBe(true);
    expect(document.getElementById('veyrnox-boot-reload')).not.toBeNull();
  });

  it('stays silent when the deadline passes while the main thread is blocked', () => {
    bootWithShell();
    runWatchdog();

    // The slow-boot case, and the reason this is not just advanceTimersByTime:
    // a long synchronous evaluation of the entry chunk holds the thread, so
    // wall-clock passes the deadline while the queued callback cannot run at
    // all. setSystemTime moves the clock WITHOUT running timers, which is the
    // only faithful model of that; advancing timers instead would fire the
    // check early and test a different sequence entirely.
    vi.setSystemTime(Date.now() + DEADLINE_MS + 5000);

    // React's first commit lands (react-dom sets containerInfo.textContent =
    // '', removing the shell) and only then does the thread free up and let
    // the backlog of timers run. The watchdog must read this as healthy even
    // though it is answering long after its own deadline.
    document.getElementById('root').textContent = '';
    vi.advanceTimersByTime(DEADLINE_MS + 10000);

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
    // The shell is the signal, so its absence from index.html breaks the check
    // above in production while every test here still passes on its own fixture.
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
