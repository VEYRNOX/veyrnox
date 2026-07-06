/**
 * Ring-boundary enforcement — CI invariant contract test.
 *
 * Critical Blocker #1: R0/R1 crypto-core (vault / keystore-KEK / signing gate)
 * must be structurally unreachable from the outer UI/backend rings. This test
 * pins the ESLint `ring-import-lint` rule as the CI guard for that boundary.
 *
 * It asserts on the machine CODE the rule reports (ruleId + messageId + the
 * stable "Ring boundary violation" phrase), NOT prose copy — copy can change,
 * the code is the contract (TDD honesty rule).
 *
 * The rule is exercised via ESLint's programmatic Linter with the real rule
 * module, using virtual filenames so no throwaway source files touch the tree.
 */

import { describe, it, expect } from "vitest";
import { Linter } from "eslint";
import ringImportLint from "../../eslint/rules/ring-import-lint.js";

const RULE_ID = "ring/ring-import-lint";

function lint(code, filename) {
  const linter = new Linter({ configType: "flat" });
  return linter.verify(code, {
    // Flat config must match the .jsx extension explicitly, or ESLint reports
    // "No matching configuration found" and never runs the rule on a UI file.
    files: ["**/*.js", "**/*.jsx"],
    plugins: {
      ring: { rules: { "ring-import-lint": ringImportLint } },
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      // UI-layer files are .jsx; enable JSX so espree parses them (mirrors the
      // repo eslint.config.js react block). Without this, ESLint bails with
      // "No matching configuration" before any rule runs on a .jsx filename.
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      [RULE_ID]: "error",
    },
    // Virtual filename decides whether the importing file is in a forbidden ring.
    // (Linter#verify passes this through as the reported filePath.)
  }, filename);
}

describe("ring-import-lint: R0/R1 crypto-core ring boundary", () => {
  it("catches a @vault import from a UI-layer file (the intentional violation)", () => {
    const code = `import { deserializeVault } from '@vault/deserialize';\nexport const x = deserializeVault;`;
    const messages = lint(code, "src/ui/WalletScreen.jsx");

    const violation = messages.find((m) => m.ruleId === RULE_ID);
    expect(violation, "expected a ring-import-lint violation").toBeTruthy();
    expect(violation.messageId).toBe("ringBoundary");
    expect(violation.severity).toBe(2); // error
    expect(violation.message).toContain("Ring boundary violation");
  });

  it("catches @signing and @keys imports from backend/api/state/pages/routes layers", () => {
    const cases = [
      { spec: "@signing/sign", file: "src/backend/handler.js" },
      { spec: "@keys/derive", file: "src/api/route.js" },
      { spec: "@vault/deserialize", file: "src/state/store.js" },
      { spec: "@signing/eip712", file: "src/pages/Send.jsx" },
      { spec: "@keys/kek", file: "src/routes/send.js" },
    ];
    for (const { spec, file } of cases) {
      const messages = lint(`import x from '${spec}';\nexport default x;`, file);
      const violation = messages.find((m) => m.ruleId === RULE_ID);
      expect(violation, `expected violation for ${spec} in ${file}`).toBeTruthy();
      expect(violation.messageId).toBe("ringBoundary");
    }
  });

  it("catches the REAL crypto-core tree (wallet-core / sign-gate) via @/-alias and relative paths", () => {
    const cases = [
      { spec: "@/wallet-core/keystore/kek.js", file: "src/ui/Unlock.jsx" },
      { spec: "@/wallet-core/vault.js", file: "src/pages/Vault.jsx" },
      { spec: "../../wallet-core/keystore/native.js", file: "src/backend/x.js" },
      { spec: "@/wallet-core/derivation.js", file: "src/pages/Stealth.jsx" },
      { spec: "@/wallet-core/coldkey/psbt.js", file: "src/api/sign.js" },
    ];
    for (const { spec, file } of cases) {
      const messages = lint(`import x from '${spec}';\nexport default x;`, file);
      const violation = messages.find((m) => m.ruleId === RULE_ID);
      expect(violation, `expected violation for ${spec} in ${file}`).toBeTruthy();
    }
  });

  it("catches crypto-core imports from the components layer (src/components)", () => {
    const cases = [
      { spec: "@/wallet-core/keystore/kek.js", file: "src/components/security/PinPad.jsx" },
      { spec: "@/wallet-core/mnemonic.js", file: "src/components/SeedEntry.jsx" },
      { spec: "@vault/deserialize", file: "src/components/hw/LedgerPanel.jsx" },
      // src/components/ui is exempted at CONFIG level (eslint.config.js), not
      // inside the rule — the raw rule still reports it. Pinned here so the
      // exemption stays visible and auditable in config rather than silently
      // baked into the rule.
      { spec: "@/wallet-core/vault.js", file: "src/components/ui/button.jsx" },
    ];
    for (const { spec, file } of cases) {
      const messages = lint(`import x from '${spec}';\nexport default x;`, file);
      const violation = messages.find((m) => m.ruleId === RULE_ID);
      expect(violation, `expected violation for ${spec} in ${file}`).toBeTruthy();
      expect(violation.messageId).toBe("ringBoundary");
    }
  });

  it("does NOT flag crypto-core imports from allowed layers (context/hooks facade, or inside crypto-core)", () => {
    const allowed = [
      { spec: "@vault/deserialize", file: "src/context/WalletProvider.jsx" },
      { spec: "@/wallet-core/vault.js", file: "src/hooks/useWallet.js" },
      { spec: "./kek.js", file: "src/wallet-core/keystore/index.js" },
      { spec: "../vault.js", file: "src/wallet-core/keystore/web.js" },
    ];
    for (const { spec, file } of allowed) {
      const messages = lint(`import x from '${spec}';\nexport default x;`, file);
      const violation = messages.find((m) => m.ruleId === RULE_ID);
      expect(violation, `unexpected violation for ${spec} in ${file}`).toBeFalsy();
    }
  });

  it("does NOT flag ordinary non-crypto-core imports from a UI file", () => {
    const cases = [
      "react",
      "@/components/ui/button",
      "../utils/format.js",
      "@vaultish/not-real", // similar spelling, not a crypto-core alias
      // The pre-sign gate is a PURE decision facade (no keys); the UI is meant
      // to call it. It must NOT be flagged as an R0/R1 boundary crossing.
      "@/sign-gate/presign.js",
      "@/sign-gate/compose.js",
      // Non-secret wallet-core metadata the UI legitimately imports.
      "@/wallet-core/assets.js",
      "@/wallet-core/netUrl.js",
      "@/wallet-core/evm/walletconnect/projectId.js",
    ];
    for (const spec of cases) {
      const messages = lint(
        `import x from '${spec}';\nexport default x;`,
        "src/ui/Screen.jsx"
      );
      const violation = messages.find((m) => m.ruleId === RULE_ID);
      expect(violation, `false positive for ${spec}`).toBeFalsy();
    }
  });

  it("also catches dynamic import() and re-export from a forbidden layer", () => {
    const dyn = lint(
      `export const load = () => import('@vault/deserialize');`,
      "src/ui/Lazy.jsx"
    );
    expect(dyn.find((m) => m.ruleId === RULE_ID)).toBeTruthy();

    const reexport = lint(
      `export { deserializeVault } from '@vault/deserialize';`,
      "src/backend/reexport.js"
    );
    expect(reexport.find((m) => m.ruleId === RULE_ID)).toBeTruthy();
  });
});
