/**
 * Issue #7: PII を抑止する server-side ログラッパー。
 *
 * `console.error` の薄いラッパーとして `logger.error(context, error, fields?)` を
 * 提供する。Cloudflare Workers Logs に流れる前にメールアドレスと JWT を機械的に
 * マスクしておくことで、ログ閲覧権限を持つ運用者やログ流出時の漏洩から PII を守る。
 *
 * ## マスキング方針
 *
 * - **email**: `user@example.com` → `u***@example.com`
 *   local-part の 1 文字目だけ残し、以降を `***` に置換。ドメインは保持する
 *   （テナント絞り込みなど運用診断に有用 / ドメイン部分は単独では PII として弱い）
 * - **JWT**: `eyJxxx.xxx.xxx` → `<redacted-jwt>` で完全削除
 *
 * **マスクしないもの**:
 * - UUID（user_id 等の内部識別子）— メールと組み合わせない限り本人特定に直結しない
 * - Supabase が返すスキーマ名 / カラム名等の構造情報 — 運用診断に必須
 *
 * ## 使い方
 *
 * ```ts
 * import { logger } from "@/lib/logger";
 *
 * logger.error("auth.signIn", error);
 * logger.error("auth.signIn", error, { email: input.email });
 * ```
 *
 * 内部では `console.error` を 1 回だけ呼ぶ。Vue コンポーネントから呼んだ場合
 * （ブラウザ console）も同じマスクが効くので、画面共有・サポート対応中の覗き見
 * 経由の漏洩にも一律で防御層を入れられる。
 *
 * ## なぜ logger なのか（既存コードからの動機）
 *
 * 既存実装は `console.error("auth.signIn error:", error)` の形で、Supabase が
 * 返すエラーオブジェクトをそのまま落としていた。Supabase の auth エラーは
 * `{ message, status, name }` の plain object で、message に email や内部状態を
 * 含む場合がある（例: `User <user@example.com> not found`）。これが Workers Logs
 * 経由で漏れる経路を断つのが本モジュールの目的。
 */

// ----------------------------------------
// マスキング: 各値タイプ別のサニタイザ
// ----------------------------------------

/**
 * RFC 5321 strict ではないが、運用ログに出てくる現実的な email を捕まえる正規表現。
 * - local-part: 英数 + `._+-` を 1 文字以上
 * - `@` を挟んでドメイン: 英数 + `.-` + TLD（2 文字以上）
 *
 * `i` フラグで大文字 / 小文字どちらの入力も拾う（`User@Example.COM`）。
 * `g` フラグで 1 つの文字列に複数 email が含まれる場合に全て置換する。
 */
const EMAIL_REGEX =
  /([A-Za-z0-9._+-])[A-Za-z0-9._+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

export function maskEmail(input: string): string {
  return input.replace(EMAIL_REGEX, "$1***$2");
}

/**
 * Supabase / OAuth で発行される JWT は `eyJ` で始まる base64url 3 セグメント。
 * Refresh token は別形式だが、JWT の方が圧倒的に多くログ経路に乗る。
 * 過剰マスクを避け、JWT 形に該当するものだけを `<redacted-jwt>` に置換する。
 */
const JWT_REGEX = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

export function maskJwt(input: string): string {
  return input.replace(JWT_REGEX, "<redacted-jwt>");
}

/** 文字列に対して全マスクをかける。 */
export function sanitizeString(input: string): string {
  return maskJwt(maskEmail(input));
}

// ----------------------------------------
// エラー / オブジェクトサニタイザ
// ----------------------------------------

/**
 * 任意の error 値（Error / Supabase 風 plain object / string / 不明）から
 * 「ログに乗せる安全な表現」を返す。
 *
 * - `Error` 派生は `{ name, message }` に縮約（stack はマスク後に保持）
 * - `{ message: string }` を持つ plain object はその message をマスクして返す
 * - 文字列はそのままマスク
 * - その他は JSON.stringify を試行し、失敗したら抽象文言にフォールバック
 *
 * 戻り値は `console.error` の第二引数に直接渡せる形（オブジェクト / 文字列）に統一する。
 */
export function sanitizeError(error: unknown): unknown {
  if (error == null) return error;

  if (typeof error === "string") {
    return sanitizeString(error);
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: sanitizeString(error.message),
      ...(typeof error.stack === "string"
        ? { stack: sanitizeString(error.stack) }
        : {}),
    };
  }

  if (typeof error === "object" && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string") {
      // 元オブジェクトの他フィールド（status / code / name 等）は保持し、message だけ差し替え
      return { ...(error as object), message: sanitizeString(message) };
    }
  }

  try {
    return sanitizeString(JSON.stringify(error));
  } catch {
    return "<unserializable error>";
  }
}

/** ログに添えるフリーフォーム fields のサニタイズ。 */
export function sanitizeFields(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string") {
      out[key] = sanitizeString(value);
    } else if (value && typeof value === "object") {
      out[key] = sanitizeError(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

// ----------------------------------------
// logger 本体
// ----------------------------------------

type LoggerFields = Record<string, unknown>;

/**
 * `logger.error(context, error, fields?)`
 *
 * 既存の `console.error("<context>:", error)` 呼び出しを置換するための薄いラッパー。
 * 内部では `console.error("<context>:", sanitizedError, sanitizedFields?)` を 1 回呼ぶ。
 *
 * - context 文字列の末尾に `:` を自動付与する（呼び出し側で `:` を付ける必要はない）
 * - error と fields の両方を機械的にマスクする
 */
export const logger = {
  error(context: string, error: unknown, fields?: LoggerFields): void {
    const sanitized = sanitizeError(error);
    if (fields) {
      console.error(`${context}:`, sanitized, sanitizeFields(fields));
    } else {
      console.error(`${context}:`, sanitized);
    }
  },
};
