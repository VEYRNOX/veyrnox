/**
 * ring-import-lint — R0/R1 crypto-core ring-boundary enforcement.
 *
 * Veyrnox is layered as concentric rings. R0/R1 (the crypto-core: seed, vault,
 * keystore/KEK, and the signing gate) must NOT be reachable from the outer
 * UI/backend rings. If a UI page, route, backend handler, or state store can
 * `import` the vault/keystore/signing modules directly, an XSS payload or a
 * compromised backend surface is one hop from the keys — which violates the
 * ring isolation the security model depends on.
 *
 * This rule is a STRUCTURAL guard: it does not (and cannot) prove the keys are
 * safe, it only fails the build when a forbidden layer imports a crypto-core
 * module, so the boundary can't silently erode. No auto-fix — a violation means
 * the code must be refactored (route the call through an allowed R2 facade),
 * which is a human decision, not a mechanical rewrite.
 *
 * Detection is specifier-shape based (works without a resolver):
 *   - Alias specifiers:      @vault/*, @signing/*, @keys/*
 *   - Real crypto-core tree: any path segment reaching src/wallet-core,
 *     src/wallet-core/keystore, or src/sign-gate (via `@/…` or relative `../`).
 *
 * Forbidden importing layers (matched against the importing file's path):
 *   src/ui, src/pages, src/routes, src/backend, src/api, src/state
 *
 * The reported message code is stable ("Ring boundary violation: …"); the prose
 * after the colon may change but the leading phrase is the contract tests pin.
 */

"use strict";

/** Alias specifiers that name R0/R1 crypto-core entrypoints directly. */
const CRYPTO_CORE_ALIASES = ["@vault", "@signing", "@keys"];

/**
 * Real crypto-core directories in this repo (R0/R1). Matched as normalized
 * path segments so both `@/wallet-core/...` and `../../wallet-core/...`
 * (and OS-specific separators) are caught.
 */
const CRYPTO_CORE_SEGMENTS = [
  "wallet-core/keystore",
  "wallet-core", // seed / vault / derivation / signing primitives
  "sign-gate", // the signing gate (R1)
];

/**
 * Outer-ring layers that must never import crypto-core directly. Matched
 * against the importing file's path (normalized to forward slashes).
 */
const FORBIDDEN_LAYERS = [
  "src/ui",
  "src/pages",
  "src/routes",
  "src/backend",
  "src/api",
  "src/state",
];

const MESSAGE =
  "Ring boundary violation: R0/R1 crypto-core cannot be imported from UI/backend";

/** Normalize a filename/specifier to forward-slash form for matching. */
function normalize(p) {
  return String(p).replace(/\\/g, "/");
}

/** True if the importing file lives in a forbidden outer-ring layer. */
function isForbiddenLayer(filename) {
  const f = normalize(filename);
  return FORBIDDEN_LAYERS.some(
    (layer) => f.includes(`/${layer}/`) || f.includes(`${layer}/`)
  );
}

/**
 * True if the import specifier names an R0/R1 crypto-core module.
 * Alias form (@vault/x) or a resolved path reaching a crypto-core segment.
 */
function isCryptoCoreImport(specifier) {
  const s = normalize(specifier);

  // Alias specifiers: exact alias or alias-prefixed subpath (@vault, @vault/deserialize).
  if (
    CRYPTO_CORE_ALIASES.some(
      (alias) => s === alias || s.startsWith(`${alias}/`)
    )
  ) {
    return true;
  }

  // Path-shaped specifiers (relative or @/-aliased) reaching a crypto-core dir.
  // Guard against bare package names of similar spelling by requiring the
  // segment to be delimited by a path separator (start/`/`) on the left.
  return CRYPTO_CORE_SEGMENTS.some((seg) => {
    return (
      s === seg ||
      s.endsWith(`/${seg}`) ||
      s.includes(`/${seg}/`) ||
      s.startsWith(`${seg}/`)
    );
  });
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Prevent R0/R1 crypto-core (@vault/@signing/@keys, wallet-core, sign-gate) from being imported by UI/backend layers",
      recommended: true,
    },
    // No fixable: refactoring across a ring boundary is a human decision.
    schema: [],
    messages: {
      ringBoundary: MESSAGE,
    },
  },

  create(context) {
    const filename =
      typeof context.getFilename === "function"
        ? context.getFilename()
        : context.filename;

    // Only outer-ring files can commit this violation. Inside crypto-core (or
    // the allowed R2 facade layer), these imports are legitimate.
    if (!filename || !isForbiddenLayer(filename)) {
      return {};
    }

    function check(node, rawSpecifier) {
      if (typeof rawSpecifier !== "string") return;
      if (isCryptoCoreImport(rawSpecifier)) {
        context.report({ node, messageId: "ringBoundary" });
      }
    }

    return {
      // import ... from '@vault/deserialize'
      ImportDeclaration(node) {
        check(node, node.source && node.source.value);
      },
      // export ... from '@vault/deserialize'
      ExportNamedDeclaration(node) {
        if (node.source) check(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        if (node.source) check(node, node.source.value);
      },
      // import('@vault/deserialize') and require('@vault/deserialize')
      ImportExpression(node) {
        if (node.source && node.source.type === "Literal") {
          check(node, node.source.value);
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee &&
          callee.type === "Identifier" &&
          callee.name === "require" &&
          node.arguments.length === 1 &&
          node.arguments[0].type === "Literal"
        ) {
          check(node, node.arguments[0].value);
        }
      },
    };
  },
};

export default rule;
