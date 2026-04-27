import { describe, expect, it, vi } from "vitest";

import {
  CAPTCHA_FAILED_MESSAGE,
  SIGNIN_GENERIC_ERROR_MESSAGE,
} from "../../src/lib/auth-errors";
import {
  performSignIn,
  type SignInCapableClient,
} from "../../src/lib/auth-signin";

/**
 * Issue #8 (A3): `auth.signIn` のアカウント列挙対策。
 *
 * Supabase が返す失敗理由（存在しないユーザー / 間違ったパスワード /
 * `Email not confirmed` 等）が **すべて同一の `UNAUTHORIZED` + 統一メッセージ**
 * に正規化されることを Action ロジック本体 (`performSignIn`) で検証する。
 *
 * Issue #52: Cloudflare Turnstile 検証を Supabase Auth に委譲したため、CAPTCHA
 * 失敗 (`error.code === "captcha_failed"`) は **統一応答に巻き込まずに**
 * `BAD_REQUEST` で個別エラーとして返すこと（bot 検知失敗は enumeration vector
 * ではないため）も assert する。
 *
 * 真の防衛線はこの正規化。エラーメッセージ定数を変えただけで handler が
 * 旧経路に戻ってしまわないよう、振る舞いを直接 assert する。
 */

function makeClient(
  error: { message: string; code?: string } | null,
): SignInCapableClient & {
  auth: { signInWithPassword: ReturnType<typeof vi.fn> };
} {
  return {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ error }),
    },
  };
}

const VALID_INPUT = { email: "user@example.com", password: "anything" };

describe("performSignIn (Issue #8 / A3)", () => {
  it("成功時は { success: true } を返す", async () => {
    const client = makeClient(null);
    const result = await performSignIn(client, VALID_INPUT);
    expect(result).toEqual({ success: true });
    // captchaToken 無しのときは options 無しで呼ぶ (Turnstile 無効環境)
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: VALID_INPUT.email,
      password: VALID_INPUT.password,
      options: undefined,
    });
  });

  it("captchaToken を渡すと options.captchaToken に流す (Issue #52)", async () => {
    const client = makeClient(null);
    await performSignIn(client, { ...VALID_INPUT, captchaToken: "tk-123" });
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: VALID_INPUT.email,
      password: VALID_INPUT.password,
      options: { captchaToken: "tk-123" },
    });
  });

  it.each([
    {
      name: "間違ったパスワード / 存在しないユーザー (`Invalid login credentials`)",
      supabaseError: { message: "Invalid login credentials" },
    },
    {
      name: "メール未確認 (`Email not confirmed`) ※ enumeration vector",
      supabaseError: { message: "Email not confirmed" },
    },
    {
      name: "レートリミット相当のメッセージ",
      supabaseError: { message: "Too many requests" },
    },
    {
      name: "予期しない別文言",
      supabaseError: { message: "anything else" },
    },
  ])(
    "$name は UNAUTHORIZED + 統一メッセージに正規化される",
    async ({ supabaseError }) => {
      const client = makeClient(supabaseError);
      // console.error の呼び出しをスタブ化（テスト出力を汚さない & 呼び出しを検証）
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
        // suppress error output during this test
      });

      await expect(performSignIn(client, VALID_INPUT)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
        message: SIGNIN_GENERIC_ERROR_MESSAGE,
      });

      // 元エラーは Workers Logs に残す前提
      expect(errorSpy).toHaveBeenCalledWith(
        "auth.signIn error:",
        supabaseError,
      );
      errorSpy.mockRestore();
    },
  );

  it("captcha_failed は BAD_REQUEST + 個別メッセージに分離される (Issue #52)", async () => {
    // bot 検知失敗は enumeration vector ではないので統一応答に巻き込まない。
    const supabaseError = {
      message: "captcha protection: request disallowed (...)",
      code: "captcha_failed",
    };
    const client = makeClient(supabaseError);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // suppress
    });

    await expect(performSignIn(client, VALID_INPUT)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: CAPTCHA_FAILED_MESSAGE,
    });

    expect(errorSpy).toHaveBeenCalledWith(
      "auth.signIn captcha_failed:",
      supabaseError,
    );
    errorSpy.mockRestore();
  });

  it("複数の異なる Supabase エラーを順に渡しても応答は同一 (区別不能)", async () => {
    // enumeration 観点では、攻撃者が応答を比較しても情報が抽出できないことが
    // 重要。message と code が **bytewise に同一** であることを assert する。
    // (captcha_failed は別経路に分離されているのでここでは含めない)
    const errors = [
      { message: "Invalid login credentials" },
      { message: "Email not confirmed" },
      { message: "User not found" },
    ];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // suppress error output during this test
    });

    const responses: { code: unknown; message: unknown }[] = [];
    for (const e of errors) {
      try {
        await performSignIn(makeClient(e), VALID_INPUT);
      } catch (err) {
        responses.push({
          code: (err as { code?: unknown }).code,
          message: (err as { message?: unknown }).message,
        });
      }
    }
    errorSpy.mockRestore();

    expect(responses).toHaveLength(3);
    // 全レスポンスが互いに同一
    expect(responses[0]).toEqual(responses[1]);
    expect(responses[1]).toEqual(responses[2]);
    // かつ統一メッセージと一致
    expect(responses[0]).toEqual({
      code: "UNAUTHORIZED",
      message: SIGNIN_GENERIC_ERROR_MESSAGE,
    });
  });
});
