import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/workers/**/*.test.ts"],
  },
  plugins: [
    cloudflareTest({
      // ルート `wrangler.jsonc` は Astro 仮想モジュール `@astrojs/cloudflare/entrypoints/server`
      // を main に指定しており workerd 単体では解決できない。
      // `astro build` が生成する `dist/server/wrangler.json` は `main: entry.mjs` の
      // 実体ファイルを指すので、Worker ランタイム上で Astro 全体（middleware /
      // security.checkOrigin / Actions）を起動できる。
      // `npm run test:workers` は事前に `astro build` を回す前提（package.json 参照）。
      wrangler: {
        configPath: "./dist/server/wrangler.json",
      },
      miniflare: {
        compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
        compatibilityDate: "2026-04-17",
        bindings: {
          SUPABASE_SERVICE_ROLE_KEY: "dummy-service-role-key-for-testing",
          PUBLIC_SUPABASE_URL: "https://dummy.supabase.co",
          PUBLIC_SUPABASE_PUBLISHABLE_KEY: "dummy-publishable-key-for-testing",
        },
      },
    }),
  ],
});
