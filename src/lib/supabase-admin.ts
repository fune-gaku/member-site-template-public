import { createClient } from "@supabase/supabase-js";
import { env } from "cloudflare:workers";

export function createAdminClient() {
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. " +
        "For production, run `wrangler secret put SUPABASE_SERVICE_ROLE_KEY` " +
        "or set it in Cloudflare dashboard > Workers > Settings > Variables and Secrets. " +
        "For local dev, add it to .dev.vars.",
    );
  }

  return createClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
