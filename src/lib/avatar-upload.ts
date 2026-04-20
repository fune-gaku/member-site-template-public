/**
 * avatars バケットへのアップロードに関する共通定数・サニタイザ。
 *
 * Issue #001: 日本語ファイル名サポート（Unicode を保持）
 * Issue #008: MIME / サイズ制限（サーバ側 Zod 早期検証 + バケット設定が真の防衛線）
 *
 * 設計方針:
 *  - 許可 MIME は 4 種類に限定。`image/svg+xml` は XML + JS 実行コンテナのため
 *    Stored XSS リスクがあり明示的に **除外** する（OWASP File Upload Cheat Sheet）。
 *  - サイズ上限は 5MB。クライアント表示用の UI / サーバ Zod / Supabase バケット設定で
 *    同一値を共有する（真の防衛線は supabase/migrations/001_init.sql の avatars バケット INSERT）。
 *  - ファイル名は Unicode を保持し、OS / URL / パストラバーサルで危険な
 *    限られた文字のみ `_` に置換する（RFC 3986）。
 */

export const ALLOWED_AVATAR_MIME = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

/** 5 MB (bytes) */
export const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

/**
 * `<input accept="...">` および UI ヘルプ表示用の配列表現。
 * ALLOWED_AVATAR_MIME と同じ値を保持する（1 箇所で管理）。
 */
export const ALLOWED_AVATAR_MIME_LIST = Array.from(ALLOWED_AVATAR_MIME);
export const ALLOWED_AVATAR_ACCEPT_ATTR = ALLOWED_AVATAR_MIME_LIST.join(",");

/**
 * アバターファイル名のサニタイザ（Issue #001）。
 *
 * 現行実装は日本語・絵文字・多言語を保持し、OS / URL で危険な文字のみ
 * `_` に置換する。従来の `/[^a-zA-Z0-9._-]/g` は国際化できず UX を損なうため
 * 廃止した (Issue #001 の推奨オプション1)。
 *
 * 置換対象:
 *   - `/` `\` : パス区切り（パストラバーサル / Windows パス）
 *   - `:` `*` `?` `"` `<` `>` `|` : Windows 予約文字
 *   - `\0` : NUL 終端攻撃
 *   - `..` : 親ディレクトリ参照（パストラバーサル）
 *   - 制御文字 (U+0000–U+001F, U+007F)
 *
 * 保持する例:
 *   - `プロフィール画像.jpg` -> そのまま
 *   - `会社ロゴ-2024.png`    -> そのまま
 *   - `田中 太郎.jpeg`       -> そのまま（スペースも保持。Supabase が URL エンコード）
 *   - `😀emoji.jpg`          -> そのまま
 *
 * 変換する例:
 *   - `../../etc/passwd`     -> `/` と `..` が無害化される
 *   - `file<script>.jpg`     -> `file_script_.jpg`
 *   - `テスト..画像.png`     -> `テスト_画像.png`
 *
 * 参考: OWASP File Upload Cheat Sheet / RFC 3986
 */
export function sanitizeAvatarFileName(name: string): string {
  if (typeof name !== "string" || name.length === 0) {
    return "file";
  }

  // 1. 制御文字 (NUL 含む) を除去。
  // eslint-disable-next-line no-control-regex
  let out = name.replace(/[\u0000-\u001f\u007f]/g, "_");

  // 2. パス区切り・Windows 予約文字を置換。
  out = out.replace(/[\\/:*?"<>|]/g, "_");

  // 3. `..` はパストラバーサル。`_` に畳み込む
  //    （連続するドットは `..` が残らなくなるまで置換）。
  while (out.includes("..")) {
    out = out.replace(/\.\./g, "_");
  }

  // 4. 先頭・末尾の空白やドットを削る
  //    （Windows では trailing dot を持つファイルが解釈事故を起こすため）。
  out = out.replace(/^[\s.]+|[\s.]+$/g, "");

  // 全部削れて空になったらフォールバック。
  if (out.length === 0) return "file";

  return out;
}
