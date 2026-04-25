import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import astro from "eslint-plugin-astro";
import importPlugin from "eslint-plugin-import";
import vue from "eslint-plugin-vue";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  // グローバル無視
  {
    ignores: [
      "dist/**",
      ".astro/**",
      ".wrangler/**",
      "node_modules/**",
      "coverage/**",
      "worker-configuration.d.ts",
    ],
  },

  // 基本 JS ルール
  js.configs.recommended,

  // TypeScript strict
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,

  // Astro
  ...astro.configs.recommended,
  ...astro.configs["jsx-a11y-strict"],

  // Vue
  ...vue.configs["flat/recommended"],

  // 共通ルール
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,astro,vue}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      // import 順序
      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
          ],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import/no-duplicates": "error",

      // TypeScript
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
    },
  },

  // Vue ファイル用に parser を指定
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
  },

  // テストファイル用の緩和ルール
  {
    files: ["tests/**/*.ts", "**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },

  // Prettier と競合するルールを無効化（必ず最後に配置）
  prettierConfig,
];
