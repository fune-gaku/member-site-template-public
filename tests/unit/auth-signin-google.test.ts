import { describe, expect, it, vi } from "vitest";

import {
  GOOGLE_OAUTH_GENERIC_ERROR_MESSAGE,
  isGoogleAuthEnabled,
  performSignInWithGoogle,
  type SignInWithGoogleCapableClient,
} from "../../src/lib/auth-signin-google";

/**
 * Issue #49: Google OAuth ログイン (PKCE フロー) Action 本体のテスト。
 *
 * - `performSignInWithGoogle`: `signInWithOAuth` の薄ラッパ。成功時は url を返す
 *   / 失敗時は INTERNAL_SERVER_ERROR + 汎用メッセージ + console.error に元エラー
 * - `isGoogleAuthEnabled`: `PUBLIC_GOOGLE_AUTH_ENABLED` が完全一致 `"true"` のときのみ
 *   true を返す（fail-closed）
 *
 * Action 自体（env チェック + safeNextPath + redirectTo 構築）は薄いため
 * 本ファイルでは perform 関数とフラグ判定を集中的に検証し、Action の組み立ては
 * `actions-schema.test.ts` で input schema のみ検証する分担。
 */

function makeClient(result: {
  data?: { url: string | null; provider?: string } | null;
  error: { message: string; code?: string } | null;
}): SignInWithGoogleCapableClient & {
  auth: { signInWithOAuth: ReturnType<typeof vi.fn> };
} {
  return {
    auth: {
      signInWithOAuth: vi.fn().mockResolvedValue({
        data: result.data ?? null,
        error: result.error,
      }),
    },
  };
}

const REDIRECT_TO =
  "https://member-site-template.your-subdomain.workers.dev/auth/callback?next=%2Fmember%2Fdashboard";

describe("performSignInWithGoogle (Issue #49)", () => {
  it("成功時は { url } を返す", async () => {
    const client = makeClient({
      data: {
        url: "https://accounts.google.com/o/oauth2/v2/auth?...",
        provider: "google",
      },
      error: null,
    });
    const result = await performSignInWithGoogle(client, {
      redirectTo: REDIRECT_TO,
    });
    expect(result).toEqual({
      url: "https://accounts.google.com/o/oauth2/v2/auth?...",
    });
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: REDIRECT_TO },
    });
  });

  it("Supabase が error を返したとき INTERNAL_SERVER_ERROR + 汎用メッセージで投げる", async () => {
    const supabaseError = {
      message: "Provider is not enabled",
      code: "provider_disabled",
    };
    const client = makeClient({ error: supabaseError });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // suppress
    });

    await expect(
      performSignInWithGoogle(client, { redirectTo: REDIRECT_TO }),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: GOOGLE_OAUTH_GENERIC_ERROR_MESSAGE,
    });

    expect(errorSpy).toHaveBeenCalledWith(
      "auth.signInWithGoogle error:",
      supabaseError,
    );
    errorSpy.mockRestore();
  });

  it("data.url が null のとき INTERNAL_SERVER_ERROR で投げる（Supabase 仕様逸脱への防御）", async () => {
    const client = makeClient({
      data: { url: null, provider: "google" },
      error: null,
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // suppress
    });

    await expect(
      performSignInWithGoogle(client, { redirectTo: REDIRECT_TO }),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: GOOGLE_OAUTH_GENERIC_ERROR_MESSAGE,
    });

    expect(errorSpy).toHaveBeenCalledWith(
      "auth.signInWithGoogle error:",
      expect.objectContaining({
        message: "signInWithOAuth returned no url",
      }),
    );
    errorSpy.mockRestore();
  });

  it("data 自体が null のとき INTERNAL_SERVER_ERROR で投げる", async () => {
    const client = makeClient({ data: null, error: null });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // suppress
    });

    await expect(
      performSignInWithGoogle(client, { redirectTo: REDIRECT_TO }),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: GOOGLE_OAUTH_GENERIC_ERROR_MESSAGE,
    });
    errorSpy.mockRestore();
  });

  it("内部エラー詳細はユーザー向けメッセージに含めない（情報漏洩対策）", async () => {
    // Supabase のエラー文言は内部実装由来のため、UI に流出しないことを保証する。
    const supabaseError = {
      message: "Database error: connection refused at 10.0.0.5",
      code: "internal",
    };
    const client = makeClient({ error: supabaseError });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // suppress
    });

    let thrownMessage = "";
    try {
      await performSignInWithGoogle(client, { redirectTo: REDIRECT_TO });
    } catch (err) {
      thrownMessage = (err as { message: string }).message;
    }

    expect(thrownMessage).toBe(GOOGLE_OAUTH_GENERIC_ERROR_MESSAGE);
    expect(thrownMessage).not.toContain("Database error");
    expect(thrownMessage).not.toContain("10.0.0.5");
    errorSpy.mockRestore();
  });
});

describe("isGoogleAuthEnabled (Issue #49 多層防御フラグ)", () => {
  it("完全一致 'true' のときのみ true を返す", () => {
    expect(isGoogleAuthEnabled("true")).toBe(true);
  });

  it.each([
    ["false", false],
    [undefined, false],
    ["", false],
    ["True", false],
    ["TRUE", false],
    ["1", false],
    ["yes", false],
    ["enabled", false],
    [" true", false],
    ["true ", false],
  ])("%j → %s（fail-closed）", (input, expected) => {
    expect(isGoogleAuthEnabled(input as string | undefined)).toBe(expected);
  });
});
