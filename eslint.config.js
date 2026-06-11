import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginUnusedImports from "eslint-plugin-unused-imports";

export default [
  {
    // Build artifacts / generated output — not linted (mirrors .gitignore).
    // `.claude/**` excludes nested git worktrees (each a full repo copy with its own
    // android/dist build output); without it `eslint .` descends into them and lints
    // their generated artifacts (e.g. a Capacitor native-bridge.js with a TS-only
    // disable directive), failing on rules this JS project doesn't register.
    ignores: ["ios/**", "android/**", "dist/**", "build/**", ".claude/**", "**/build/**"],
  },
  {
    files: [
      "src/components/**/*.{js,mjs,cjs,jsx}",
      "src/pages/**/*.{js,mjs,cjs,jsx}",
      "src/Layout.jsx",
    ],
    ignores: ["src/lib/**/*", "src/components/ui/**/*"],
    ...pluginJs.configs.recommended,
    ...pluginReact.configs.flat.recommended,
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      "unused-imports": pluginUnusedImports,
    },
    rules: {
      "no-unused-vars": "off",
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react/no-unknown-property": [
        "error",
        { ignore: ["cmdk-input-wrapper", "toast-close"] },
      ],
      "react-hooks/rules-of-hooks": "error",
    },
  },
  {
    // Node CLI scripts + verification harnesses (NOT app code — no React/JSX).
    // `eslint .` already traverses scripts/, but with no matching config block the
    // resolved rule set was empty there (parse errors only). This applies a
    // Node-oriented rule set so real violations are enforced. Mirrors the src
    // block's unused-imports handling and layers @eslint/js recommended on top.
    files: ["scripts/**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: globals.node,
      ecmaVersion: 2022,
      sourceType: "module",
    },
    plugins: {
      "unused-imports": pluginUnusedImports,
    },
    rules: {
      ...pluginJs.configs.recommended.rules,
      // Defer unused-var reporting to the plugin (warn, _-prefix escape hatch),
      // matching the src block, so the core error rule doesn't double-report.
      "no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
    },
  },
];
