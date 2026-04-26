import { z } from "astro/zod";
import { describe, it, expect } from "vitest";

import {
  RESET_PASSWORD_GENERIC_SUCCESS_MESSAGE,
  SIGNIN_GENERIC_ERROR_MESSAGE,
  SIGNUP_GENERIC_SUCCESS_MESSAGE,
} from "../../src/lib/auth-errors";

// src/actions/index.ts から schema だけを再定義してテスト
// （実際の actions は Astro コンテキストが必要なため）

describe("auth.signUp schema", () => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    "cf-turnstile-response": z.string().max(2048).optional(),
  });

  it("有効な入力を受け入れる", () => {
    const result = schema.safeParse({
      email: "redacted@example.com",
      password: "securePass123",
    });
    expect(result.success).toBe(true);
  });

  it("無効なメールアドレスを拒否する", () => {
    const result = schema.safeParse({
      email: "not-an-email",
      password: "securePass123",
    });
    expect(result.success).toBe(false);
  });

  it("短すぎるパスワードを拒否する", () => {
    const result = schema.safeParse({
      email: "redacted@example.com",
      password: "abc",
    });
    expect(result.success).toBe(false);
  });

  it("Turnstile token は optional (Turnstile 無効環境でも通る)", () => {
    const result = schema.safeParse({
      email: "redacted@example.com",
      password: "securePass123",
    });
    expect(result.success).toBe(true);
  });

  it("Turnstile token が長すぎる場合は拒否 (DoS 対策)", () => {
    const result = schema.safeParse({
      email: "redacted@example.com",
      password: "securePass123",
      "cf-turnstile-response": "x".repeat(2049),
    });
    expect(result.success).toBe(false);
  });
});

describe("auth.signIn schema (Issue #8 / A3, Issue #21 Turnstile follow-up)", () => {
  // actions/index.ts の signIn input と同じ形 (Issue #21 で Turnstile field を追加)
  const schema = z.object({
    email: z.string().email(),
    password: z.string(),
    "cf-turnstile-response": z.string().max(2048).optional(),
  });

  it("有効なメール + パスワードを受け入れる", () => {
    const result = schema.safeParse({
      email: "user@example.com",
      password: "anything",
    });
    expect(result.success).toBe(true);
  });

  it("形式不正なメール（auth に到達せずバリデーション層で 400）", () => {
    const result = schema.safeParse({
      email: "not-an-email",
      password: "anything",
    });
    expect(result.success).toBe(false);
  });

  it("Turnstile token は optional (Turnstile 無効環境でも通る)", () => {
    const result = schema.safeParse({
      email: "user@example.com",
      password: "anything",
    });
    expect(result.success).toBe(true);
  });

  it("Turnstile token 付きでも通る (Turnstile 有効環境)", () => {
    const result = schema.safeParse({
      email: "user@example.com",
      password: "anything",
      "cf-turnstile-response": "valid-token",
    });
    expect(result.success).toBe(true);
  });

  it("Turnstile token が長すぎる場合は拒否 (DoS 対策)", () => {
    const result = schema.safeParse({
      email: "user@example.com",
      password: "anything",
      "cf-turnstile-response": "x".repeat(2049),
    });
    expect(result.success).toBe(false);
  });
});

describe("auth.signIn account enumeration defense (Issue #8 / A3)", () => {
  it("統一エラーメッセージは存在不存在を区別しない汎用文言である", () => {
    expect(SIGNIN_GENERIC_ERROR_MESSAGE).toBe(
      "メールアドレスまたはパスワードが正しくありません",
    );
  });

  it("メールアドレスの登録有無を示唆する語が含まれていない", () => {
    // 過去に Supabase が返してきた enumeration 漏洩文言が
    // 統一メッセージに紛れ込まないことをガードする
    const lowered = SIGNIN_GENERIC_ERROR_MESSAGE.toLowerCase();
    expect(lowered).not.toMatch(/not\s*found/);
    expect(lowered).not.toMatch(/already/);
    expect(lowered).not.toMatch(/confirm/);
    expect(lowered).not.toMatch(/exists?/);
    expect(lowered).not.toMatch(/registered/);
    expect(SIGNIN_GENERIC_ERROR_MESSAGE).not.toMatch(
      /未登録|登録されていません|確認/,
    );
  });
});

describe("auth.resetPassword schema (Issue #21 Turnstile follow-up)", () => {
  // actions/index.ts の resetPassword input と同じ形
  const schema = z.object({
    email: z.string().email(),
    "cf-turnstile-response": z.string().max(2048).optional(),
  });

  it("有効なメールアドレスを受け入れる", () => {
    const result = schema.safeParse({ email: "redacted@example.com" });
    expect(result.success).toBe(true);
  });

  it("メールアドレス以外を拒否する", () => {
    const result = schema.safeParse({ email: "invalid" });
    expect(result.success).toBe(false);
  });

  it("Turnstile token は optional (Turnstile 無効環境でも通る)", () => {
    const result = schema.safeParse({ email: "redacted@example.com" });
    expect(result.success).toBe(true);
  });

  it("Turnstile token 付きでも通る", () => {
    const result = schema.safeParse({
      email: "redacted@example.com",
      "cf-turnstile-response": "valid-token",
    });
    expect(result.success).toBe(true);
  });

  it("Turnstile token が長すぎる場合は拒否 (DoS 対策)", () => {
    const result = schema.safeParse({
      email: "redacted@example.com",
      "cf-turnstile-response": "x".repeat(2049),
    });
    expect(result.success).toBe(false);
  });
});

describe("auth.signUp / auth.resetPassword account enumeration defense (Issue #14)", () => {
  it("signUp 統一成功メッセージは登録有無を区別しない", () => {
    // 既登録 / 未登録いずれの場合も同一文言を返すことが攻撃者から判別不能の前提
    expect(SIGNUP_GENERIC_SUCCESS_MESSAGE).toBeTypeOf("string");
    expect(SIGNUP_GENERIC_SUCCESS_MESSAGE.length).toBeGreaterThan(0);
  });

  it("signUp 統一成功メッセージにメール存在判定の語が含まれていない", () => {
    const lowered = SIGNUP_GENERIC_SUCCESS_MESSAGE.toLowerCase();
    expect(lowered).not.toMatch(/already\s*registered/);
    expect(lowered).not.toMatch(/email\s*exists/);
    expect(SIGNUP_GENERIC_SUCCESS_MESSAGE).not.toMatch(
      /既に登録されています|登録済みです|別のメール/,
    );
  });

  it("resetPassword 統一成功メッセージは登録有無を区別しない", () => {
    expect(RESET_PASSWORD_GENERIC_SUCCESS_MESSAGE).toBeTypeOf("string");
    expect(RESET_PASSWORD_GENERIC_SUCCESS_MESSAGE.length).toBeGreaterThan(0);
  });

  it("resetPassword 統一成功メッセージにアカウント不存在を断定する語が含まれていない", () => {
    // 「未登録」のような断定はせず、可能性の表現にとどめる前提
    const message = RESET_PASSWORD_GENERIC_SUCCESS_MESSAGE;
    expect(message).not.toMatch(/このメールは登録されていません/);
    expect(message).not.toMatch(/account\s*not\s*found/i);
  });
});

describe("admin.createUser schema", () => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    displayName: z.string().optional(),
  });

  it("displayName なしでも有効", () => {
    const result = schema.safeParse({
      email: "new@example.com",
      password: "secret123",
    });
    expect(result.success).toBe(true);
  });

  it("displayName 付きで有効", () => {
    const result = schema.safeParse({
      email: "new@example.com",
      password: "secret123",
      displayName: "藤井迪生",
    });
    expect(result.success).toBe(true);
  });
});

describe("posts.create schema", () => {
  const schema = z.object({
    title: z.string().trim().min(1, "タイトルは必須です").max(200),
    body: z.string().max(10_000).optional().default(""),
  });

  it("タイトルのみで有効", () => {
    const result = schema.safeParse({ title: "テスト投稿" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body).toBe("");
    }
  });

  it("タイトル + 本文で有効", () => {
    const result = schema.safeParse({ title: "t", body: "hello" });
    expect(result.success).toBe(true);
  });

  it("空タイトルを拒否する", () => {
    const result = schema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("空白のみのタイトルを拒否する（trim 後に空）", () => {
    const result = schema.safeParse({ title: "   " });
    expect(result.success).toBe(false);
  });

  it("200文字超のタイトルを拒否する", () => {
    const result = schema.safeParse({ title: "a".repeat(201) });
    expect(result.success).toBe(false);
  });
});

describe("posts.update schema", () => {
  const schema = z.object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    body: z.string().max(10_000).optional().default(""),
  });

  it("有効な UUID と title で通る", () => {
    const result = schema.safeParse({
      id: "123e4567-e89b-12d3-a456-426614174000",
      title: "更新後",
    });
    expect(result.success).toBe(true);
  });

  it("UUID ではない id を拒否する", () => {
    const result = schema.safeParse({
      id: "not-a-uuid",
      title: "更新後",
    });
    expect(result.success).toBe(false);
  });
});

describe("Issue #9: 文字列フィールドの .max() 多層防御", () => {
  // actions/index.ts と同じ形を再宣言（Astro context 不要のため）
  const signInSchema = z.object({
    email: z.string().email().max(254),
    password: z.string().max(200),
    "cf-turnstile-response": z.string().max(2048).optional(),
  });
  const signUpSchema = z.object({
    email: z.string().email().max(254),
    password: z.string().min(8),
    "cf-turnstile-response": z.string().max(2048).optional(),
  });
  const resetPasswordSchema = z.object({
    email: z.string().email().max(254),
    "cf-turnstile-response": z.string().max(2048).optional(),
  });
  const confirmOtpSchema = z.object({
    token_hash: z.string().min(1).max(512),
    type: z.enum([
      "invite",
      "recovery",
      "email_change",
      "email",
      "signup",
      "magiclink",
    ]),
  });
  const getSignedUrlSchema = z.object({ path: z.string().max(512) });
  const adminCreateUserSchema = z.object({
    email: z.string().email().max(254),
    password: z.string().min(8),
    displayName: z.string().max(100).optional(),
  });
  const adminInviteUserSchema = z.object({
    email: z.string().email().max(254),
  });

  it("email は 254 文字超で拒否（RFC 5321）", () => {
    const longEmail = `${"a".repeat(250)}@b.co`; // 256 chars
    expect(
      signInSchema.safeParse({ email: longEmail, password: "x" }).success,
    ).toBe(false);
    expect(
      signUpSchema.safeParse({ email: longEmail, password: "abcdefgh" })
        .success,
    ).toBe(false);
    expect(resetPasswordSchema.safeParse({ email: longEmail }).success).toBe(
      false,
    );
    expect(
      adminCreateUserSchema.safeParse({
        email: longEmail,
        password: "abcdefgh",
      }).success,
    ).toBe(false);
    expect(adminInviteUserSchema.safeParse({ email: longEmail }).success).toBe(
      false,
    );
  });

  it("signIn の password は 201 文字以上で拒否", () => {
    const result = signInSchema.safeParse({
      email: "ok@example.com",
      password: "p".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("admin.createUser の displayName は 101 文字以上で拒否", () => {
    const result = adminCreateUserSchema.safeParse({
      email: "ok@example.com",
      password: "abcdefgh",
      displayName: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("auth.confirmOtp の token_hash は 513 文字以上で拒否", () => {
    const result = confirmOtpSchema.safeParse({
      token_hash: "t".repeat(513),
      type: "recovery",
    });
    expect(result.success).toBe(false);
  });

  it("storage.getSignedUrl の path は 513 文字以上で拒否", () => {
    expect(
      getSignedUrlSchema.safeParse({ path: "x".repeat(513) }).success,
    ).toBe(false);
  });

  it("各上限ピッタリは通る（境界）", () => {
    const exactly254 = `${"a".repeat(248)}@b.co`; // 254 chars
    expect(
      signInSchema.safeParse({ email: exactly254, password: "x" }).success,
    ).toBe(true);
    expect(
      adminCreateUserSchema.safeParse({
        email: exactly254,
        password: "abcdefgh",
        displayName: "a".repeat(100),
      }).success,
    ).toBe(true);
    expect(
      confirmOtpSchema.safeParse({
        token_hash: "t".repeat(512),
        type: "recovery",
      }).success,
    ).toBe(true);
    expect(
      getSignedUrlSchema.safeParse({ path: "x".repeat(512) }).success,
    ).toBe(true);
  });
});

describe("admin.updateUserRole schema", () => {
  const schema = z.object({
    userId: z.string().uuid(),
    role: z.enum(["member", "admin"]),
  });

  it("role=admin で有効", () => {
    const result = schema.safeParse({
      userId: "123e4567-e89b-12d3-a456-426614174000",
      role: "admin",
    });
    expect(result.success).toBe(true);
  });

  it("role=member で有効", () => {
    const result = schema.safeParse({
      userId: "123e4567-e89b-12d3-a456-426614174000",
      role: "member",
    });
    expect(result.success).toBe(true);
  });

  it("許可されないロール文字列を拒否する", () => {
    const result = schema.safeParse({
      userId: "123e4567-e89b-12d3-a456-426614174000",
      role: "superadmin",
    });
    expect(result.success).toBe(false);
  });
});
