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
    // pagination 対応: list は (folder, { limit, offset }) で呼ばれる (Codex iter-1 P1)
    expect(list).toHaveBeenCalledWith(VALID_INPUT.userId, {
      limit: 100,
      offset: 0,
    });
    // 2 件 (< limit) なので 1 ページで終了 → list は 1 回だけ呼ばれる
    expect(list).toHaveBeenCalledTimes(1);
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

  it("Codex iter-1 P1: 100+ files を持つユーザは pagination で全件削除する", async () => {
    // Supabase Storage の list はデフォルト 100 件返す pagination API。
    // 100 件超のアバター履歴を持つユーザを 1 回の list で処理すると残った
    // object が owner constraint を引いて hard delete を妨害する。
    // 全ページを limit + offset で walk して remove を 1 回まとめて呼ぶことを固定する。

    // ページ 1: 100 件 (= STORAGE_LIST_PAGE_SIZE 上限ぴったり)
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      name: `page1-${i.toString().padStart(3, "0")}.png`,
    }));
    // ページ 2: 50 件 (< 上限なので最終ページ)
    const page2 = Array.from({ length: 50 }, (_, i) => ({
      name: `page2-${i.toString().padStart(3, "0")}.png`,
    }));

    const list = vi
      .fn()
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: page2, error: null });
    const remove = vi.fn().mockResolvedValue({ data: null, error: null });
    const deleteUser = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn().mockReturnValue({ list, remove });
    const client: DeleteUserCapableAdminClient = {
      storage: { from },
      auth: { admin: { deleteUser } },
    };

    const result = await performDeleteUser(client, VALID_INPUT);
    expect(result).toEqual({ success: true });

    // list は 2 回呼ばれる (offset 0, offset 100)
    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenNthCalledWith(1, VALID_INPUT.userId, {
      limit: 100,
      offset: 0,
    });
    expect(list).toHaveBeenNthCalledWith(2, VALID_INPUT.userId, {
      limit: 100,
      offset: 100,
    });

    // remove は **1 回** で 150 件全パスを渡される (バッチ削除)
    expect(remove).toHaveBeenCalledTimes(1);
    const removedPaths = remove.mock.calls[0]?.[0] as string[];
    expect(removedPaths).toHaveLength(150);
    expect(removedPaths[0]).toBe(`${VALID_INPUT.userId}/page1-000.png`);
    expect(removedPaths[99]).toBe(`${VALID_INPUT.userId}/page1-099.png`);
    expect(removedPaths[100]).toBe(`${VALID_INPUT.userId}/page2-000.png`);
    expect(removedPaths[149]).toBe(`${VALID_INPUT.userId}/page2-049.png`);

    // deleteUser は最後に呼ばれる
    expect(deleteUser).toHaveBeenCalledWith(VALID_INPUT.userId, false);
  });

  it("Codex iter-2 P1: 1001+ files は remove が 1000 件 chunk で順次呼ばれる (公式上限)", async () => {
    // Supabase Storage remove は 1 call あたり 1000 オブジェクト上限。
    // 公式: https://supabase.com/docs/guides/storage/management/delete-objects
    // "When deleting objects, there is a limit of 1000 objects at a time using the `remove` method."
    // 1500 件持つユーザは 1000 + 500 の 2 batch で全削除する。

    // テスト簡略化のため list は 1 回で 1500 件返す mock にする
    // (本番では list の page size = 100 だが、本テストは remove の chunk 動作の検証に絞る)。
    const all1500 = Array.from({ length: 1500 }, (_, i) => ({
      name: `${i.toString().padStart(4, "0")}.png`,
    }));
    const list = vi
      .fn()
      .mockResolvedValueOnce({ data: all1500, error: null })
      // 2 回目: 0 件返して loop を確実に break
      .mockResolvedValueOnce({ data: [], error: null });
    const remove = vi.fn().mockResolvedValue({ data: null, error: null });
    const deleteUser = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn().mockReturnValue({ list, remove });
    const client: DeleteUserCapableAdminClient = {
      storage: { from },
      auth: { admin: { deleteUser } },
    };

    await performDeleteUser(client, VALID_INPUT);

    // remove は 2 回呼ばれる (1000 + 500)
    expect(remove).toHaveBeenCalledTimes(2);
    const batch1 = remove.mock.calls[0]?.[0] as string[];
    const batch2 = remove.mock.calls[1]?.[0] as string[];
    expect(batch1).toHaveLength(1000);
    expect(batch2).toHaveLength(500);
    expect(batch1[0]).toBe(`${VALID_INPUT.userId}/0000.png`);
    expect(batch1[999]).toBe(`${VALID_INPUT.userId}/0999.png`);
    expect(batch2[0]).toBe(`${VALID_INPUT.userId}/1000.png`);
    expect(batch2[499]).toBe(`${VALID_INPUT.userId}/1499.png`);

    // deleteUser は 全 batch 成功後に呼ばれる
    expect(deleteUser).toHaveBeenCalledWith(VALID_INPUT.userId, false);
  });

  it("Codex iter-2 P1: chunk の途中で remove が失敗したら後続 batch / deleteUser を呼ばない", async () => {
    // 部分削除状態のまま auth delete に進むと owner constraint で失敗するため、
    // 最初の失敗で即時 throw する (再実行で残りを掃除可能)。
    const all1500 = Array.from({ length: 1500 }, (_, i) => ({
      name: `${i.toString()}.png`,
    }));
    const list = vi
      .fn()
      .mockResolvedValueOnce({ data: all1500, error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const remove = vi
      .fn()
      // 1 回目失敗
      .mockResolvedValueOnce({
        data: null,
        error: { message: "rate limited" },
      });
    const deleteUser = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn().mockReturnValue({ list, remove });
    const client: DeleteUserCapableAdminClient = {
      storage: { from },
      auth: { admin: { deleteUser } },
    };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // suppress
    });

    await expect(performDeleteUser(client, VALID_INPUT)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: DELETE_USER_INTERNAL_ERROR_MESSAGE,
    });

    // 2 回目の remove (= 後続 batch) は呼ばれない
    expect(remove).toHaveBeenCalledTimes(1);
    // deleteUser も呼ばれない (Storage 全削除前なので owner constraint で失敗するため)
    expect(deleteUser).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("pagination 境界: 1 ページ目がぴったり 100 件 + 2 ページ目が空", async () => {
    // ちょうど 100 件のとき (PAGE_SIZE と一致): 1 ページ目では break せず
    // 2 ページ目で 0 件返ってから break することを固定する。
    const exactly100 = Array.from({ length: 100 }, (_, i) => ({
      name: `${i.toString()}.png`,
    }));
    const list = vi
      .fn()
      .mockResolvedValueOnce({ data: exactly100, error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const remove = vi.fn().mockResolvedValue({ data: null, error: null });
    const deleteUser = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn().mockReturnValue({ list, remove });
    const client: DeleteUserCapableAdminClient = {
      storage: { from },
      auth: { admin: { deleteUser } },
    };

    await performDeleteUser(client, VALID_INPUT);

    // 100 件ぴったりは「最終ページとは判別できない」ため 2 回目を必ず呼ぶ
    expect(list).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledTimes(1);
    const removedPaths = remove.mock.calls[0]?.[0] as string[];
    expect(removedPaths).toHaveLength(100);
  });
});
