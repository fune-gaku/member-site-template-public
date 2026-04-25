// @ts-check

import cloudflare from '@astrojs/cloudflare';
import node from '@astrojs/node';
import vue from '@astrojs/vue';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  // Vitest実行時はNodeアダプター、本番ビルド時はCloudflareアダプターを使用
  // これにより Astro Issue #15878 (resolve.external エラー) を回避
  adapter: process.env.VITEST
    ? node({ mode: 'standalone' })
    : cloudflare({ imageService: 'compile' }),
  integrations: [vue()],

  vite: {
    plugins: [tailwindcss()]
  }
});