import { describe, expect, it, vi } from "vitest";

import {
  DELETE_USER_INTERNAL_ERROR_MESSAGE,
  performDeleteUser,
  type DeleteUserCapableAdminClient,
} from "../../src/lib/auth-delete-user";

/**
 * Issue #14: admin によるユーザー hard delete の振る舞い検証。
 *
 * `performDeleteUser` が以下を保証することを固定する:
 *
 *   - Storage `avatars/<userId>/` を **必ず先に** 列挙して remove する
 *     （Supabase の owner constraint 回避）
 *   - その後で `auth.admin.deleteUser(userId, false)` (= hard delete) を呼ぶ
 *   - Storage 0 件のときは remove を呼ばずに deleteUser に進む
 *   - 各ステップでエラーが出たら後続を呼ばずに `INTERNAL_SERVER_ERROR` を throw
 *   - ユーザー向けメッセージに Supabase 内部エラー文字列を漏らさない
 */

interface MakeAdminOptions {
  listResult?: {
    data: { name: string }[] | null;
    error: { message: string } | null;
  };
  removeError?: { message: string } | null;
  deleteUserError?: { message: string } | null;
}

function makeAdmin(opts: MakeAdminOptions = {}) {
  const list = vi
    .fn()
    .mockResolvedValue(opts.listResult ?? { data: [], error: null });
  const remove = vi
    .fn()
    .mockResolvedValue({ data: null, error: opts.removeError ?? null });
  const deleteUser = vi
    .fn()
    .mockResolvedValue({ data: null, error: opts.deleteUserError ?? null });
  const from = vi.fn().mockReturnValue({ list, remove });
  const client: DeleteUserCapableAdminClient = {
    storage: { from },
    auth: { admin: { deleteUser } },
  };
  return { client, list, remove, deleteUser, from };
}

const VALID_INPUT = { userId: "11111111-1111-1111-1111-111111111111" };

describe("performDeleteUser (Issue #14, admin-only)", () => {
  it("正常系: list → remove → admin.deleteUser の順で呼ばれ success: true を返す", async () => {
    const { client, list, remove, deleteUser, from } = makeAdmin({
      listResult: {
        data: [
          { name: "1234567890_avatar.png" },
          { name: "9876543210_old.jpg" },
        ],
        error: null,
      },
    });

    const result = await performDeleteUser(client, VALID_INPUT);
    expect(result).toEqual({ success: true });

    expect(from).toHaveBeenCalledWith("avatars");
    expect(list).toHaveBeenCalledWith(VALID_INPUT.userId);
    expect(remove).toHaveBeenCalledWith([
      `${VALID_INPUT.userId}/1234567890_avatar.png`,
      `${VALID_INPUT.userId}/9876543210_old.jpg`,
    ]);
    expect(deleteUser).toHaveBeenCalledWith(VALID_INPUT.userId, false);

    // 順序保証: list → remove → deleteUser（owner constraint 回避のため不可逆）
    const listOrder = list.mock.invocationCallOrder[0];
    const removeOrder = remove.mock.invocationCallOrder[0];
    const deleteOrder = deleteUser.mock.invocationCallOrder[0];
    expect(listOrder).toBeLessThan(removeOrder);
    expect(removeOrder).toBeLessThan(deleteOrder);
  });

  it("Storage 0 件のときは remove を呼ばずに deleteUser を実行する", async () => {
    const { client, remove, deleteUser } = makeAdmin({
      listResult: { data: [], error: null },
    });

    const result = await performDeleteUser(client, VALID_INPUT);
    expect(result).toEqual({ success: true });
    expect(remove).not.toHaveBeenCalled();
    expect(deleteUser).toHaveBeenCalledWith(VALID_INPUT.userId, false);
  });

  it("Storage list 失敗は INTERNAL_SERVER_ERROR、後続を一切呼ばない", async () => {
    const { client, remove, deleteUser } = makeAdmin({
      listResult: { data: null, error: { message: "S3 connection refused" } },
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // suppress error output during this test
    });

    await expect(performDeleteUser(client, VALID_INPUT)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: DELETE_USER_INTERNAL_ERROR_MESSAGE,
    });

    expect(remove).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      "admin.deleteUser storage.list failed:",
      { message: "S3 connection refused" },
    );
    errorSpy.mockRestore();
  });

  it("Storage remove 失敗は INTERNAL_SERVER_ERROR、deleteUser を呼ばない", async () => {
    const { client, deleteUser } = makeAdmin({
      listResult: { data: [{ name: "x.png" }], error: null },
      removeError: { message: "remove failed" },
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // suppress error output during this test
    });

    await expect(performDeleteUser(client, VALID_INPUT)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: DELETE_USER_INTERNAL_ERROR_MESSAGE,
    });

    expect(deleteUser).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("admin.deleteUser 失敗は INTERNAL_SERVER_ERROR で抽象化", async () => {
    const { client } = makeAdmin({
      deleteUserError: {
        message: "user is owner of objects in storage",
      },
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // suppress error output during this test
    });

    await expect(performDeleteUser(client, VALID_INPUT)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: DELETE_USER_INTERNAL_ERROR_MESSAGE,
    });

    expect(errorSpy).toHaveBeenCalledWith(
      "admin.deleteUser auth.admin.deleteUser failed:",
      { message: "user is owner of objects in storage" },
    );
    errorSpy.mockRestore();
  });

  it("ユーザー向けメッセージに Supabase 内部エラー文字列を漏らさない", async () => {
    // 内部メッセージをそのまま返さず、抽象化された統一文言が上位に渡ることを確認
    const { client } = makeAdmin({
      deleteUserError: {
        message: "ERROR: column auth.users.deleted_at does not exist",
      },
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // suppress error output during this test
    });

    await expect(performDeleteUser(client, VALID_INPUT)).rejects.toMatchObject({
      message: DELETE_USER_INTERNAL_ERROR_MESSAGE,
    });

    errorSpy.mockRestore();
  });
});
