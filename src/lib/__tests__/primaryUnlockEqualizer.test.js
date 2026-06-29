import { describe, it, expect } from 'vitest';
import { PRIMARY_UNLOCK_EQUALIZER_MS } from '../WalletProvider.jsx';
import { KDF_PARAMS } from '../../wallet-core/vault.js';

// H3 — timing equalizer must cover one Argon2id KDF at the CURRENT KDF_PARAMS,
// and must NOT exceed the worst-case multi-KDF path.
//
// The primary-success unlock path runs ~1 FEWER Argon2id KDF than any other
// outcome (miss/duress/panic/hidden each spend 3 via resolveDeniabilityUnlock).
// WalletProvider pads the fast path with PRIMARY_UNLOCK_EQUALIZER_MS so correct
// password and wrong password cost the same wall-clock time. The bound is
// TWO-SIDED:
//   - too short  → primary success is measurably FASTER than a miss (legacy
//     192-MiB-calibrated oracle, the 300 ms regression).
//   - too long   → primary success is measurably SLOWER than a miss. After the
//     64 MiB KDF downgrade (commit 1226085e), a 2500 ms pad that was sized for
//     ~1.7 s 192 MiB KDFs over-pads the fast path: primary-success ≈ 1 KDF + pad
//     while a miss ≈ 4 KDFs. At ~0.5 s/KDF that makes success ~1 s SLOWER than a
//     miss — a fresh distinguisher in the opposite direction.
//
// Estimate one KDF from KDF_PARAMS.memorySize so this guard tracks the runtime
// cost instead of a hardcoded device number. One KDF touches
// memorySize × iterations of memory; measured mobile-WebView Argon2id
// throughput is ~400 MB/s, which puts a 64 MiB / t=3 KDF at ~500 ms.
describe('H3 — PRIMARY_UNLOCK_EQUALIZER_MS two-sided bound', () => {
  const memMiB = KDF_PARAMS.memorySize / 1024;
  const totalMiB = memMiB * KDF_PARAMS.iterations; // memory touched per full KDF
  const THROUGHPUT_MIB_PER_S = 400; // measured mobile-WebView Argon2id ≈ 400 MB/s
  const oneKdfMs = (totalMiB / THROUGHPUT_MIB_PER_S) * 1000; // ≈ 480 ms at 64 MiB/t3

  it('is at least one KDF (>= oneKdfMs) so the fast path is not the short oracle', () => {
    expect(PRIMARY_UNLOCK_EQUALIZER_MS).toBeGreaterThanOrEqual(oneKdfMs);
  });

  it('is at most the worst-case path (<= 4 * oneKdfMs) so it is not the long oracle', () => {
    expect(PRIMARY_UNLOCK_EQUALIZER_MS).toBeLessThanOrEqual(4 * oneKdfMs);
  });
});
