import { describe, expect, it, vi } from "vitest";

import { SIGNIN_GENERIC_ERROR_MESSAGE } from "../../src/lib/auth-errors";
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
 * 真の防衛線はこの正規化。エラーメッセージ定数を変えただけで handler が
 * 旧経路に戻ってしまわないよう、振る舞いを直接 assert する。
 */

function makeClient(error: { message: string } | null): SignInCapableClient & {
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
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith(VALID_INPUT);
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

  it("複数の異なる Supabase エラーを順に渡しても応答は同一 (区別不能)", async () => {
    // enumeration 観点では、攻撃者が応答を比較しても情報が抽出できないことが
    // 重要。message と code が **bytewise に同一** であることを assert する。
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
