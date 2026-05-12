import { defineMiddleware } from "astro:middleware";

import { getAuthUser } from "./lib/auth-claims";
import { logger } from "./lib/logger";
import { checkActionBodySize } from "./lib/request-size-limits";
import { safeNextPath } from "./lib/safe-redirect";
import { applySecurityHeaders } from "./lib/security-headers";
import { createClient } from "./lib/supabase";

export const onRequest = defineMiddleware(async (context, next) => {
  // Issue #9: Astro Actions（/_actions/*）への入口で Content-Length を検査し、
  // 用途別の上限を超えるリクエストは Supabase クライアント生成より前に弾く。
  // これにより巨大ボディ攻撃で auth 検証 / cookie 解析の費用を負担しない。
  const sizeCheck = checkActionBodySize(
    context.url.pathname,
    context.request.headers.get("content-length"),
  );
  if (!sizeCheck.ok) {
    const response = new Response(sizeCheck.message, {
      status: sizeCheck.status,
    });
    applySecurityHeaders(response);
    return response;
  }

  // 全ページで Supabase クライアントを生成し JWT を検証する。
  // これにより期限切れトークンのサイレントリフレッシュが走り、
  // createServerClient 内の setAll 経由で新しい Cookie が
  // context.cookies.set() される（Astro が自動で response に反映）。
  //
  // 失効反映の挙動: asymmetric signing key 設定時 getAuthUser はローカル検証に
  // なり、別端末 sign-out / アカウント停止が反映されるまで JWT 寿命まで遅延する。
  // 公式が "Most applications rarely need such strong guarantees. Consider
  // adjusting the JWT expiry time to an acceptable value." と明記している通り、
  // 本テンプレは admin 経路でも特別な強制サーバ検証はせず、JWT 寿命を運用で
  // 短く設定する方針 (.claude/deployment.md「Supabase Auth: JWT 寿命とセッション
  // 設定」参照)。完全な strong validation (auth.sessions check) は Issue #23。
  const supabase = createClient({
    request: context.request,
    cookies: context.cookies,
  });
  const user = await getAuthUser(supabase);

  context.locals.user = user;
  context.locals.profile = null;

  const { pathname } = context.url;
  const isMemberArea = pathname.startsWith("/member");
  const isAdminArea = pathname.startsWith("/admin");

  // 認証必須エリア: 未認証なら /auth/signin にリダイレクト
  if ((isMemberArea || isAdminArea) && !user) {
    // 多層防御: 将来 pathname 以外の値が載っても Open Redirect を防ぐため
    // safeNextPath を経由する（CWE-601）。
    const nextParam = safeNextPath(pathname);
    return context.redirect(
      `/auth/signin?next=${encodeURIComponent(nextParam)}`,
    );
  }

  // パフォーマンス配慮: role は /member と /admin 配下のみ取得
  if (user && (isMemberArea || isAdminArea)) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (profileError) {
      // 取得失敗時は最も制限の強い扱い（member 扱い）にフォールバック。
      // 内部情報はサーバーログのみに残す。
      logger.error("middleware: failed to load profile role", profileError);
      context.locals.profile = { role: "member" };
    } else {
      const role = profile.role === "admin" ? "admin" : "member";
      context.locals.profile = { role };
    }

    // /admin/* は admin ロールのみ許可
    if (isAdminArea && context.locals.profile.role !== "admin") {
      return context.redirect("/member/dashboard");
    }
  }

  const response = await next();

  // 認証必須エリアのレスポンスは中間 CDN / ブラウザキャッシュを禁止。
  // Supabase SSR 公式ガイド推奨: 認証 Cookie を含むレスポンスが
  // 他ユーザーに配信されることを防ぐ。
  if (isMemberArea || isAdminArea) {
    response.headers.set("Cache-Control", "private, no-store");
  }

  // 全レスポンスに共通セキュリティヘッダ（CSP / HSTS / X-Frame-Options 等）を付与。
  // Issue #004 対応。詳細は src/lib/security-headers.ts を参照。
  applySecurityHeaders(response);

  return response;
});
