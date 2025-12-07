/* eslint config for Windfall App (React + TypeScript) */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true,
    jest: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  settings: {
    react: { version: "detect" },
  },
  plugins: ["@typescript-eslint", "react", "react-hooks"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
  ],
  overrides: [
    {
      files: ["*.tsx"],
      rules: {
        "react/no-unescaped-entities": "off",
      },
    },
    {
      files: ["*.test.ts", "*.test.tsx", "setupTests.ts"],
      env: { jest: true },
      rules: {
        "@typescript-eslint/no-unsafe-assignment": "off",
        "@typescript-eslint/no-unsafe-call": "off",
        "@typescript-eslint/no-unsafe-member-access": "off",
      },
    },
  ],
  ignorePatterns: [
    "dist",
    "build",
    "node_modules",
    "vite.config.ts",
    "**/*.js",
  ],
  rules: {
    // Keep lint non-blocking for existing codebase; prefer warnings/off for noisy rules
    "no-console": "off",
    "no-constant-condition": "off",
    "react/prop-types": "off",
    "react/display-name": "off",
    // React hooks plugin (disable exhaustive-deps due to custom patterns and pre-existing issues)
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "off",

    // TypeScript rules relaxed to avoid flagging legacy any-heavy code
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/restrict-template-expressions": "off",
    "@typescript-eslint/no-floating-promises": "off",
    "@typescript-eslint/no-misused-promises": "off",
    "@typescript-eslint/no-unsafe-assignment": "off",
    "@typescript-eslint/no-unsafe-call": "off",
    "@typescript-eslint/no-unsafe-member-access": "off",
    "@typescript-eslint/no-unsafe-return": "off",
    "@typescript-eslint/no-unsafe-argument": "off",
    "@typescript-eslint/no-base-to-string": "off",
    "@typescript-eslint/no-unsafe-enum-comparison": "off",
    "@typescript-eslint/require-await": "off",
    "no-empty": "off",
    "prefer-const": "off",
    // Newly relaxed to avoid blocking on legacy patterns
    "no-inner-declarations": "off",
    "no-loss-of-precision": "off",
  },
};
