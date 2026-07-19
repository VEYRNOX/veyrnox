// Shared motion tokens per motion-foundations Rule 5/6. Consumers should import
// `duration`, `easing`, or `springs` rather than inlining new values so a single
// edit here restyles the whole app.

export const duration = {
  fast: 0.18,
  normal: 0.35,
  slow: 0.5,
};

// Bezier arrays are Apple-standard curves. `smooth` is the default enter/exit;
// `firm` gives a slightly stronger settle for larger elements; `out` is a named
// framer alias for the common `easeOut` shorthand.
// The string literals below are narrowed with `/** @type {const} */`. Without it
// TS widens them to `string`, which motion/react rejects: `ease` wants
// `Easing | Easing[]` and `transition.type` wants `AnimationGeneratorType`.
// Narrowing here fixes every consumer at once rather than casting at each call
// site. The bezier arrays are deliberately NOT narrowed — a readonly tuple is
// not assignable to motion's mutable `Easing[]`.
export const easing = {
  smooth: [0.22, 1, 0.36, 1],
  firm: [0.16, 1, 0.3, 1],
  out: /** @type {const} */ ("easeOut"),
};

export const springs = {
  snappy: { type: /** @type {const} */ ("spring"), stiffness: 380, damping: 32 },
  smooth: { type: /** @type {const} */ ("spring"), stiffness: 260, damping: 22 },
  bouncy: { type: /** @type {const} */ ("spring"), stiffness: 220, damping: 18 },
};
