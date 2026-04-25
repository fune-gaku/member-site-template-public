import { describe, expect, it } from "vitest";

import {
  PASSWORD_POLICY_HINT,
  passwordSchema,
  validatePasswordStrength,
} from "../src/lib/password-schema";
import { isHibpCheckEnabled } from "../src/lib/pwned-password";

describe("passwordSchema", () => {
  it.each([
    "Short1", // 6 文字 - 短すぎ
    "alllowercase1", // 大文字なし
    "ALLUPPERCASE1", // 小文字なし
    "NoDigitsAtAll", // 数字なし
  ])("rejects weak password: %s", (pw) => {
    expect(passwordSchema.safeParse(pw).success).toBe(false);
  });

  it.each(["StrongPass1", "Secure123Abc", "MyP@ssw0rd2026"])(
    "accepts strong password: %s",
    (pw) => {
      expect(passwordSchema.safeParse(pw).success).toBe(true);
    },
  );

  it("rejects over-72-char passwords (bcrypt limit)", () => {
    const pw = "A1" + "a".repeat(71); // 73 chars total
    expect(pw.length).toBe(73);
    expect(passwordSchema.safeParse(pw).success).toBe(false);
  });

  it("accepts exactly 8 chars with all requirements", () => {
    const pw = "Aa123456"; // 小文字・大文字・数字 各 1 以上、8 文字ちょうど
    expect(passwordSchema.safeParse(pw).success).toBe(true);
  });

  it("accepts exactly 72 chars", () => {
    const pw = "Aa" + "1".repeat(70); // 72 chars, 要件満たす
    expect(pw.length).toBe(72);
    expect(passwordSchema.safeParse(pw).success).toBe(true);
  });

  it("returns actionable error message on weak input", () => {
    const result = passwordSchema.safeParse("short");
    expect(result.success).toBe(false);
    if (!result.success) {
      // 具体的な日本語メッセージが含まれていること（ユーザーに何を直すべきか伝わる）
      const messages = result.error.issues.map((i) => i.message).join("\n");
      expect(messages).toMatch(/8文字以上/);
    }
  });
});

describe("validatePasswordStrength (client-side helper)", () => {
  it("returns null for strong password", () => {
    expect(validatePasswordStrength("StrongPass1")).toBeNull();
  });

  it("returns length error for short password", () => {
    expect(validatePasswordStrength("Abc1")).toMatch(/8文字以上/);
  });

  it("returns length error for over-72 chars", () => {
    expect(validatePasswordStrength("A1" + "a".repeat(71))).toMatch(
      /72文字以下/,
    );
  });

  it("returns complexity error when missing uppercase", () => {
    expect(validatePasswordStrength("lowercase123")).toMatch(
      /英大文字・英小文字・数字/,
    );
  });

  it("returns complexity error when missing digit", () => {
    expect(validatePasswordStrength("NoDigitsHere")).toMatch(
      /英大文字・英小文字・数字/,
    );
  });
});

describe("PASSWORD_POLICY_HINT", () => {
  it("mentions 8 characters", () => {
    expect(PASSWORD_POLICY_HINT).toMatch(/8/);
  });

  it("does not mention the old 6-character policy", () => {
    expect(PASSWORD_POLICY_HINT).not.toMatch(/6文字/);
  });
});

describe("isHibpCheckEnabled", () => {
  it("returns false by default (undefined)", () => {
    expect(isHibpCheckEnabled(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isHibpCheckEnabled("")).toBe(false);
  });

  it("returns false for 'false'", () => {
    expect(isHibpCheckEnabled("false")).toBe(false);
  });

  it("returns true for 'true' (lowercase)", () => {
    expect(isHibpCheckEnabled("true")).toBe(true);
  });

  it("returns true for 'TRUE' (case-insensitive)", () => {
    expect(isHibpCheckEnabled("TRUE")).toBe(true);
  });

  it("returns true for boolean true", () => {
    expect(isHibpCheckEnabled(true)).toBe(true);
  });

  it("returns false for boolean false", () => {
    expect(isHibpCheckEnabled(false)).toBe(false);
  });

  it("returns false for arbitrary other strings", () => {
    expect(isHibpCheckEnabled("yes")).toBe(false);
    expect(isHibpCheckEnabled("1")).toBe(false);
    expect(isHibpCheckEnabled("on")).toBe(false);
  });
});
