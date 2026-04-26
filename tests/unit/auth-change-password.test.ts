import { describe, expect, it, vi } from "vitest";

import {
  CHANGE_PASSWORD_INTERNAL_ERROR_MESSAGE,
  CURRENT_PASSWORD_MISMATCH_MESSAGE,
  SAME_AS_CURRENT_PASSWORD_MESSAGE,
  performChangePassword,
  type ChangePasswordCapableClient,
} from "../../src/lib/auth-change-password";

/**
 * Issue #19: ログイン中ユーザー向け password 変更経路の振る舞い検証。
 *
 * recovery 用 `auth.updatePassword` と異なり、現パスワード再認証 (盗難 Cookie /
 * 共有 PC 攻撃の抑止) と「新旧同一拒否」が必要。`performChangePassword` が
 * これらを `auth.signInWithPassword` → `auth.updateUser` の順で正しく実行し、
 * 失敗時に `ActionError` で適切な code / message を返すことを検証する。
 */

function makeClient(opts: {
  reauthError?: { message: string } | null;
  updateError?: { message: string } | null;
}): ChangePasswordCapableClient & {
  auth: {
    signInWithPassword: ReturnType<typeof vi.fn>;
    updateUser: ReturnType<typeof vi.fn>;
  };
} {
  return {
    auth: {
      signInWithPassword: vi
        .fn()
        .mockResolvedValue({ error: opts.reauthError ?? null }),
      updateUser: vi
        .fn()
        .mockResolvedValue({ error: opts.updateError ?? null }),
    },
  };
}

const VALID_INPUT = {
  email: "user@example.com",
  currentPassword: "OldPassword123",
  newPassword: "NewPassword456",
};

describe("performChangePassword (Issue #19)", () => {
  it("正常系: 再認証成功 → updateUser 呼び出し → success: true", async () => {
    const client = makeClient({});
    const result = await performChangePassword(client, VALID_INPUT);
    expect(result).toEqual({ success: true });

    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: VALID_INPUT.email,
      password: VALID_INPUT.currentPassword,
    });
    expect(client.auth.updateUser).toHaveBeenCalledWith({
      password: VALID_INPUT.newPassword,
    });
  });

  it("新旧パスワード同一は BAD_REQUEST で拒否し、Auth サーバを叩かない", async () => {
    const client = makeClient({});
    await expect(
      performChangePassword(client, {
        ...VALID_INPUT,
        newPassword: VALID_INPUT.currentPassword,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: SAME_AS_CURRENT_PASSWORD_MESSAGE,
    });

    expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(client.auth.updateUser).not.toHaveBeenCalled();
  });

  it("現パスワード不一致は BAD_REQUEST + 統一メッセージ、updateUser は呼ばれない", async () => {
    const client = makeClient({
      reauthError: { message: "Invalid login credentials" },
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // suppress error output during this test
    });

    await expect(
      performChangePassword(client, VALID_INPUT),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: CURRENT_PASSWORD_MISMATCH_MESSAGE,
    });

    expect(client.auth.updateUser).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      "auth.changePassword reauth failed:",
      { message: "Invalid login credentials" },
    );
    errorSpy.mockRestore();
  });

  it("updateUser 失敗は INTERNAL_SERVER_ERROR で抽象化", async () => {
    const client = makeClient({
      updateError: { message: "internal db down" },
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // suppress error output during this test
    });

    await expect(
      performChangePassword(client, VALID_INPUT),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: CHANGE_PASSWORD_INTERNAL_ERROR_MESSAGE,
    });

    expect(errorSpy).toHaveBeenCalledWith(
      "auth.changePassword updateUser failed:",
      { message: "internal db down" },
    );
    errorSpy.mockRestore();
  });

  it("ユーザー向けメッセージに Supabase 内部エラー文字列を漏らさない", async () => {
    // updateUser が漏洩リスクのある内部メッセージを返しても、上位には抽象化された
    // 文言のみが渡ることを確認 (情報漏洩対策)
    const client = makeClient({
      updateError: { message: "ERROR: column users.id does not exist" },
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // suppress error output during this test
    });

    await expect(
      performChangePassword(client, VALID_INPUT),
    ).rejects.toMatchObject({
      message: CHANGE_PASSWORD_INTERNAL_ERROR_MESSAGE,
    });

    errorSpy.mockRestore();
  });
});
