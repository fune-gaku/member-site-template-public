import { getViteConfig } from "astro/config";

export default getViteConfig({
  test: {
    // Astro コンポーネントのテストには node 環境が必須（Astro 6 破壊的変更）
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/workers/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,astro,vue}"],
      exclude: ["src/**/*.test.ts", "src/env.d.ts"],
    },
  },
});
