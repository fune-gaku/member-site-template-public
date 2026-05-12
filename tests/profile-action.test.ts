import { z } from "astro/zod";
import { describe, expect, it } from "vitest";

// Issue #007: src/actions/index.ts の profile.update 入力スキーマと同定義。
// 実際の Action は Astro コンテキストが必要なため、スキーマのみを再定義して単体検証する。
// （`tests/unit/actions-schema.test.ts` と同じ方針）
const displayNameSchema = z
  .string()
  .trim()
  .max(100, "表示名は100文字以下で入力してください");

describe("profile.update input schema", () => {
  it("accepts empty string (clear display name)", () => {
    expect(displayNameSchema.safeParse("").success).toBe(true);
  });

  it("accepts typical Japanese display name", () => {
    expect(displayNameSchema.safeParse("山田 太郎").success).toBe(true);
  });

  it("accepts 100-char string", () => {
    expect(displayNameSchema.safeParse("a".repeat(100)).success).toBe(true);
  });

  it("rejects 101-char string", () => {
    expect(displayNameSchema.safeParse("a".repeat(101)).success).toBe(false);
  });

  it("rejects 1MB string (storage bloat guard)", () => {
    expect(displayNameSchema.safeParse("a".repeat(1024 * 1024)).success).toBe(
      false,
    );
  });

  it("trims whitespace", () => {
    const r = displayNameSchema.safeParse("  hello  ");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("hello");
  });

  it("treats length limit as post-trim (101 spaces + 99-char content is fine)", () => {
    // 先頭・末尾の空白は trim で除去されるため、実質 99 文字なら通る
    const input = `   ${"a".repeat(99)}   `;
    const r = displayNameSchema.safeParse(input);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.length).toBe(99);
  });

  it("rejects non-string input", () => {
    expect(displayNameSchema.safeParse(12345).success).toBe(false);
    expect(displayNameSchema.safeParse(null).success).toBe(false);
    expect(displayNameSchema.safeParse(undefined).success).toBe(false);
  });

  it("returns actionable Japanese error message on too-long input", () => {
    const result = displayNameSchema.safeParse("a".repeat(500));
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join("\n");
      expect(messages).toMatch(/100文字以下/);
    }
  });
});
