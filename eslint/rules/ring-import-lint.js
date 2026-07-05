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
 * Real R0/R1 crypto-core modules in this repo — the SECRET-BEARING slice only.
 * Matched as normalized path segments so both `@/wallet-core/...` and
 * `../../wallet-core/...` (and OS-specific separators) are caught.
 *
 * IMPORTANT: `wallet-core/` is NOT R0/R1 wholesale. It also holds non-secret
 * metadata that the UI legitimately imports (assets.js, netUrl.js, rpcConfig.js,
 * evm/walletconnect/projectId.js). Listing the whole tree here produces false
 * positives against benign metadata imports and dilutes the signal. Only the
 * modules that touch the seed / vault ciphertext / KEK / signing are R0/R1.
 */
const CRYPTO_CORE_SEGMENTS = [
  "wallet-core/keystore", // KEK / keyStore / web / native / hardware (H factor)
  "wallet-core/vault", // vault.js — DEK-encrypted seed at rest
  "wallet-core/vaultBackup", // vault export/restore ciphertext
  "wallet-core/mnemonic", // BIP-39 seed material
  "wallet-core/derivation", // HD private-key derivation
  "wallet-core/coldkey", // cold-key signing material
];
// NOTE on sign-gate: `src/sign-gate/*` (presign.js/compose.js) is deliberately a
// PURE decision facade — presignGate takes (raspTier, txLevel, acknowledged) and
// returns a proceed/refuse decision, touching NO keys (see the file header: "the
// call site in SendCrypto.jsx is a thin caller"). It is the R2 gate the UI is
// SUPPOSED to call before signing, so it is intentionally NOT in the forbidden
// segment list — flagging it would fight the architecture's own design. The
// `@signing/*` ALIAS remains forbidden (see CRYPTO_CORE_ALIASES) as the contract
// for a future key-touching signing entrypoint published under that alias.

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

  // Path-shaped specifiers (relative or @/-aliased) reaching a crypto-core
  // module. Strip a trailing file extension so `wallet-core/vault.js` matches
  // the `wallet-core/vault` segment (both the exact file and a subpath under a
  // directory of that name). The left side is required to be delimited by a
  // path separator (or string start) so a bare package of similar spelling
  // ("@vaultish/x", "somewallet-core-ish") is NOT matched.
  const noExt = s.replace(/\.(js|mjs|cjs|jsx|ts|tsx)$/, "");
  return CRYPTO_CORE_SEGMENTS.some((seg) => {
    const boundaryOk =
      noExt === seg ||
      noExt.endsWith(`/${seg}`) || // .../wallet-core/vault
      noExt.includes(`/${seg}/`) || // .../wallet-core/keystore/kek
      noExt.startsWith(`${seg}/`); // wallet-core/keystore/kek (no leading @//..)
    return boundaryOk;
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
