import { defineMiddleware } from "astro:middleware";

import { createClient } from "./lib/supabase";

export const onRequest = defineMiddleware(async (context, next) => {
  // 全ページで Supabase クライアントを生成し getUser() を呼ぶ。
  // これにより期限切れトークンのサイレントリフレッシュが走り、
  // createServerClient 内の setAll 経由で新しい Cookie が
  // context.cookies.set() される（Astro が自動で response に反映）。
  const supabase = createClient({
    request: context.request,
    cookies: context.cookies,
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  context.locals.user = user;

  // /member 配下は認証必須。未認証なら /auth/signin にリダイレクト。
  if (context.url.pathname.startsWith("/member") && !user) {
    return context.redirect(
      `/auth/signin?next=${encodeURIComponent(context.url.pathname)}`,
    );
  }

  return next();
});
