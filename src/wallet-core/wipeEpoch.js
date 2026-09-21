// wallet-core/wipeEpoch.js
//
// #2713: order chaff provisioning against the panic wipe.
//
// Chaff (the stealth pool and the duress/panic slots) is provisioned
// fire-and-forget after create/import/restore/unlock, so a wipe can run while
// a job is still encrypting. Without this, the job's writes landed AFTER the
// wipe and re-created storage (258 entries observed in vitest), an I3 tell.
//
// Two independent mechanisms, both at the chaff writers rather than per caller:
//   1. Epoch. Every chaff job captures the epoch when it starts and calls its
//      guard immediately before each storage write. beginWipe() bumps the
//      epoch, so a write begun before a wipe throws CHAFF_SUPERSEDED instead
//      of landing after it (fail closed: the write is dropped, never retried).
//   2. Settle. beginWipe() waits for every in-flight job to finish before it
//      returns, so the wipe's erase runs after the last write it could race.
// Callers stay non-blocking: runChaffJob returns the job's own promise.

export const CHAFF_SUPERSEDED = 'CHAFF_SUPERSEDED';

let epoch = 0;
const inFlight = new Set();

/**
 * Run a chaff-provisioning job scoped to the current wipe epoch. `fn` receives
 * a guard it MUST call immediately before each storage write.
 * @template T
 * @param {(guard: () => void) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export function runChaffJob(fn) {
  const started = epoch;
  const guard = () => {
    if (epoch !== started) {
      throw Object.assign(new Error('Chaff write superseded by a wipe'), { code: CHAFF_SUPERSEDED });
    }
  };
  const job = Promise.resolve().then(() => fn(guard));
  inFlight.add(job);
  const done = () => { inFlight.delete(job); };
  job.then(done, done);
  return job;
}

/**
 * Invalidate every in-flight chaff job and wait for them to settle. Call at
 * the start of a wipe, before any erase. Never throws.
 * @returns {Promise<void>}
 */
export async function beginWipe() {
  epoch += 1;
  while (inFlight.size) await Promise.allSettled([...inFlight]);
}
