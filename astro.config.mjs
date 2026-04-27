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
    // CSP: Astro が <head> に <meta http-equiv="content-security-policy"> を
    // 注入し、bundle した script/style の hash を script-src/style-src に
    // 自動追加する。これにより 'unsafe-inline' を排除できる。
    // 制限: dev サーバではメタタグが注入されない (build/preview 限定)。
    //       Shiki や ClientRouter は非対応 (本テンプレは未使用)。
    // 既定の script-src/style-src 以外は directives に列挙する。
    csp: {
      directives: [
        "default-src 'self'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        // form-action は CSP3 仕様上 **送信中の全リダイレクトターゲット** に適用
        // されるため、Google OAuth (Issue #49) のフローで通過する Supabase Auth と
        // Google accounts ホストを明示的に許可する。OAuth 無効環境では `*.supabase.co`
        // 経路のフォーム送信は発生しないので permission を持っていても実害なし。
        "form-action 'self' https://*.supabase.co https://accounts.google.com",
        // Supabase Storage 署名付き URL (avatar 表示) を許可
        "img-src 'self' data: blob: https://*.supabase.co",
        "font-src 'self' data:",
        // Supabase Auth / REST / Realtime
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
        // Cloudflare Turnstile (CAPTCHA): widget は iframe で描画される
        "frame-src https://challenges.cloudflare.com",
        'upgrade-insecure-requests',
      ],
      // Turnstile の外部 script (challenges.cloudflare.com/turnstile/v0/api.js) は
      // Astro が自動 hash 化できないため scriptDirective.resources で明示許可する。
      // 当該 script を実際に注入するのは PUBLIC_TURNSTILE_SITE_KEY が
      // 設定されているときの SignupForm のみ (opt-in)。
      // 'self' は Astro の既定だが resources を指定すると上書きされてしまうため
      // 明示的に並べて Astro バンドル script (将来 chunk 分割した場合) も許可。
      scriptDirective: {
        resources: ["'self'", 'https://challenges.cloudflare.com'],
      },
    },
  },

  vite: {
    plugins: [tailwindcss()]
  }
});