// Module-scope, one-shot low-end device detection. Pure UI performance
// heuristic — no security relevance. Values (`navigator.deviceMemory`,
// `navigator.hardwareConcurrency`) never change during a session, so this is
// deliberately NOT a stateful hook: computed once at module load and exported
// as a plain boolean.
//
// `navigator.deviceMemory` is Chrome/Edge-only (undefined on Safari/Firefox);
// `navigator.hardwareConcurrency` is broadly supported. Either signal missing
// falls back to `Infinity` so that platform is never misclassified as
// low-end on that axis alone.
//
// Thresholds: <=2 GB RAM or <=2 logical cores counts as low-end.
//
// E2E override: Playwright CI runners are 4-core / 16 GB so they never trip the
// heuristic and animate the lamp for the whole suite — enough main-thread load
// to time out the onboarding illegal-transit specs. Force low-end when
// VITE_TEST_E2E is set so tests see the same "no lamp" render path shipped
// devices in the low-end bucket already get.
const forcedLowEnd =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_TEST_E2E === "1";

const mem =
  typeof navigator !== "undefined" && navigator.deviceMemory != null
    ? navigator.deviceMemory
    : Infinity;
const cores =
  typeof navigator !== "undefined" && navigator.hardwareConcurrency != null
    ? navigator.hardwareConcurrency
    : Infinity;

export const isLowEndDevice = forcedLowEnd || mem <= 2 || cores <= 2;

export default isLowEndDevice;
