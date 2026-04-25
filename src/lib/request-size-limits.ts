/**
 * Astro Actions（`/_actions/*`）への入口でリクエストボディのサイズを検査するための定数とヘルパー。
 *
 * Cloudflare Workers の組込み上限（100MB）は DoS 観点では緩すぎるため、用途別に絞った
 * Content-Length 検査を middleware で前段に挟む。Astro が `request.formData()` /
 * `request.json()` を呼ぶ前に弾くことで、巨大ボディを丸ごと読まずにメモリと CPU を節約できる。
 *
 * ファイルアップロードを伴う Action を新規追加する際は {@link UPLOAD_ACTION_PATHS} に
 * 必ずパスを追加すること。デフォルトは {@link MAX_ACTION_BODY_SIZE}（100KB）の厳しい上限が適用される。
 */

/** 一般 Action（JSON / form-urlencoded）の上限。100 KB。 */
export const MAX_ACTION_BODY_SIZE = 100 * 1024;

/**
 * ファイルアップロード Action（multipart/form-data）の上限。6 MB。
 * 内訳: avatars 5 MB（{@link MAX_AVATAR_SIZE} と一致） + multipart 境界 / メタ情報の余裕分。
 */
export const MAX_UPLOAD_BODY_SIZE = 6 * 1024 * 1024;

/**
 * ファイルアップロードを許可する Action パスの明示列挙。
 *
 * default-deny 方針: ここに無い `/_actions/*` は自動的に {@link MAX_ACTION_BODY_SIZE}
 * に制限される。新しいアップロード Action を追加するときに忘れずにここへ加えること。
 */
export const UPLOAD_ACTION_PATHS: ReadonlySet<string> = new Set([
  "/_actions/storage.uploadAvatar",
]);

const ACTION_PATH_PREFIX = "/_actions/";

/**
 * リクエストパスから許容するボディサイズ上限を返す。
 * Astro Action 以外（プレフィックス不一致）のときは null を返す。
 */
export function getActionBodyLimit(pathname: string): number | null {
  if (!pathname.startsWith(ACTION_PATH_PREFIX)) return null;
  if (UPLOAD_ACTION_PATHS.has(pathname)) return MAX_UPLOAD_BODY_SIZE;
  return MAX_ACTION_BODY_SIZE;
}

export type SizeCheckResult =
  | { ok: true }
  | { ok: false; status: 411 | 413; message: string };

/**
 * Content-Length と pathname を見て、リクエストを通すか拒否するかを返す。
 *
 * - Action 以外 → 常に通す
 * - Content-Length 欠損 / 非数値 / 負値 → 411 Length Required
 *   （ブラウザの form / fetch は Content-Length を必ず付与する。欠損は不正クライアント扱い）
 * - Content-Length が上限超過 → 413 Payload Too Large
 *
 * 戻り値の message は短い ASCII 1 行（情報漏洩なし）。
 */
export function checkActionBodySize(
  pathname: string,
  contentLengthHeader: string | null,
): SizeCheckResult {
  const limit = getActionBodyLimit(pathname);
  if (limit === null) return { ok: true };

  if (contentLengthHeader === null || contentLengthHeader.trim() === "") {
    return { ok: false, status: 411, message: "Length Required" };
  }
  const length = Number(contentLengthHeader);
  if (!Number.isFinite(length) || !Number.isInteger(length) || length < 0) {
    return { ok: false, status: 411, message: "Length Required" };
  }

  if (length > limit) {
    return { ok: false, status: 413, message: "Payload Too Large" };
  }

  return { ok: true };
}
