// src/lib/upsellSlot.js
//
// One Safety Plus upsell card per app session. PaywallNudge (first-unlock-day
// modal) and BackupNagSheet (backup card) gate on unrelated state, so a free
// user could get both on the same unlock. Whichever becomes visible first
// holds the slot; the other stands down for the rest of the process.
//
// In memory only, like winFiredThisSession in winPaywall.js: no storage key, so
// no residue (I3) and nothing for panic.js to scrub. A cold restart resets it,
// and a nudge that stood down was never dismissed, so it is still eligible next
// session.

let holder = null;

/** True when no other upsell holds the slot. Pure read. */
export function upsellSlotFreeFor(owner) {
  return holder === null || holder === owner;
}

/** Take the slot. Returns false, changing nothing, if another owner holds it. */
export function claimUpsellSlot(owner) {
  if (!upsellSlotFreeFor(owner)) return false;
  holder = owner;
  return true;
}

/** Test seam only. Production never releases: the slot lasts the process. */
export function resetUpsellSlotForTests() {
  holder = null;
}
