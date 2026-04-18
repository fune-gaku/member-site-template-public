import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/workers/**/*.test.ts"],
  },
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: "./wrangler.jsonc",
      },
      miniflare: {
        compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
        compatibilityDate: "2026-04-17",
        bindings: {
          SUPABASE_SERVICE_ROLE_KEY: "dummy-service-role-key-for-testing",
        },
      },
    }),
  ],
});
