/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

import type { User } from "@supabase/supabase-js";

declare namespace App {
  interface Locals {
    user: User | null;
  }
}

// Cloudflare Workers環境変数の型定義を拡張
declare namespace Cloudflare {
  interface Env {
    SUPABASE_SERVICE_ROLE_KEY: string;
  }
}
