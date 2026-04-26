import { describe, expect, it, vi } from "vitest";

import { SIGNUP_GENERIC_SUCCESS_MESSAGE } from "../../src/lib/auth-errors";
import {
  performSignUp,
  type SignUpCapableClient,
} from "../../src/lib/auth-signup";

/**
 * Issue #14 (A3 follow-up): `auth.signUp` のアカウント列挙対策。
 *
 * 既登録メール / 未登録メール / SMTP 失敗 / 内部例外いずれの場合も
 * **常に同一の `success: true` + 統一メッセージ** に正規化されることを検証する。
 *
 * これは Action 側の真の防衛線。テストで挙動を直接 assert することで、
 * リファクタで誤って handler が enumeration vector を再露出しないように守る。
 */

function makeClient(
  errorOrThrow:
    | { type: "ok" }
    | { type: "error"; error: { message: string } }
    | { type: "throw"; cause: unknown },
): SignUpCapableClient & {
  auth: { signUp: ReturnType<typeof vi.fn> };
} {
  const signUp = vi.fn().mockImplementation(async () => {
    if (errorOrThrow.type === "ok") return { error: null };
    if (errorOrThrow.type === "error") return { error: errorOrThrow.error };
    throw errorOrThrow.cause;
  });
  return { auth: { signUp } };
}

const VALID_INPUT = {
  email: "user@example.com",
  password: "SecurePass1",
  options: { emailRedirectTo: "https://example.com/auth/callback" },
};

describe("performSignUp (Issue #14)", () => {
  it("成功時は { success: true, message } を返す", async () => {
    const client = makeClient({ type: "ok" });
    const result = await performSignUp(client, VALID_INPUT);
    expect(result).toEqual({
      success: true,
      message: SIGNUP_GENERIC_SUCCESS_MESSAGE,
    });
    expect(client.auth.signUp).toHaveBeenCalledWith(VALID_INPUT);
  });

  it.each([
    {
      name: "既登録メール (`User already registered`) ※ enumeration vector",
      supabaseError: { message: "User already registered" },
    },
    {
      name: "SMTP / メール配送失敗",
      supabaseError: { message: "Error sending confirmation email" },
    },
    {
      name: "レートリミット相当",
      supabaseError: { message: "For security purposes, you can only request" },
    },
    {
      name: "予期しない別文言",
      supabaseError: { message: "anything else" },
    },
  ])(
    "$name でも success: true + 統一メッセージに正規化される",
    async ({ supabaseError }) => {
      const client = makeClient({ type: "error", error: supabaseError });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
        // suppress
      });

      const result = await performSignUp(client, VALID_INPUT);

      expect(result).toEqual({
        success: true,
        message: SIGNUP_GENERIC_SUCCESS_MESSAGE,
      });
      // 元エラーは Workers Logs に残す前提
      expect(errorSpy).toHaveBeenCalledWith(
        "auth.signUp error (suppressed for enumeration):",
        supabaseError,
      );
      errorSpy.mockRestore();
    },
  );

  it("予期しない例外でも success: true に吸収される", async () => {
    const cause = new Error("network down");
    const client = makeClient({ type: "throw", cause });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // suppress
    });

    const result = await performSignUp(client, VALID_INPUT);
    expect(result).toEqual({
      success: true,
      message: SIGNUP_GENERIC_SUCCESS_MESSAGE,
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "auth.signUp unexpected (suppressed):",
      cause,
    );
    errorSpy.mockRestore();
  });

  it("複数の異なる失敗を順に渡しても応答は同一 (区別不能)", async () => {
    // enumeration 観点では、攻撃者が応答を比較しても情報が抽出できないことが
    // 重要。message と success が **bytewise に同一** であることを assert する。
    const errors = [
      { message: "User already registered" },
      { message: "Error sending confirmation email" },
      { message: "Invalid email" },
    ];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // suppress
    });
    const responses = await Promise.all(
      errors.map((e) =>
        performSignUp(makeClient({ type: "error", error: e }), VALID_INPUT),
      ),
    );
    errorSpy.mockRestore();

    expect(responses).toHaveLength(3);
    expect(responses[0]).toEqual(responses[1]);
    expect(responses[1]).toEqual(responses[2]);
    expect(responses[0]).toEqual({
      success: true,
      message: SIGNUP_GENERIC_SUCCESS_MESSAGE,
    });
  });
});
