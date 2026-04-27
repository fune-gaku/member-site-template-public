import { ActionError } from "astro:actions";

import {
  CAPTCHA_FAILED_MESSAGE,
  SIGNUP_GENERIC_SUCCESS_MESSAGE,
} from "./auth-errors";

/**
 * Issue #14 (A3 follow-up): `auth.signUp` Action のアカウント列挙対策実装本体。
 *
 * Supabase の `signUp` は既登録メールに対して `User already registered` 等の
 * エラーを返すため、UI に透過するとメアドの存在判定に使える。すべての失敗ケース
 * （既登録 / SMTP 失敗 / レート超過 / 内部エラー）を統一成功メッセージに
 * 正規化し、攻撃者には登録有無を判定させない。
 *
 * 本ヘルパーが受け持つのは Supabase 呼び出し以降の応答正規化。事前検証
 * （HIBP / Zod スキーマ）は Action 側で先に行い、それらの BAD_REQUEST は
 * 通常通りユーザに返す（バリデーション失敗は enumeration vector ではないため）。
 *
 * Issue #52: Cloudflare Turnstile の検証は Supabase Auth (GoTrue) に委譲する。
 * caller は Action から `captchaToken` を受け取って `options.captchaToken` に
 * 流すだけ。Supabase Auth が CAPTCHA を検証し、失敗時は `error.code === "captcha_failed"`
 * を返してくる。これは enumeration vector ではない（bot 検知失敗）ので、統一
 * 成功応答に巻き込まずに `BAD_REQUEST` で個別エラーとして返す。
 *
 * 元エラーは `console.error` に落とし、Workers Logs から運用観察できるようにする。
 *
 * @see https://owasp.org/www-community/attacks/Account_Enumeration
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
 * @see https://supabase.com/docs/guides/auth/auth-captcha
 */

interface SignUpInput {
  email: string;
  password: string;
  captchaToken?: string;
  options?: {
    emailRedirectTo?: string;
  };
}

export interface SignUpCapableClient {
  auth: {
    signUp(input: {
      email: string;
      password: string;
      options?: {
        emailRedirectTo?: string;
        captchaToken?: string;
      };
    }): Promise<{
      error: { message: string; code?: string } | null;
    }>;
  };
}

export interface SignUpResult {
  success: true;
  message: string;
}

export async function performSignUp(
  supabase: SignUpCapableClient,
  input: SignUpInput,
): Promise<SignUpResult> {
  try {
    const { error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        ...(input.options?.emailRedirectTo
          ? { emailRedirectTo: input.options.emailRedirectTo }
          : {}),
        ...(input.captchaToken ? { captchaToken: input.captchaToken } : {}),
      },
    });
    if (error) {
      // CAPTCHA 失敗は統一成功応答 (enumeration 防御) ではなく個別の BAD_REQUEST。
      if (error.code === "captcha_failed") {
        console.error("auth.signUp captcha_failed:", error);
        throw new ActionError({
          code: "BAD_REQUEST",
          message: CAPTCHA_FAILED_MESSAGE,
        });
      }
      // 失敗詳細はログのみ。UI には enumeration を漏らさない統一成功応答を返す。
      console.error("auth.signUp error (suppressed for enumeration):", error);
    }
  } catch (e) {
    // captcha_failed の ActionError は素通しする (上で投げたものを再キャッチして
    // 飲み込まないように)。それ以外のネットワーク / 例外はログのみで吸収。
    if (e instanceof ActionError) throw e;
    console.error("auth.signUp unexpected (suppressed):", e);
  }
  return {
    success: true,
    message: SIGNUP_GENERIC_SUCCESS_MESSAGE,
  };
}
