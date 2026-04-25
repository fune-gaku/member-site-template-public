// @ts-check

import cloudflare from '@astrojs/cloudflare';
import node from '@astrojs/node';
import vue from '@astrojs/vue';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

// security.allowedDomains: Host header injection の多層防御。
// 既定 (空配列) では Astro は X-Forwarded-Host を一切信頼しないため
// 通常の Cloudflare Workers デプロイでは追加設定不要。
// 信頼できるリバースプロキシ配下に置く場合のみ ALLOWED_HOSTS を設定する。
// 形式: カンマ区切りのホスト名 (例: "app.example.com,staging.example.com")
const allowedDomains = process.env.ALLOWED_HOSTS
  ? process.env.ALLOWED_HOSTS.split(',')
      .map((h) => h.trim())
      .filter(Boolean)
      .map((hostname) => ({ hostname, protocol: 'https' }))
  : [];

// https://astro.build/config
export default defineConfig({
  output: 'server',
  // Vitest実行時はNodeアダプター、本番ビルド時はCloudflareアダプターを使用
  // これにより Astro Issue #15878 (resolve.external エラー) を回避
  adapter: process.env.VITEST
    ? node({ mode: 'standalone' })
    : cloudflare({ imageService: 'compile' }),
  integrations: [vue()],

  security: {
    // checkOrigin は Astro 6 の既定値 (true) のまま明示せず維持。
    // tests/workers/csrf.test.ts で実 workerd 上の挙動を検証している。
    allowedDomains,
  },

  vite: {
    plugins: [tailwindcss()]
  }
});