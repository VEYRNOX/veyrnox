#!/usr/bin/env node
/**
 * Phase 2 Kickoff checklist — headless automation runner.
 *
 * Reads the checklist items in docs/PHASE-2-KICKOFF-PLAN.md, runs every item
 * that can be honestly verified with NO human interaction and NO physical
 * device, and writes docs/phase2-checklist-status.md.
 *
 * HONESTY CONTRACT (matches CLAUDE.md hard rules):
 *   - It NEVER marks a biometric / on-chain / auditor item PASS.
 *     Those are reported BLOCKED-HARDWARE / BLOCKED-ONCHAIN / BLOCKED-HUMAN
 *     with the reason, because faking them would be the forbidden "fake security".
 *   - An AUTOMATED-PASS means a real command exited 0. Items that stand in for a
 *     device behaviour (e.g. enrollment contract tests) carry an explicit
 *     "unit/contract coverage — NOT device-verified" note so the report can't be
 *     mistaken for real-device verification.
 *   - "Static tier": builds + vitest + static checks + typecheck + lint only.
 *     Device (WDIO/Appium) and on-chain tiers are intentionally out of scope.
 *
 * Usage:
 *   node scripts/phase2-checklist-runner.mjs [--no-tests] [--no-native]
 *                                            [--report <path>] [--json]
 */

import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { LEDGER, ONCHAIN_DOCUMENTED } from './phase2-evidence-ledger.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
const NO_TESTS = args.includes('--no-tests');
const NO_NATIVE = args.includes('--no-native');
const AS_JSON = args.includes('--json');
const VERIFY_ONCHAIN = args.includes('--verify-onchain');
const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';

// Synchronous on-chain receipt check (curl via execSync — keeps the runner sync).
// Returns { ok: true, block } on status=0x1, { ok: false, reason } otherwise.
function checkTxOnchain(txid) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txid] });
  try {
    const out = execSync(
      `curl -s --max-time 15 -X POST ${SEPOLIA_RPC} -H 'content-type: application/json' --data '${body}'`,
      { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', timeout: 20_000 },
    );
    const r = JSON.parse(out).result;
    if (!r) return { ok: false, reason: 'not found on-chain' };
    if (r.status !== '0x1') return { ok: false, reason: `status ${r.status}` };
    return { ok: true, block: parseInt(r.blockNumber, 16) };
  } catch (e) {
    return { ok: false, reason: `RPC error: ${String(e.message || e).slice(0, 60)}` };
  }
}
const reportIdx = args.indexOf('--report');
const REPORT_PATH = reportIdx !== -1 ? args[reportIdx + 1] : 'docs/phase2-checklist-status.md';

// ---------------------------------------------------------------------------
// Command runner with a per-command cache (each command runs at most once).
// ---------------------------------------------------------------------------
const cmdCache = new Map();

function tail(s, n = 12) {
  const lines = String(s || '').trimEnd().split('\n');
  return lines.slice(-n).join('\n');
}

function runCmd(cmd, { timeoutMs = 900_000 } = {}) {
  if (cmdCache.has(cmd)) return cmdCache.get(cmd);
  process.stderr.write(`  → ${cmd}\n`);
  const started = Date.now();
  let result;
  try {
    const out = execSync(cmd, {
      cwd: ROOT,
      stdio: 'pipe',
      timeout: timeoutMs,
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
      env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
    });
    result = { ok: true, code: 0, ms: Date.now() - started, tail: tail(out) };
  } catch (e) {
    const combined = `${e.stdout || ''}\n${e.stderr || ''}`.trim() || String(e.message || '');
    result = {
      ok: false,
      code: e.status ?? (e.signal ? `signal:${e.signal}` : 1),
      ms: Date.now() - started,
      tail: tail(combined),
    };
  }
  cmdCache.set(cmd, result);
  return result;
}

// ---------------------------------------------------------------------------
// Bespoke probes (no external command).
// ---------------------------------------------------------------------------
function probeNativeKekGate() {
  // The plan calls it HARDWARE_KEK_NATIVE_ENABLED; the real code gates on
  // M2C_HARDWARE_WRAP_ENABLED (native.js) + M2C_ENABLED (veyrnoxEnclave.js).
  const nativePath = resolve(ROOT, 'src/wallet-core/keystore/native.js');
  const enclavePath = resolve(ROOT, 'src/plugins/veyrnoxEnclave.js');
  const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
  const nat = read(nativePath);
  const enc = read(enclavePath);
  const wrap = /M2C_HARDWARE_WRAP_ENABLED\s*=\s*(true|false)/.exec(nat)?.[1];
  const enabled = /export const M2C_ENABLED\s*=\s*(true|false)/.exec(enc)?.[1];
  const bothOff = wrap === 'false' && enabled === 'false';
  return {
    status: bothOff ? 'BLOCKED-GATE' : (wrap === 'true' && enabled === 'true' ? 'AUTOMATED-PASS' : 'AUTOMATED-FAIL'),
    evidence: `M2C_HARDWARE_WRAP_ENABLED=${wrap ?? 'not-found'}, M2C_ENABLED=${enabled ?? 'not-found'}`,
    note: bothOff
      ? 'Correctly gated OFF pending audit sign-off. This is the audit gate itself, not a failure.'
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Command keys (evaluated lazily, shared across checklist items).
// ---------------------------------------------------------------------------
const COMMANDS = {
  rng: 'npm run check:rng',
  deniability: 'npm run check:deniability-strings',
  logRedaction: 'npm run check:log-redaction',
  findingIds: 'npm run check:finding-ids',
  releaseHygiene: 'npm run check:release-hygiene',
  typecheckCore: 'npm run typecheck:core',
  typecheck: 'npm run typecheck',
  lint: 'npm run lint',
  vitest: 'npm test',
  webBuild: 'npm run build:release',
  androidBuild: 'cd android && ./gradlew assembleDebug -q',
  iosCompile:
    'xcodebuild -workspace ios/App/App.xcworkspace -scheme App ' +
    '-configuration Debug -sdk iphonesimulator -destination "generic/platform=iOS Simulator" ' +
    'build CODE_SIGNING_ALLOWED=NO -quiet',
};

// Preconditions: a missing toolchain/project is BLOCKED-ENV, not a code failure.
function hasJava() {
  // NOTE: macOS ships a /usr/bin/java stub that EXISTS on PATH (so `command -v java`
  // and `which java` both succeed) but errors "Unable to locate a Java Runtime" when
  // actually invoked. So we must invoke the runtime, not just locate it.
  try {
    execSync('/usr/libexec/java_home', { stdio: 'pipe' }); // exit 0 ⇒ a real JDK is installed
    return true;
  } catch {
    /* fall through */
  }
  try {
    execSync('java -version', { stdio: 'pipe' }); // the stub exits non-zero here
    return true;
  } catch {
    return false;
  }
}
const PRECHECK = {
  iosWorkspace: () =>
    existsSync(resolve(ROOT, 'ios/App/App.xcworkspace'))
      ? null
      : 'iOS workspace not generated in this checkout — run `npx cap sync ios` (+ pod install) first.',
  javaRuntime: () =>
    hasJava() ? null : 'No JDK on PATH — Gradle needs a Java runtime (set JAVA_HOME).',
};

// A helper: resolve an item backed by a command into a status object.
function fromCmd(key, { note, envGated, precheck } = {}) {
  return () => {
    if (key === 'vitest' && NO_TESTS) {
      return { status: 'SKIPPED', evidence: '--no-tests supplied', note };
    }
    if (envGated && NO_NATIVE) {
      return { status: 'SKIPPED', evidence: '--no-native supplied', note };
    }
    if (precheck) {
      const reason = PRECHECK[precheck]();
      if (reason) return { status: 'BLOCKED-ENV', evidence: reason, note };
    }
    const r = runCmd(COMMANDS[key]);
    return {
      status: r.ok ? 'AUTOMATED-PASS' : 'AUTOMATED-FAIL',
      evidence: `\`${COMMANDS[key]}\` → exit ${r.code} (${(r.ms / 1000).toFixed(1)}s)`,
      note,
      log: r.ok ? undefined : r.tail,
    };
  };
}

function blocked(cat, reason) {
  return () => ({ status: `BLOCKED-${cat}`, evidence: reason });
}

const UNIT_NOTE = 'Unit/contract coverage only (vitest) — NOT device-verified.';

// ---------------------------------------------------------------------------
// The checklist. Line numbers reference docs/PHASE-2-KICKOFF-PLAN.md.
// ---------------------------------------------------------------------------
const SECTIONS = [
  {
    name: 'Pre-Kickoff — iPhone acquisition & pre-test',
    items: [
      ['52', 'Device boots and is factory-reset', blocked('HARDWARE', 'Physical iPhone required.')],
      ['53', 'Face ID enrolls and works', blocked('HARDWARE', 'Physical Face ID enrolment.')],
      ['54', 'iOS 17.2+ installed', blocked('HARDWARE', 'Physical device OS state.')],
      ['55', 'iCloud sign-in optional', blocked('HUMAN', 'Manual account decision.')],
      ['56', 'Stable WiFi access', blocked('HARDWARE', 'Physical network state.')],
    ],
  },
  {
    name: 'Pre-Kickoff — Android acquisition & pre-test',
    items: [
      ['83', 'Device boots and is factory-reset', blocked('HARDWARE', 'Physical Pixel required.')],
      ['84', 'Fingerprint enrolls and works', blocked('HARDWARE', 'Physical fingerprint enrolment.')],
      ['85', 'Android 9.0+ confirmed (adb getprop)', blocked('HARDWARE', 'Needs attached device (device tier).')],
      ['86', 'StrongBox present', blocked('HARDWARE', 'Needs attached device (device tier).')],
      ['87', 'Stable WiFi + USB-C for ADB', blocked('HARDWARE', 'Physical connectivity.')],
    ],
  },
  {
    name: 'Environment setup',
    items: [
      ['150', 'Open App.xcworkspace', blocked('HUMAN', 'One-time Xcode GUI.')],
      ['151', 'Select team/signing', blocked('HUMAN', 'One-time Xcode GUI signing.')],
      ['152', 'Auto-manage signing', blocked('HUMAN', 'One-time Xcode GUI signing.')],
      ['153', 'Provisioning profile auto-provisions', blocked('HUMAN', 'One-time Xcode GUI signing.')],
      ['188', 'Enable Developer Mode on device', blocked('HARDWARE', 'Physical device toggle.')],
      ['189', 'Enable USB Debugging', blocked('HARDWARE', 'Physical device toggle.')],
      ['190', 'Connect via USB-C, allow debugging', blocked('HARDWARE', 'Physical connection prompt.')],
      ['191', 'adb sees device', blocked('HARDWARE', 'Needs attached device (device tier).')],
    ],
  },
  {
    name: 'Team coordination',
    items: [
      ['217', 'Audit contact established', blocked('HUMAN', 'External coordination.')],
      ['218', 'Slack channel / thread created', blocked('HUMAN', 'External coordination.')],
      ['219', 'Daily standup scheduled', blocked('HUMAN', 'External coordination.')],
      ['220', 'GitHub project board created', blocked('HUMAN', 'External coordination.')],
      ['221', 'PRs/issues added to board', blocked('HUMAN', 'External coordination.')],
      ['222', 'Blockers list created', blocked('HUMAN', 'External coordination.')],
      ['223', 'Escalation path defined', blocked('HUMAN', 'External coordination.')],
    ],
  },
  {
    name: 'Phase 2a iOS — Week 1: Build & device setup',
    items: [
      ['288', 'Xcode build completes (no errors)', fromCmd('iosCompile', { envGated: true, precheck: 'iosWorkspace', note: 'Simulator compile only — proves Swift compiles; not a device run.' })],
      ['289', 'App launches on real iPhone', blocked('HARDWARE', 'Physical device launch.')],
      ['290', 'No Swift compilation errors', fromCmd('iosCompile', { envGated: true, precheck: 'iosWorkspace', note: 'Same compile invocation as 288.' })],
      ['291', 'Keychain accessible on device', blocked('HARDWARE', 'Device keychain state.')],
    ],
  },
  {
    name: 'Phase 2a iOS — Week 2: Enrollment & keychain',
    items: [
      ['396', 'enrollHardwareCredential() succeeds', fromCmd('vitest', { note: UNIT_NOTE })],
      ['397', 'isHardwareEnrolled() true after enroll', fromCmd('vitest', { note: UNIT_NOTE })],
      ['398', 'getHardwareFactor() returns base64 H', fromCmd('vitest', { note: UNIT_NOTE })],
      ['399', 'clearHardwareCredential() deletes items', fromCmd('vitest', { note: UNIT_NOTE })],
      ['400', 'Repeat enroll/clear 3x, no stale items', fromCmd('vitest', { note: UNIT_NOTE })],
      ['401', 'No Keychain sync to iCloud', blocked('HARDWARE', 'Real iCloud-sync behaviour is device-only.')],
    ],
  },
  {
    name: 'Phase 2a iOS — Week 3: Face ID & re-enroll',
    items: [
      ['455', 'Face ID prompt renders', blocked('HARDWARE', 'Biometric prompt — human + SE.')],
      ['456', 'Approve Face ID → H retrieved', blocked('HARDWARE', 'Biometric — human + SE.')],
      ['457', 'Deny Face ID → error, no H', blocked('HARDWARE', 'Biometric — human + SE.')],
      ['458', 'Re-enroll → old key invalidated', blocked('HARDWARE', 'Physical biometric re-enrolment.')],
      ['459', 'Error messages user-friendly', blocked('HARDWARE', 'On-device UX; partial string coverage in vitest.')],
      ['460', 'Latency median ≤ 2s', blocked('HARDWARE', 'Device measurement.')],
      ['461', '5-cycle test passes', blocked('HARDWARE', 'Device measurement.')],
    ],
  },
  {
    name: 'Phase 2a iOS — Week 4: Testnet & report',
    items: [
      ['472', 'Device funded 0.05 Sepolia ETH', blocked('ONCHAIN', 'Real funded device.')],
      ['473', 'App built + running on iPhone', blocked('HARDWARE', 'Physical device.')],
      ['474', 'Face ID enrolled + working', blocked('HARDWARE', 'Physical biometric.')],
      ['582', 'Testnet send succeeds (on-chain txid)', blocked('ONCHAIN', 'Requires real explorer-confirmed txid.')],
      ['583', 'Verification report complete + signed', blocked('HUMAN', 'Human sign-off.')],
      ['584', 'Invariants I1–I6 confirmed', fromCmd('vitest', { note: `${UNIT_NOTE} Invariant sign-off is human.` })],
      ['585', 'Latency baseline recorded', blocked('HARDWARE', 'Device measurement.')],
    ],
  },
  {
    name: 'Phase 2b Android — Week 2: Build & device setup',
    items: [
      ['629', 'gradlew assembleDebug succeeds', fromCmd('androidBuild', { envGated: true, precheck: 'javaRuntime', note: 'APK build only — not a device install.' })],
      ['630', 'APK installs to real Pixel', blocked('HARDWARE', 'Physical install.')],
      ['631', 'App launches without crash', blocked('HARDWARE', 'Physical launch.')],
      ['632', 'No fatal logcat errors', blocked('HARDWARE', 'Device logcat.')],
      ['633', 'HardwareKekPlugin.kt compiles', fromCmd('androidBuild', { envGated: true, precheck: 'javaRuntime', note: 'Covered by the assembleDebug compile.' })],
    ],
  },
  {
    name: 'Phase 2b Android — Week 3: Enrollment & keystore',
    items: [
      ['729', 'enrollHardwareCredential() succeeds', fromCmd('vitest', { note: UNIT_NOTE })],
      ['730', 'isHardwareEnrolled() true after enroll', fromCmd('vitest', { note: UNIT_NOTE })],
      ['731', 'getHardwareFactor() returns base64 H', fromCmd('vitest', { note: UNIT_NOTE })],
      ['732', 'clearHardwareCredential() deletes key', fromCmd('vitest', { note: UNIT_NOTE })],
      ['733', 'Repeat enroll/clear 3x, no stale keys', fromCmd('vitest', { note: UNIT_NOTE })],
      ['734', 'StrongBox availability detected', blocked('HARDWARE', 'Real StrongBox tier is device-only.')],
    ],
  },
  {
    name: 'Phase 2b Android — Week 4: Fingerprint & re-enroll',
    items: [
      ['803', 'BiometricPrompt renders on unlock', blocked('HARDWARE', 'Biometric — human + StrongBox.')],
      ['804', 'Approve fingerprint → H, vault unlocks', blocked('HARDWARE', 'Biometric — human + StrongBox.')],
      ['805', 'Deny fingerprint → error, no unlock', blocked('HARDWARE', 'Biometric — human + StrongBox.')],
      ['806', 'Re-enroll → KeyPermanentlyInvalidatedException', blocked('HARDWARE', 'Physical biometric re-enrolment.')],
      ['807', 'Auto-clear detected, JS notified', blocked('HARDWARE', 'Follows physical re-enrol.')],
      ['808', 'Error messages user-friendly', blocked('HARDWARE', 'On-device UX.')],
      ['809', 'Latency median ≤ 3s', blocked('HARDWARE', 'Device measurement.')],
      ['810', '5-cycle test passes', blocked('HARDWARE', 'Device measurement.')],
    ],
  },
  {
    name: 'Phase 2b Android — Week 5: Testnet & report',
    items: [
      ['924', 'Testnet send succeeds (on-chain txid)', blocked('ONCHAIN', 'Requires real explorer-confirmed txid.')],
      ['925', 'Verification report complete + signed', blocked('HUMAN', 'Human sign-off.')],
      ['926', 'Invariants I1–I6 confirmed', fromCmd('vitest', { note: `${UNIT_NOTE} Invariant sign-off is human.` })],
      ['927', 'Keystore tier documented', blocked('HUMAN', 'Doc of real device tier.')],
      ['928', 'Latency baseline recorded', blocked('HARDWARE', 'Device measurement.')],
    ],
  },
  {
    name: 'Phase 2c — Integration & cross-platform',
    items: [
      ['1008', 'Old vault still unlocks on mobile', fromCmd('vitest', { note: UNIT_NOTE })],
      ['1009', 'New vault unlocks correctly', fromCmd('vitest', { note: UNIT_NOTE })],
      ['1010', 'Feature flag toggles unlock path', fromCmd('vitest', { note: UNIT_NOTE })],
      ['1011', 'Graceful degradation → password path', fromCmd('vitest', { note: UNIT_NOTE })],
      ['1014', 'Feature flag gate working', fromCmd('vitest', { note: UNIT_NOTE })],
      ['1015', 'getHardwareCapabilities() correct', fromCmd('vitest', { note: UNIT_NOTE })],
      ['1016', 'Native plugin callable from JS', blocked('HARDWARE', 'Native bridge is device-only.')],
      ['1017', 'Old vaults decrypt without errors', fromCmd('vitest', { note: UNIT_NOTE })],
      ['1018', 'New vaults encrypt/decrypt via plugin', blocked('HARDWARE', 'Native plugin is device-only.')],
      ['1019', 'No regressions in non-KEK path', fromCmd('vitest', { note: UNIT_NOTE })],
    ],
  },
  {
    name: 'Phase 2c — Week 6: Audit prep',
    items: [
      ['1173', 'Audit materials compiled', blocked('HUMAN', 'Human packaging.')],
      ['1174', 'Device test suite runs w/o fatal errors', blocked('HARDWARE', 'WDIO suite needs a device (device tier).')],
      ['1175', 'Presentation deck ready', blocked('HUMAN', 'Human artefact.')],
      ['1176', 'Q&A topics prepared', blocked('HUMAN', 'Human artefact.')],
    ],
  },
  {
    name: 'Phase 2d — Week 7/8: Audit & mainnet gate',
    items: [
      ['1244', 'Audit package delivered', blocked('HUMAN', 'External auditor.')],
      ['1245', 'Kick-off meeting completed', blocked('HUMAN', 'External auditor.')],
      ['1246', 'Initial findings received', blocked('HUMAN', 'External auditor.')],
      ['1247', 'Response plan drafted', blocked('HUMAN', 'External auditor.')],
      ['1371', 'All CRITICAL findings resolved', blocked('HUMAN', 'Depends on audit output.')],
      ['1372', 'All HIGH findings resolved/deferred', blocked('HUMAN', 'Depends on audit output.')],
      ['1373', 'Mainnet sign-off signed by auditor', blocked('HUMAN', 'External auditor signature.')],
      ['1374', 'Feature flag true + merged to main', probeNativeKekGate],
      ['1375', 'Feature-Status.md updated', blocked('HUMAN', 'Human doc + verified status.')],
      ['1376', 'Release tagged + communicated', blocked('HUMAN', 'Release action.')],
    ],
  },
  {
    name: 'Success criteria (hard gates)',
    items: [
      ['1420', 'iOS Face ID → Sepolia send → txid', blocked('ONCHAIN', 'Real device + explorer txid.')],
      ['1421', 'Android fingerprint → Sepolia send → txid', blocked('ONCHAIN', 'Real device + explorer txid.')],
      ['1422', 'Biometric re-enroll confirmed both platforms', blocked('HARDWARE', 'Physical biometric.')],
      ['1423', 'All error paths tested', blocked('HARDWARE', 'Device error paths.')],
      ['1424', 'Latency baselines recorded', blocked('HARDWARE', 'Device measurement.')],
      ['1425', 'Security invariants I1–I6 validated', fromCmd('vitest', { note: `${UNIT_NOTE} Full validation is device + audit.` })],
      ['1426', 'Auditor sign-off obtained', blocked('HUMAN', 'External auditor.')],
      ['1427', 'Zero regressions, backward compat', fromCmd('vitest', { note: 'Full suite green = no unit regressions; device backward-compat still device-only.' })],
      ['1428', 'HARDWARE_KEK_NATIVE_ENABLED true on main', probeNativeKekGate],
      ['1429', 'Docs updated, reports signed', blocked('HUMAN', 'Human doc + sign-off.')],
    ],
  },
  {
    name: 'Repo-wide automated gates (not in plan, run for evidence)',
    items: [
      ['—', 'RNG usage check (crypto.getRandomValues only)', fromCmd('rng')],
      ['—', 'Deniability-string leak check', fromCmd('deniability')],
      ['—', 'LOG-1 log-redaction patch check', fromCmd('logRedaction')],
      ['—', 'Finding-ID consistency check', fromCmd('findingIds')],
      ['—', 'Release-hygiene check', fromCmd('releaseHygiene')],
      ['—', 'wallet-core typecheck', fromCmd('typecheckCore')],
      ['—', 'full typecheck (tsc checkJs)', fromCmd('typecheck')],
      ['—', 'eslint', fromCmd('lint')],
      ['—', 'web release build', fromCmd('webBuild', { envGated: true })],
    ],
  },
];

// ---------------------------------------------------------------------------
// Execute.
// ---------------------------------------------------------------------------
process.stderr.write('Phase 2 checklist runner — static tier (no device, no human)\n\n');

const results = [];
for (const section of SECTIONS) {
  for (const [line, text, fn] of section.items) {
    const r = fn();
    results.push({ section: section.name, line, text, ...r });
  }
}

// ---------------------------------------------------------------------------
// Apply the EVIDENCE LEDGER — override BLOCKED items that have real, cited
// merged-PR / on-chain evidence. On-chain items are gated on a LIVE re-check.
// AUTOMATED-PASS / AUTOMATED-FAIL are never overridden (a live command result
// outranks documented evidence).
// ---------------------------------------------------------------------------
for (const r of results) {
  const led = LEDGER[r.line];
  if (!led) continue;
  if (r.status === 'AUTOMATED-PASS' || r.status === 'AUTOMATED-FAIL') continue;

  const cite = [
    led.prs && led.prs.length ? `PR ${led.prs.map((p) => `#${p}`).join(', ')}` : null,
    led.device ? `device: ${led.device}` : null,
    led.docRef ? `ref: ${led.docRef}` : null,
  ].filter(Boolean).join(' · ');

  if (led.status === 'ONCHAIN-VERIFIED') {
    if (VERIFY_ONCHAIN) {
      const chk = checkTxOnchain(led.txid);
      if (chk.ok) {
        r.status = 'ONCHAIN-VERIFIED';
        r.evidence = `txid \`${led.txid.slice(0, 12)}…\` LIVE-confirmed SUCCESS, block ${chk.block} · ${cite}`;
      } else {
        r.status = ONCHAIN_DOCUMENTED;
        r.evidence = `txid \`${led.txid.slice(0, 12)}…\` documented (block ${led.block}) but live re-check: ${chk.reason} · ${cite}`;
      }
    } else {
      r.status = ONCHAIN_DOCUMENTED;
      r.evidence = `txid \`${led.txid.slice(0, 12)}…\` documented SUCCESS, block ${led.block} (not re-checked this run — pass --verify-onchain) · ${cite}`;
    }
  } else {
    // DEVICE-VERIFIED / CI-VERIFIED
    r.status = led.status;
    r.evidence = cite;
  }
  r.note = [led.note, led.scope].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Tally + report.
// ---------------------------------------------------------------------------
const tally = {};
for (const r of results) tally[r.status] = (tally[r.status] || 0) + 1;

const ICON = {
  'AUTOMATED-PASS': '✅',
  'ONCHAIN-VERIFIED': '⛓️✅',
  'ONCHAIN-DOCUMENTED': '⛓️📄',
  'DEVICE-VERIFIED': '🟢',
  'CI-VERIFIED': '🧪',
  'AUTOMATED-FAIL': '❌',
  'BLOCKED-ENV': '🧰',
  'BLOCKED-HARDWARE': '🔒',
  'BLOCKED-ONCHAIN': '⛓️',
  'BLOCKED-HUMAN': '🧑',
  'BLOCKED-GATE': '⏳',
  SKIPPED: '⏭️',
};

const nowIso = new Date().toISOString();
const total = results.length;
const passed = tally['AUTOMATED-PASS'] || 0;
const failed = tally['AUTOMATED-FAIL'] || 0;
const GREEN = ['AUTOMATED-PASS', 'ONCHAIN-VERIFIED', 'DEVICE-VERIFIED', 'CI-VERIFIED', 'ONCHAIN-DOCUMENTED'];
const satisfied = GREEN.reduce((n, s) => n + (tally[s] || 0), 0);
const automatable =
  passed + failed + (tally['BLOCKED-GATE'] || 0) + (tally['SKIPPED'] || 0) + (tally['BLOCKED-ENV'] || 0);

let md = '';
md += '# Phase 2 Checklist — Automated Status Report\n\n';
md += `_Generated ${nowIso} by \`scripts/phase2-checklist-runner.mjs\` (static tier)._\n\n`;
md += '> **Honesty contract.** An item is ticked from one of two sources, never fabricated:\n';
md += '> (1) **automation** — `AUTOMATED-PASS`/`FAIL`/`CI-VERIFIED` mean a real command exited 0/non-0\n';
md += '> here or in CI; an `AUTOMATED-PASS` standing in for a device behaviour is unit/contract\n';
md += '> coverage only, NOT device verification (see the note). (2) **evidence ledger**\n';
md += '> (`scripts/phase2-evidence-ledger.mjs`) — `DEVICE-VERIFIED` cites a merged PR + real-device\n';
md += '> session; `ONCHAIN-VERIFIED` re-queries the chain live (`--verify-onchain`) and downgrades to\n';
md += '> `ONCHAIN-DOCUMENTED` if it does not confirm SUCCESS. All ledger evidence is **INTERNAL** —\n';
md += '> real hardware/CI, NOT independently audited. Biometric/auditor items with no evidence on\n';
md += '> file stay `BLOCKED`. Nothing here satisfies the plan\'s independent-audit gate (1426) or\n';
md += '> flips the mainnet flag (1374/1428) — those remain `BLOCKED` by design.\n\n';

const stillBlocked = ['BLOCKED-HARDWARE', 'BLOCKED-ONCHAIN', 'BLOCKED-HUMAN', 'BLOCKED-GATE'].reduce(
  (n, s) => n + (tally[s] || 0),
  0,
);
md += '## Summary\n\n';
md += `- **${satisfied} / ${total}** items satisfied: ${passed} automated-pass · ${tally['ONCHAIN-VERIFIED'] || 0} on-chain-verified · ${tally['ONCHAIN-DOCUMENTED'] || 0} on-chain-documented · ${tally['DEVICE-VERIFIED'] || 0} device-verified · ${tally['CI-VERIFIED'] || 0} CI-verified.\n`;
md += `- **${failed}** automated-fail · **${stillBlocked}** still blocked · **${tally['BLOCKED-ENV'] || 0}** env-blocked here · **${tally['SKIPPED'] || 0}** skipped.\n`;
md += '- Green statuses other than `AUTOMATED-PASS` are **INTERNAL** evidence (real hardware / real CI / live txid) — they do **NOT** satisfy the plan\'s independent-audit gate (line 1426) or flip the mainnet flag (1374/1428), which remain `BLOCKED`.\n\n';
md += '| Status | Count | Meaning |\n|---|---|---|\n';
const order = [
  'AUTOMATED-PASS', 'ONCHAIN-VERIFIED', 'DEVICE-VERIFIED', 'CI-VERIFIED', 'ONCHAIN-DOCUMENTED',
  'AUTOMATED-FAIL', 'BLOCKED-GATE', 'BLOCKED-ENV', 'SKIPPED',
  'BLOCKED-HARDWARE', 'BLOCKED-ONCHAIN', 'BLOCKED-HUMAN',
];
const MEAN = {
  'AUTOMATED-PASS': 'Real command exited 0',
  'ONCHAIN-VERIFIED': 'Real send, txid LIVE-re-confirmed SUCCESS on-chain (INTERNAL)',
  'ONCHAIN-DOCUMENTED': 'Real send, txid documented SUCCESS (not re-checked this run)',
  'DEVICE-VERIFIED': 'Confirmed on real hardware per merged PR (INTERNAL, not audited)',
  'CI-VERIFIED': 'Build/compile proven by a CI workflow',
  'AUTOMATED-FAIL': 'Real command failed — see log',
  'BLOCKED-GATE': 'Audit gate flag, correctly OFF until sign-off',
  'BLOCKED-ENV': 'Toolchain/project not provisioned here (would run given JDK / cap sync)',
  SKIPPED: 'Skipped by flag',
  'BLOCKED-HARDWARE': 'Needs physical device / biometric (no evidence on file yet)',
  'BLOCKED-ONCHAIN': 'Needs real explorer-confirmed txid',
  'BLOCKED-HUMAN': 'Needs a human / external party',
};
for (const s of order) {
  if (tally[s]) md += `| ${ICON[s]} ${s} | ${tally[s]} | ${MEAN[s]} |\n`;
}
md += '\n';

let curSection = null;
for (const r of results) {
  if (r.section !== curSection) {
    if (curSection !== null) md += '\n';
    curSection = r.section;
    md += `## ${curSection}\n\n`;
    md += '| | Line | Item | Status | Evidence |\n|---|---|---|---|---|\n';
  }
  const ev = [r.evidence, r.note ? `_${r.note}_` : null].filter(Boolean).join('<br>');
  md += `| ${ICON[r.status] || '•'} | ${r.line} | ${r.text} | \`${r.status}\` | ${ev} |\n`;
  // section boundary look-ahead handled by next iteration's header
}
md += '\n';

// Append failure logs so a failing automated gate is actionable.
const fails = results.filter((r) => r.status === 'AUTOMATED-FAIL' && r.log);
if (fails.length) {
  md += '## Failure logs\n\n';
  for (const f of fails) {
    md += `### ${f.text} (line ${f.line})\n\n\`\`\`\n${f.log}\n\`\`\`\n\n`;
  }
}

// ---------------------------------------------------------------------------
// Cross-session corroboration (manual pass over all local sessions, 2026-07-15).
// Static appendix — documents what the session sweep found so the reconciliation
// is auditable. Sessions are INTERNAL self-reports (same tier as CLAUDE.md), not
// new evidence: they CORROBORATE the device ticks; they cannot promote status.
// ---------------------------------------------------------------------------
md += '## Cross-session corroboration (all local sessions reviewed 2026-07-15)\n\n';
md += 'A pass over every local Veyrnox session checked (a) whether any `BLOCKED` item could be\n';
md += 'honestly ticked from session history, and (b) whether the ledger ticks are corroborated.\n';
md += 'Sessions are INTERNAL self-reports — they corroborate, they do not promote status.\n\n';
md += '**Corroborated (already ticked):**\n';
md += '- Face ID prompts on every unlock / `reuseDuration=0` (line 455) — session *"iOS KEK device session"* (2026-07-07): "Face ID prompts on EVERY unlock (no grace-period reuse from `reuseDuration=0`)".\n';
md += '- StrongBox tier detected (line 734) — same session: "tier=STRONGBOX (securityLevel=2)".\n';
md += '- Biometric re-enroll invalidation (458 / 1422) — sessions *"H-2 Biometric invalidation"* (2026-07-02) and *"iPhone 8 jailbreak"* (iPhone 8 Plus used for H-2/iOS-F11); later sessions recap "both platforms closed".\n\n';
md += '**No session evidence found → correctly still `BLOCKED` (not an oversight):**\n';
md += '- 5-cycle soak test (461 / 810), device-test-suite run (1174), iOS unlock-latency baseline (460 / 585 / 1424). Searches returned no matching sessions.\n\n';
md += '**Caution recorded:** PR #918 (session *"Hardware Protection biometric login issue"*) is\n';
md += '`fix(panic-wipe): …residue gaps` — NOT the biometric re-enroll fix. It must not be cited as\n';
md += 'evidence for 458/1422. The iOS re-enroll half rests on the CLAUDE.md 2026-07-08 device\n';
md += 'session (no PR artifact for the iOS half) — the thinnest link in the "both platforms" gate.\n\n';

const outPath = resolve(ROOT, REPORT_PATH);
writeFileSync(outPath, md, 'utf8');

// ---------------------------------------------------------------------------
// Console summary.
// ---------------------------------------------------------------------------
process.stderr.write('\n');
for (const s of order) if (tally[s]) process.stderr.write(`${ICON[s]} ${s}: ${tally[s]}\n`);
process.stderr.write(`\nReport written to ${REPORT_PATH}\n`);

if (AS_JSON) {
  process.stdout.write(JSON.stringify({ generated: nowIso, tally, results }, null, 2) + '\n');
}

// Exit non-zero only if a genuinely automatable check FAILED (blocked items are not failures).
process.exit(failed > 0 ? 1 : 0);
