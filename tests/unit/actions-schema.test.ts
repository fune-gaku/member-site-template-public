import { z } from "astro/zod";
import { describe, it, expect } from "vitest";

import { SIGNIN_GENERIC_ERROR_MESSAGE } from "../../src/lib/auth-errors";

// src/actions/index.ts から schema だけを再定義してテスト
// （実際の actions は Astro コンテキストが必要なため）

describe("auth.signUp schema", () => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
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
});

describe("auth.signIn schema (Issue #8 / A3)", () => {
  // actions/index.ts の signIn input と同じ形
  const schema = z.object({
    email: z.string().email(),
    password: z.string(),
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
    expect(SIGNIN_GENERIC_ERROR_MESSAGE).not.toMatch(/未登録|登録されていません|確認/);
  });
});

describe("auth.resetPassword schema", () => {
  const schema = z.object({ email: z.string().email() });

  it("有効なメールアドレスを受け入れる", () => {
    const result = schema.safeParse({ email: "redacted@example.com" });
    expect(result.success).toBe(true);
  });

  it("メールアドレス以外を拒否する", () => {
    const result = schema.safeParse({ email: "invalid" });
    expect(result.success).toBe(false);
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
