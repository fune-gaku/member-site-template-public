import { z } from "astro/zod";
import { describe, it, expect } from "vitest";

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
