#!/usr/bin/env node
// scripts/capture-spki.mjs — capture SubjectPublicKeyInfo SHA-256 (base64) for
// live TLS certificates, in the shapes Android's <pin-set> and iOS
// NSPinnedDomains want. Feed the output into:
//   android/app/src/main/res/xml/network_security_config.xml
//   ios/App/App/Info.plist
// Both files currently ship the pinning structure HONEST-DISABLED (commented
// out) with REPLACE_WITH_LEAF_SPKI_SHA256_BASE64= markers — replace those.
//
// Usage:
//   node scripts/capture-spki.mjs <host>[:port]
//   node scripts/capture-spki.mjs supabase.co veyrnox.com publicnode.com
//
// Requires `openssl` on PATH. Emits one block per host to stdout.
//
// HONEST LIMITATION. This captures the certs live at the moment you run it.
// If the leaf rotates after you ship, users are stuck with the wrong pin
// until the next app update. The two-pin rule (leaf + issuer) buys you one
// rotation as long as the CA stays the same; publish an updated build BEFORE
// the earliest expiry date printed below.

import { execFileSync } from 'node:child_process';

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('usage: node scripts/capture-spki.mjs <host>[:port] [<host>...]');
  process.exit(2);
}

function run(cmd, args, input) {
  return execFileSync(cmd, args, {
    input,
    stdio: ['pipe', 'pipe', 'inherit'],
    maxBuffer: 4 * 1024 * 1024,
  });
}

function fetchChain(hostPort) {
  const [host, port = '443'] = hostPort.split(':');
  const pem = run(
    'openssl',
    ['s_client', '-servername', host, '-connect', `${host}:${port}`, '-showcerts'],
    '\n',
  ).toString('utf8');
  const chain = [];
  let cur = null;
  for (const line of pem.split('\n')) {
    if (line.includes('-----BEGIN CERTIFICATE-----')) cur = [line];
    else if (cur) {
      cur.push(line);
      if (line.includes('-----END CERTIFICATE-----')) { chain.push(cur.join('\n')); cur = null; }
    }
  }
  if (chain.length === 0) throw new Error(`no certificates returned for ${host}`);
  return { host, port, chain };
}

function spkiSha256Base64(certPem) {
  const spkiDer = run('openssl', ['x509', '-pubkey', '-noout'], certPem);
  const pkPem = spkiDer.toString('utf8');
  const der = run('openssl', ['pkey', '-pubin', '-outform', 'DER'], pkPem);
  const hash = run('openssl', ['dgst', '-sha256', '-binary'], der);
  return Buffer.from(hash).toString('base64');
}

function notAfter(certPem) {
  const out = run('openssl', ['x509', '-noout', '-enddate'], certPem).toString('utf8');
  return out.replace(/^notAfter=/, '').trim();
}

for (const t of targets) {
  const { host, chain } = fetchChain(t);
  const leaf = chain[0];
  const issuer = chain[1] || chain[0]; // fall back to self if chain length 1
  const leafPin = spkiSha256Base64(leaf);
  const issuerPin = spkiSha256Base64(issuer);
  const leafExpiry = notAfter(leaf);
  const issuerExpiry = notAfter(issuer);
  process.stdout.write(
    `# ${host}\n` +
    `# leaf   expiry: ${leafExpiry}\n` +
    `# issuer expiry: ${issuerExpiry}\n` +
    `LEAF_PIN=${leafPin}\n` +
    `ISSUER_PIN=${issuerPin}\n\n`,
  );
}
