/// <reference types="astro/client" />

import type { AuthUser } from "./lib/auth-claims";

declare global {
  // worker-configuration.d.ts の `Cloudflare.Exports` は `GlobalProps.mainModule` から
  // 計算される type alias。本リポは main を astro virtual entrypoint
  // (`@astrojs/cloudflare/entrypoints/server`) に向けているため wrangler types では
  // 自動補完されない。`exports.default.fetch(...)` を type-safe に呼ぶため、
  // GlobalProps を declaration merging で補完する。
  // tests/workers/csrf.test.ts の `exports.default.fetch(...)` で使用。
  namespace Cloudflare {
    interface GlobalProps {
      mainModule: {
        default: ExportedHandler<Cloudflare.Env>;
      };
    }
  }

  interface ImportMetaEnv {
    readonly PUBLIC_SUPABASE_URL: string;
    readonly PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
    readonly PUBLIC_GOOGLE_AUTH_ENABLED?: string;
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
