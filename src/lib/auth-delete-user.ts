import { ActionError } from "astro:actions";

import { logger } from "./logger";

/**
 * Issue #14: admin によるユーザーアカウント hard delete の本体実装。
 *
 * GDPR 第 17 条 / 個人情報保護法 第 35 条（消去請求）への defensive 対応として、
 * admin が他ユーザーを完全削除できる経路を提供する。self-service（ユーザー自身に
 * よる削除）は別 Issue で追加予定。
 *
 * 削除手順は **以下の順を厳守する** 必要がある:
 *
 *   1. Storage `avatars/<userId>/` 配下のオブジェクトを全件 remove
 *   2. `auth.users` から hard delete (`shouldSoftDelete: false`)
 *
 * Supabase 公式は **"You cannot delete a user if they are the owner of any
 * objects in Supabase Storage"** と明記しており、Storage を後回しにすると
 * `auth.admin.deleteUser` が owner constraint で失敗する。
 *
 * `auth.users` 削除は `public.profiles` / `public.member_posts` の `on delete
 * cascade` で連鎖削除される（pgTAP `070-cascade-delete-on-user-delete.test.sql`
 * で固定）。soft delete は "not reversible" で復活ツールを持たない本テンプレでは
 * 採用しない。
 *
 * @see https://supabase.com/docs/reference/javascript/auth-admin-deleteuser
 * @see https://supabase.com/docs/guides/auth/managing-user-data
 */

interface DeleteUserInput {
  userId: string;
}

interface StorageFileEntry {
  name: string;
}

/**
 * Storage `list` の 1 ページあたりの取得数（Supabase Storage のデフォルトと同じ）。
 *
 * 100 件超のアバター履歴を持つユーザを完全に削除するため、limit + offset で
 * 全ページを列挙する（Codex review iteration-1 P1 への対応）。
 */
const STORAGE_LIST_PAGE_SIZE = 100;

/**
 * pagination loop の暴走を防ぐ上限。
 *
 * `STORAGE_LIST_PAGE_SIZE` × この値 = 1 ユーザあたり最大 10,000 件のアバター。
 * 現実的な上限を遥かに超える保険値。これを超える異常時は明示的に MAX_PAGES で
 * 抜けることで、無限ループを早期検出できる（owner constraint 回避を諦めるよりも、
 * 失敗で抜ける方が運用診断しやすい）。
 */
const STORAGE_LIST_MAX_PAGES = 100;

/**
 * Supabase Storage `remove` の 1 回あたりの object 数上限。
 *
 * 公式（Codex review iteration-2 P1）: "When deleting objects, there is a
 * limit of 1000 objects at a time using the `remove` method."
 * https://supabase.com/docs/guides/storage/management/delete-objects
 *
 * 1001 件以上のパスを 1 回の remove に渡すと API が拒否し、後続の
 * `auth.admin.deleteUser` まで到達せず hard delete が失敗する。
 * 列挙した全パスを 1000 件単位で chunk して順次 remove 呼出する。
 */
const STORAGE_REMOVE_BATCH_SIZE = 1000;

/**
 * `performDeleteUser` が必要とする最小 admin client インターフェース。
 *
 * テスト容易性のために `@supabase/supabase-js` の `SupabaseClient` 全体を
 * 受け取らず、本関数が触る storage / auth.admin の 3 メソッドだけを宣言する。
 * `auth-change-password.ts` の `ChangePasswordCapableClient` と同じ流儀。
 */
export interface DeleteUserCapableAdminClient {
  storage: {
    from: (bucket: string) => {
      list: (
        folder: string,
        options?: { limit?: number; offset?: number },
      ) => Promise<{
        data: StorageFileEntry[] | null;
        error: { message: string } | null;
      }>;
      remove: (paths: string[]) => Promise<{
        data: unknown;
        error: { message: string } | null;
      }>;
    };
  };
  auth: {
    admin: {
      deleteUser: (
        userId: string,
        shouldSoftDelete: boolean,
      ) => Promise<{
        data: unknown;
        error: { message: string } | null;
      }>;
    };
  };
}

/** UI に表示する固定メッセージ（テストで参照するため export）。 */
export const DELETE_USER_INTERNAL_ERROR_MESSAGE =
  "ユーザーの削除に失敗しました";

export async function performDeleteUser(
  supabaseAdmin: DeleteUserCapableAdminClient,
  input: DeleteUserInput,
): Promise<{ success: true }> {
  const avatars = supabaseAdmin.storage.from("avatars");

  // 1. Storage avatars/<userId>/ を **全ページ** 列挙
  //    owner constraint 回避には残らず削除する必要がある (Supabase 公式の
  //    "You cannot delete a user if they are the owner of any objects in
  //    Supabase Storage")。Storage の list は default 100 件返す pagination API
  //    のため、100 件超のアバター履歴を持つユーザは limit + offset で全ページ
  //    走査する (Codex review iteration-1 P1)。
  const allFiles: StorageFileEntry[] = [];
  for (let page = 0; page < STORAGE_LIST_MAX_PAGES; page++) {
    const { data: pageFiles, error: listError } = await avatars.list(
      input.userId,
      {
        limit: STORAGE_LIST_PAGE_SIZE,
        offset: page * STORAGE_LIST_PAGE_SIZE,
      },
    );
    if (listError) {
      logger.error("admin.deleteUser storage.list failed", listError);
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message: DELETE_USER_INTERNAL_ERROR_MESSAGE,
      });
    }
    if (!pageFiles || pageFiles.length === 0) break;
    allFiles.push(...pageFiles);
    // ページが満杯でないなら最終ページなので終了 (1 回追加 list 呼出を節約)
    if (pageFiles.length < STORAGE_LIST_PAGE_SIZE) break;
  }

  // 2. 列挙された object を **1000 件 chunk で** 順次 remove
  //    Supabase Storage remove は 1 call あたり 1000 件上限のため、それを超える
  //    パスを 1 回で渡すと API が拒否する (Codex review iteration-2 P1)。
  //    公式: https://supabase.com/docs/guides/storage/management/delete-objects
  //    "When deleting objects, there is a limit of 1000 objects at a time
  //     using the `remove` method."
  if (allFiles.length > 0) {
    const allPaths = allFiles.map((f) => `${input.userId}/${f.name}`);
    for (
      let offset = 0;
      offset < allPaths.length;
      offset += STORAGE_REMOVE_BATCH_SIZE
    ) {
      const batch = allPaths.slice(offset, offset + STORAGE_REMOVE_BATCH_SIZE);
      const { error: removeError } = await avatars.remove(batch);
      if (removeError) {
        // batch の途中で失敗したら後続 batch / auth delete を呼ばずに即時失敗。
        // 部分削除状態のまま auth delete に進むと owner constraint で失敗するため、
        // 早期 return で運用診断しやすい状態にする (再実行で残りを掃除可能)。
        logger.error("admin.deleteUser storage.remove failed", removeError);
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: DELETE_USER_INTERNAL_ERROR_MESSAGE,
        });
      }
    }
  }

  // 3. auth.users から hard delete（profiles / member_posts は cascade で連鎖削除）
  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(
    input.userId,
    false,
  );
  if (deleteError) {
    logger.error("admin.deleteUser auth.admin.deleteUser failed", deleteError);
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: DELETE_USER_INTERNAL_ERROR_MESSAGE,
    });
  }

  return { success: true };
}
