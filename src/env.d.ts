/// <reference types="astro/client" />

import type { AuthUser } from "./lib/auth-claims";

declare global {
  interface ImportMetaEnv {
    readonly PUBLIC_SUPABASE_URL: string;
    readonly PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
    /**
     * Cloudflare Turnstile site key (公開可、なければ Turnstile 無効)。
     * 対の secret は Cloudflare Workers の環境変数 TURNSTILE_SECRET_KEY。
     */
    readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  namespace App {
    interface Locals {
      /**
       * 検証済み JWT クレームから抽出した最小ユーザー情報。
       * `getAuthUser(supabase)` (= 内部で `auth.getClaims()`) の戻り値。
       * full User オブジェクトではなく、本当に署名検証されたフィールドのみ。
       */
      user: AuthUser | null;
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
}

// Cloudflare.Env は worker-configuration.d.ts で自動生成
export {};
