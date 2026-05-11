import { describe, expect, it, vi } from "vitest";

import { RESET_PASSWORD_GENERIC_SUCCESS_MESSAGE } from "../../src/lib/auth-errors";
import {
  performResetPassword,
  type ResetPasswordCapableClient,
} from "../../src/lib/auth-reset-password";

/**
 * Issue #14 (A3 follow-up): `auth.resetPassword` のアカウント列挙対策。
 *
 * Supabase の `resetPasswordForEmail` は通常未登録メールでも 200 を返すため
 * ベース挙動は enumeration safe だが、レートリミット / 内部 SMTP エラー /
 * 設定不備等が UI に透過するとサイドチャネルになる。本ヘルパーで全失敗ケースを
 * `success: true` + 統一メッセージに吸収することで、攻撃者から登録有無を
 * 判別不能にする。
 */

function makeClient(
  errorOrThrow:
    | { type: "ok" }
    | { type: "error"; error: { message: string; code?: string } }
    | { type: "throw"; cause: unknown },
): ResetPasswordCapableClient & {
  auth: { resetPasswordForEmail: ReturnType<typeof vi.fn> };
} {
  const resetPasswordForEmail = vi.fn().mockImplementation(async () => {
    if (errorOrThrow.type === "ok") return { error: null };
    if (errorOrThrow.type === "error") return { error: errorOrThrow.error };
    throw errorOrThrow.cause;
  });
  return { auth: { resetPasswordForEmail } };
}

const VALID_INPUT = {
  email: "user@example.com",
  options: {
    redirectTo: "https://example.com/auth/confirm?next=/auth/update-password",
  },
};

describe("performResetPassword (Issue #14)", () => {
  it("成功時は { success: true, message } を返し、redirectTo を Supabase に渡す", async () => {
    const client = makeClient({ type: "ok" });
    const result = await performResetPassword(client, VALID_INPUT);
    expect(result).toEqual({
      success: true,
      message: RESET_PASSWORD_GENERIC_SUCCESS_MESSAGE,
    });
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      VALID_INPUT.email,
      { redirectTo: VALID_INPUT.options.redirectTo },
    );
  });

  it.each([
    {
      name: "レートリミット (`For security purposes, you can only request`)",
      supabaseError: {
        message: "For security purposes, you can only request this once",
      },
    },
    {
      name: "SMTP 失敗",
      supabaseError: { message: "Error sending recovery email" },
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

      const result = await performResetPassword(client, VALID_INPUT);

      expect(result).toEqual({
        success: true,
        message: RESET_PASSWORD_GENERIC_SUCCESS_MESSAGE,
      });
      expect(errorSpy).toHaveBeenCalledWith(
        "auth.resetPassword error (suppressed for enumeration):",
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

    const result = await performResetPassword(client, VALID_INPUT);
    expect(result).toEqual({
      success: true,
      message: RESET_PASSWORD_GENERIC_SUCCESS_MESSAGE,
    });
    // Issue #7: logger.error が Error インスタンスを { name, message, stack? }
    // に正規化してから console.error に渡すため、生の cause ではなく正規化後の
    // 形を assert する（PII マスキング経路を通過することを保証する）。
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toBe(
      "auth.resetPassword unexpected (suppressed):",
    );
    expect(errorSpy.mock.calls[0]?.[1]).toMatchObject({
      name: "Error",
      message: "network down",
    });
    errorSpy.mockRestore();
  });
});
