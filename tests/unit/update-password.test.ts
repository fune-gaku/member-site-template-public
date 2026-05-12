import { z } from "astro/zod";
import { describe, expect, it } from "vitest";

import { passwordSchema } from "../../src/lib/password-schema";

/**
 * Issue #002-B: `auth.updatePassword` / `auth.confirmOtp` のスキーマ検証。
 *
 * 実際の Action handler は Astro コンテキスト（cookies / request）が必要なため
 * ここではスキーマ単体のバリデーション挙動を確認する。
 * Action 本体の挙動（verifyOtp → updateUser → signOut）は E2E 検証の対象
 * （手動テスト手順は .claude/deployment.md のメールテンプレート節参照）。
 */

describe("auth.updatePassword input schema", () => {
  // actions/index.ts の input と同じ形。passwordSchema を再利用する
  const schema = z.object({ password: passwordSchema });

  it("強いパスワード (8 文字 + 英大小 + 数字) を受け入れる", () => {
    const result = schema.safeParse({ password: "NewPass123" });
    expect(result.success).toBe(true);
  });

  it("7 文字以下を拒否する", () => {
    const result = schema.safeParse({ password: "Abc123" });
    expect(result.success).toBe(false);
  });

  it("英大文字を含まないパスワードを拒否する", () => {
    const result = schema.safeParse({ password: "lowercase123" });
    expect(result.success).toBe(false);
  });

  it("英小文字を含まないパスワードを拒否する", () => {
    const result = schema.safeParse({ password: "UPPERCASE123" });
    expect(result.success).toBe(false);
  });

  it("数字を含まないパスワードを拒否する", () => {
    const result = schema.safeParse({ password: "NoDigitsHere" });
    expect(result.success).toBe(false);
  });

  it("72 文字超のパスワードを拒否する (bcrypt 限界)", () => {
    const pw = `A1${"a".repeat(71)}`; // 73 文字
    const result = schema.safeParse({ password: pw });
    expect(result.success).toBe(false);
  });

  it("`password` フィールドが空なら拒否する", () => {
    const result = schema.safeParse({ password: "" });
    expect(result.success).toBe(false);
  });

  it("`password` フィールドが欠けていれば拒否する", () => {
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("auth.confirmOtp input schema", () => {
  // actions/index.ts の confirmOtp input と同じ形
  const schema = z.object({
    token_hash: z.string().min(1),
    type: z.enum([
      "invite",
      "recovery",
      "email_change",
      "email",
      "signup",
      "magiclink",
    ]),
  });

  it.each([
    "invite",
    "recovery",
    "email_change",
    "email",
    "signup",
    "magiclink",
  ])("有効な type '%s' を受け入れる", (type) => {
    const result = schema.safeParse({ token_hash: "abc123", type });
    expect(result.success).toBe(true);
  });

  it("未知の type を拒否する", () => {
    const result = schema.safeParse({ token_hash: "abc123", type: "unknown" });
    expect(result.success).toBe(false);
  });

  it("空の token_hash を拒否する", () => {
    const result = schema.safeParse({ token_hash: "", type: "recovery" });
    expect(result.success).toBe(false);
  });

  it("token_hash が欠けていれば拒否する", () => {
    const result = schema.safeParse({ type: "recovery" });
    expect(result.success).toBe(false);
  });
});
