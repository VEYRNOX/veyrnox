// #2713: the wipe/chaff ordering primitive. Pins its two mechanisms
// separately, because the provider-level test in
// lib/__tests__/WalletProvider.chaffWipeRace.test.jsx stays green while EITHER
// one holds: (1) a write begun before a wipe is refused after it, and
// (2) beginWipe() does not return while a chaff job is still running.
import { describe, it, expect } from 'vitest';
import { runChaffJob, beginWipe, CHAFF_SUPERSEDED } from '../wipeEpoch.js';

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

describe('wipeEpoch', () => {
  it('a guard captured before a wipe throws CHAFF_SUPERSEDED after it', async () => {
    const gate = deferred();
    let wrote = false;
    const job = runChaffJob(async (guard) => {
      guard(); // before the wipe: passes
      await gate.promise;
      guard(); // after the wipe: must refuse
      wrote = true;
    });
    const wipe = beginWipe();
    gate.resolve();
    await expect(job).rejects.toMatchObject({ code: CHAFF_SUPERSEDED });
    await wipe;
    expect(wrote).toBe(false);
  });

  it('beginWipe() does not resolve until in-flight jobs have settled', async () => {
    const gate = deferred();
    let settled = false;
    const job = runChaffJob(async () => { await gate.promise; settled = true; });
    let wipeDone = false;
    const wipe = beginWipe().then(() => { wipeDone = true; });
    await new Promise((r) => setTimeout(r, 10));
    expect(wipeDone).toBe(false); // still waiting on the job
    gate.resolve();
    await wipe;
    expect(settled).toBe(true);
    await job;
  });

  it('a job started after the wipe runs normally', async () => {
    await beginWipe();
    let wrote = false;
    await runChaffJob(async (guard) => { guard(); wrote = true; });
    expect(wrote).toBe(true);
  });
});
