// Pins for scripts/security-diff/classify.mjs — the changed-file classifier the
// daily security diff runs before its path index. Each case is a finding the
// path list MISSED on 2026-09-21, reduced to the changed lines that should have
// flagged it.
import { describe, it, expect } from 'vitest';
import { classifyFile, parsePatch, RULES } from '../../scripts/security-diff/classify.mjs';

const flagsOf = (path, added, removed = []) => classifyFile(path, { added, removed }).flags;

describe('security-diff classifier', () => {
  it('flags OS-scheduled state panic wipe cannot see (dormancy reminder)', () => {
    expect(flagsOf('src/lib/tracking-integration.jsx',
      ['    await LocalNotifications.schedule({'])).toContain('os-state');
  });

  it('flags a changed file whose diff only CALLS an existing sink (the real dormancy diff)', () => {
    // The 2026-09-21 regression: the added lines called scheduleReminders(), and
    // LocalNotifications lived in the unchanged helper. Changed lines alone miss it.
    const content = 'import { LocalNotifications } from "@capacitor/local-notifications";\n'
      + 'async function scheduleReminders() { await LocalNotifications.schedule({}); }';
    const r = classifyFile('src/lib/tracking-integration.jsx',
      { added: ['  await scheduleReminders(DORMANCY_REMINDER_IDS, [DORMANCY_DAYS * 24]);'], removed: [] },
      content);
    expect(r.flags).toContain('os-state (file)');
    expect(r.flags).not.toContain('os-state');
  });

  it('does not add a (file) flag for non-sink rules', () => {
    const r = classifyFile('src/x.jsx', { added: ['const y = 1;'], removed: [] },
      'if (isDeniabilityOrDemoActive()) return; requireTwoFactor(run);');
    expect(r.flags).toEqual([]);
  });

  it('flags a shared-store read on a page no path pattern names (NewsSentiment)', () => {
    expect(flagsOf('src/pages/NewsSentimentPage.jsx',
      ['  const { data } = useQuery({ queryFn: () => base44.entities.NewsSentiment.list() });']))
      .toContain('shared-store');
  });

  it('flags a security claim in paywall copy (WinPaywall)', () => {
    expect(flagsOf('src/components/WinPaywall.jsx',
      ["    body: 'so even a stolen device can’t reach your keys.',"])).toContain('security-claim');
  });

  it('flags a gate change and a tier check', () => {
    const f = flagsOf('src/pages/SecurityCenter.jsx',
      ['    requireTwoFactor(run, { title });', '  const { currentTier } = useTier();']);
    expect(f).toEqual(expect.arrayContaining(['gate', 'tier-gate']));
  });

  it('flags a weakened test: new skip marker and net lost assertions', () => {
    const r = classifyFile('src/lib/__tests__/x.test.js', {
      added: ["  it.skip('was a pin', () => {"],
      removed: ['    expect(a).toBe(1);', '    expect(b).toBe(2);'],
    });
    expect(r.flags).toContain('test-weakened');
    expect(r.notes.join(' ')).toMatch(/\+1 skip/);
    expect(r.notes.join(' ')).toMatch(/2 net assertion/);
  });

  it('leaves a pure styling change unflagged', () => {
    expect(flagsOf('src/pages/Dashboard.jsx',
      ['      <p className="text-xs text-muted-foreground">'],
      ['      <p className="text-xs text-muted-foreground">'])).toEqual([]);
  });

  it('parses a unified=0 patch into per-file changed lines, ignoring headers', () => {
    const files = parsePatch([
      'diff --git a/src/a.js b/src/a.js',
      '--- a/src/a.js',
      '+++ b/src/a.js',
      '@@ -1 +1 @@',
      '-old',
      '+fetch(url)',
      'diff --git a/src/b.js b/src/b.js',
      '+++ b/src/b.js',
      '+x',
    ].join('\n'));
    expect([...files.keys()]).toEqual(['src/a.js', 'src/b.js']);
    expect(files.get('src/a.js')).toEqual({ added: ['fetch(url)'], removed: ['old'] });
  });

  it('every rule has an id and a reason', () => {
    for (const r of RULES) {
      expect(r.id).toMatch(/^[a-z-]+$/);
      expect(r.why.length).toBeGreaterThan(10);
    }
  });
});
