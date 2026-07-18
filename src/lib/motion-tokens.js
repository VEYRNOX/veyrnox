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
export const easing = {
  smooth: [0.22, 1, 0.36, 1],
  firm: [0.16, 1, 0.3, 1],
  out: "easeOut",
};

export const springs = {
  snappy: { type: "spring", stiffness: 380, damping: 32 },
  smooth: { type: "spring", stiffness: 260, damping: 22 },
  bouncy: { type: "spring", stiffness: 220, damping: 18 },
};
