#!/usr/bin/env node
// scripts/check-cert-pin-manager-safety.mjs
//
// CI GUARD (P2-10, audit 2026-07-15): stop a future contributor (human or AI) from
// silently wiring the dormant CertPinManager.kt into MainActivity / an active OkHttp
// construction path WHILE its PINNED_HOSTS map still carries PLACEHOLDER_ SPKI pins.
//
// WHY: android/app/src/main/java/com/veyrnox/app/CertPinManager.kt ships a fully-
// implemented OkHttp CertificatePinner helper whose pins are labelled placeholders
// (see the class doc — the production leaf cert SHA-256 is not known until Play Console
// registration). The helper is deliberately NOT wired anywhere today: wiring it blind
// with placeholder pins would cause OkHttp to REFUSE every pinned host at connect time
// (placeholder never matches a real leaf) — an availability regression that would kill
// all RPC traffic on release builds.
//
// WHAT THIS CHECKS:
//   1. Read CertPinManager.kt. If it still contains "PLACEHOLDER_" tokens in its
//      PINNED_HOSTS map, the pins are inert.
//   2. Grep the Kotlin sources reachable from MainActivity (any .kt/.java file that
//      constructs OkHttpClient or references certificatePinner()) for a reference to
//      CertPinManager (import, buildPinnedClient call, etc.).
//   3. If (1) AND (2) — placeholder pins AND wiring — fail CI with a clear message.
//   4. If (1) only — placeholder pins, no wiring — PASS (documented dormant state).
//   5. If (2) only — real pins landed AND wiring landed — PASS (legitimate activation).
//
// PURE STATIC FILE-LEVEL GREP. No runtime. No egress. Same posture as
// scripts/check-log-redaction-patch.mjs.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CERT_PIN_MANAGER = 'android/app/src/main/java/com/veyrnox/app/CertPinManager.kt';
const NATIVE_ROOT = 'android/app/src/main/java/com/veyrnox/app';

// Grep markers.
const PLACEHOLDER_MARKER = 'PLACEHOLDER_';
// Any of these substrings inside a .kt/.java file suggests an active OkHttp
// construction path where CertPinManager could be wired.
const OKHTTP_MARKERS = ['OkHttpClient', 'certificatePinner('];
// Wiring evidence: any reference to CertPinManager from a non-self file.
const WIRING_MARKERS = ['CertPinManager.buildPinnedClient', 'CertPinManager.PINNED_HOSTS', 'import com.veyrnox.app.CertPinManager'];

function walkKotlinJava(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkKotlinJava(full));
    } else if (/\.(kt|java)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

if (!existsSync(CERT_PIN_MANAGER)) {
  // File was deleted — no dormancy risk to guard.
  console.log(`[check-cert-pin-manager-safety] ${CERT_PIN_MANAGER} absent — nothing to guard.`);
  process.exit(0);
}

const certPinManagerSrc = readFileSync(CERT_PIN_MANAGER, 'utf8');
const hasPlaceholders = certPinManagerSrc.includes(PLACEHOLDER_MARKER);

if (!hasPlaceholders) {
  // Real pins landed — activation is legitimate. This guard no longer applies.
  console.log('[check-cert-pin-manager-safety] CertPinManager.kt has NO PLACEHOLDER_ pins — real pins landed; wiring is safe.');
  process.exit(0);
}

// Placeholders still present. Look for wiring references from other files.
const files = walkKotlinJava(NATIVE_ROOT).filter((f) => !f.endsWith('CertPinManager.kt'));
const wiringHits = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const hasWiring = WIRING_MARKERS.some((m) => src.includes(m));
  const hasOkHttp = OKHTTP_MARKERS.some((m) => src.includes(m));
  if (hasWiring && hasOkHttp) {
    wiringHits.push(f);
  } else if (hasWiring) {
    // Any reference at all is suspect while pins are placeholders.
    wiringHits.push(f);
  }
}

if (wiringHits.length > 0) {
  console.error(
    '[check-cert-pin-manager-safety] FAILED — CertPinManager is being wired while its pins are still PLACEHOLDER_.\n' +
      '  → wiring reference(s) found in:\n' +
      wiringHits.map((f) => `      ${f}`).join('\n') + '\n' +
      '  → CertPinManager.kt still contains PLACEHOLDER_ SPKI pins in PINNED_HOSTS.\n' +
      '  → Wiring the helper now would cause OkHttp to REFUSE every pinned host at connect time\n' +
      '    (placeholder pins never match a real leaf) — availability regression on release builds.\n' +
      '  → Replace the PLACEHOLDER_ pins with real captured SPKI hashes FIRST, then wire.',
  );
  process.exit(1);
}

console.log('[check-cert-pin-manager-safety] CertPinManager.kt is DORMANT (placeholder pins, no wiring) — safe.');
