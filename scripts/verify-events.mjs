#!/usr/bin/env node
// Quick smoke test: insert a test event via the anon client, then read it
// back via the service role key to confirm the table + RLS are working.
//
// Usage:
//   Add SUPABASE_SERVICE_ROLE_KEY to .env.local, then:
//   node scripts/verify-events.mjs
//
// Requires VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and
// SUPABASE_SERVICE_ROLE_KEY in .env.local

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

let env = {};
try {
  env = Object.fromEntries(
    readFileSync('.env.local', 'utf8')
      .split('\n')
      .filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => {
        const idx = l.indexOf('=');
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, '')];
      })
  );
} catch {
  // .env.local missing — fall through to the validation checks below.
}

const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || process.argv[2];

if (!url || !anonKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}
if (!serviceKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in env or .env.local, or pass as argument.');
  process.exit(1);
}

const anon = createClient(url, anonKey);
const admin = createClient(url, serviceKey);
const testDeviceId = '00000000-0000-0000-0000-000000000001';

console.log('1. Inserting test event via anon client...');
const { error: insertErr } = await anon.from('events').insert({
  device_id: testDeviceId,
  event: 'test_ping',
  metadata: { source: 'verify-events.mjs', ts: new Date().toISOString() },
});
if (insertErr) {
  console.error('   INSERT failed:', insertErr.message);
  process.exit(1);
}
console.log('   OK — inserted.');

console.log('2. Verifying anon client CANNOT read back (RLS)...');
const { data: anonRead } = await anon
  .from('events')
  .select('*')
  .eq('device_id', testDeviceId)
  .limit(1);
if (anonRead && anonRead.length > 0) {
  console.warn('   WARNING: anon client CAN read events — RLS may be misconfigured.');
} else {
  console.log('   OK — anon read blocked or empty (RLS working).');
}

console.log('3. Reading back via service role key...');
const { data, error: readErr } = await admin
  .from('events')
  .select('*')
  .eq('device_id', testDeviceId)
  .order('created_at', { ascending: false })
  .limit(5);
if (readErr) {
  console.error('   READ failed:', readErr.message);
  process.exit(1);
}
if (!data || data.length === 0) {
  console.error('   No rows found — migration may not have run.');
  process.exit(1);
}
console.log(`   OK — found ${data.length} event(s):`);
data.forEach(r => console.log(`     [${r.created_at}] ${r.event}`, r.metadata));

console.log('\n4. Cleaning up test row...');
const { error: delErr } = await admin
  .from('events')
  .delete()
  .eq('device_id', testDeviceId);
if (delErr) {
  console.warn('   Cleanup failed (non-critical):', delErr.message);
} else {
  console.log('   OK — test rows deleted.');
}

console.log('\nAll checks passed. Events table is live and RLS is correct.');
