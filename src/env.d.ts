/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    /**
     * 認証済みユーザーのプロフィール情報。
     * /member, /admin 配下でのみ middleware が取得する（パフォーマンス配慮）。
     * 未ログイン時や取得対象外パスでは null。
     */
    profile: {
      role: "member" | "admin";
    } | null;
  }
}
// Cloudflare.Env は worker-configuration.d.ts で自動生成
