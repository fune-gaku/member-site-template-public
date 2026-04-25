/// <reference types="astro/client" />

import type { User } from "@supabase/supabase-js";

declare global {
  interface ImportMetaEnv {
    readonly PUBLIC_SUPABASE_URL: string;
    readonly PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  namespace App {
    interface Locals {
      user: User | null;
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
