import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import astro from "eslint-plugin-astro";
import importPlugin from "eslint-plugin-import";
import security from "eslint-plugin-security";
import sonarjs from "eslint-plugin-sonarjs";
import vue from "eslint-plugin-vue";
import globals from "globals";
import tseslint from "typescript-eslint";
import vueParser from "vue-eslint-parser";

// Issue #38: ハイブリッド構成
// - 構文ベース (recommended + strict + stylistic)
// - sonarjs / security (横方向)
// - .ts / .tsx / .mts / .cts 限定の typed lint (strictTypeCheckedOnly + stylisticTypeCheckedOnly)
//   ※ Only 版でベースの strict / stylistic と二重スタックを回避
//   ※ .vue / .astro は astro check / vue-tsc に委ね、typed lint を当てない
// - 手動 error 群（AI 生成バグ検出に直結）
// - 段階導入のため typed lint 違反が多いルール群は当面 warn（Sub Issue で error 化）
// - 公式ドキュメント: https://typescript-eslint.io/users/configs

export default [
  // ---- ignores ----
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

  // ---- linterOptions: 全ファイル共通 ----
  {
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },

  // ---- 基本 JS ルール ----
  js.configs.recommended,

  // ---- TypeScript strict（型情報なし） ----
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,

  // ---- sonarjs / security（横方向） ----
  sonarjs.configs.recommended,
  security.configs.recommended,

  // ---- Astro / Vue ----
  ...astro.configs.recommended,
  ...astro.configs["jsx-a11y-strict"],
  ...vue.configs["flat/recommended"],

  // ---- 全ファイル共通: 言語オプション + import + 手動ルール ----
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,mts,cts,astro,vue}"],
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
      // --- import 系（既存維持 + 公式 issue 要求項目を追加） ---
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
      "import/newline-after-import": "error",
      "import/no-self-import": "error",
      "import/no-useless-path-segments": "error",
      // import/first: vitest の vi.mock() 直前 import パターンと衝突するため warn から導入
      "import/first": "warn",
      // import/no-cycle: TIMING=1 計測で全体時間の 85% を消費（16s）するため当面 off。
      // Sub Issue で必要なら spot check または定期実行へ切り出し。
      "import/no-cycle": "off",

      // --- TypeScript 手動 error ---
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-assertions": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^__",
          varsIgnorePattern: "^__",
          caughtErrorsIgnorePattern: "^__",
        },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",
      // method-signature-style: Supabase の型定義 (interface foo(x): U) と衝突するため当面 warn
      "@typescript-eslint/method-signature-style": ["warn", "property"],

      // --- error（一般） ---
      eqeqeq: ["error", "smart"],
      "no-throw-literal": "error",
      "prefer-promise-reject-errors": "error",
      "no-shadow": "error",
      "no-param-reassign": "error",
      "prefer-const": "error",
      "no-return-assign": "error",
      "object-shorthand": "error",

      // --- warn（スタイル・複雑度・段階導入） ---
      complexity: ["warn", { max: 15 }],
      "max-depth": ["warn", { max: 4 }],
      "max-params": ["warn", { max: 6 }],
      "id-length": [
        "warn",
        {
          min: 3,
          properties: "never",
          exceptions: ["_", "h", "i", "j", "ok", "js", "vm", "fs", "id", "to"],
        },
      ],
      "sonarjs/cognitive-complexity": "warn",
      "class-methods-use-this": "warn",
      "prefer-template": "warn",
      "prefer-arrow-callback": "warn",
      "arrow-body-style": ["warn", "as-needed"],
      "no-implicit-coercion": "warn",
      "no-unneeded-ternary": "warn",
      "no-else-return": ["warn", { allowElseIf: false }],
      "consistent-return": "warn",
      "prefer-destructuring": "warn",

      // --- sonarjs: FP 多発ルールを off / @typescript-eslint と重複するものを off ---
      // 個別評価結果（Issue #38 Step 1 試走）:
      //   - sonarjs/deprecation: @typescript-eslint/no-deprecated と重複（同じ箇所を 2 倍計上）
      //   - sonarjs/prefer-regexp-exec: @typescript-eslint/prefer-regexp-exec と重複
      //   - sonarjs/no-hardcoded-passwords: 変数名パターンマッチで FP 5/5
      //   - sonarjs/no-hardcoded-ip: テストフィクスチャ値で FP
      //   - sonarjs/no-unused-vars: @typescript-eslint/no-unused-vars と重複
      //   - sonarjs/todo-tag: 既存運用で TODO コメントを許容しているため off
      "sonarjs/deprecation": "off",
      "sonarjs/prefer-regexp-exec": "off",
      "sonarjs/no-hardcoded-passwords": "off",
      "sonarjs/no-hardcoded-ip": "off",
      "sonarjs/no-unused-vars": "off",
      "sonarjs/todo-tag": "off",

      // --- security: FP 多発ルールを off ---
      // 個別評価結果（Issue #38 Step 1 試走）:
      //   - security/detect-object-injection: 動的キーアクセスを一律警告、3/3 が FP
      //   - security/detect-non-literal-fs-filename: Cloudflare Workers ランタイムに fs なし
      "security/detect-object-injection": "off",
      "security/detect-non-literal-fs-filename": "off",
    },
  },

  // ---- .ts / .tsx / .mts / .cts: typed lint （Only 版で二重スタック回避） ----
  ...tseslint.configs.strictTypeCheckedOnly.map((cfg) => ({
    ...cfg,
    files: ["**/*.{ts,tsx,mts,cts}"],
  })),
  ...tseslint.configs.stylisticTypeCheckedOnly.map((cfg) => ({
    ...cfg,
    files: ["**/*.{ts,tsx,mts,cts}"],
  })),

  // ---- .ts / .tsx / .mts / .cts: parserOptions + typed lint の error / warn 調整 ----
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // 公式 strictTypeChecked が error にしているもののうち、既存違反 100+ 件のクラスは
      // 段階導入のため warn に降格。Sub Issue で error 昇格 + 違反解消を実施する。
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-deprecated": "warn",
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/restrict-template-expressions": "warn",
      "@typescript-eslint/prefer-regexp-exec": "warn",
      "@typescript-eslint/prefer-optional-chain": "warn",
      "@typescript-eslint/no-confusing-void-expression": "warn",

      // 追加 error（AI 生成バグ検出に直結 / 既存違反 0 件のため格上げ済み）
      "@typescript-eslint/no-base-to-string": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/require-await": "error",
    },
  },

  // ---- Vue SFC: parser + 追加 error ----
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: "latest",
        sourceType: "module",
        extraFileExtensions: [".vue"],
      },
    },
    rules: {
      "vue/no-v-html": "error",
      "vue/no-useless-mustaches": "error",
      "vue/no-useless-v-bind": "error",
      "vue/prefer-true-attribute-shorthand": "error",
      "vue/no-empty-component-block": "error",
    },
  },

  // ---- Vue / Astro / JS / config 系: typed lint disable ----
  // typed lint は astro check / vue-tsc に委ね、ESLint 側では .ts 限定にとどめる
  {
    files: [
      "**/*.vue",
      "**/*.astro",
      "**/*.{js,mjs,cjs}",
      "*.config.{ts,js,cjs,mjs}",
    ],
    ...tseslint.configs.disableTypeChecked,
  },

  // ---- テストファイル緩和 ----
  {
    files: ["tests/**/*.ts", "**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "sonarjs/slow-regex": "off",
      "sonarjs/no-os-command-from-path": "off",
      "sonarjs/file-permissions": "off",
      "sonarjs/publicly-writable-directories": "off",
      "sonarjs/no-clear-text-protocols": "off",
      "sonarjs/assertions-in-tests": "off",
    },
  },

  // ---- Prettier 競合無効化（必ず最後） ----
  prettierConfig,
];
