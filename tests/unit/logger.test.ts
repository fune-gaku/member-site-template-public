import { afterEach, describe, expect, it, vi } from "vitest";

import {
  logger,
  maskEmail,
  maskJwt,
  sanitizeError,
  sanitizeFields,
  sanitizeString,
} from "../../src/lib/logger";

/**
 * Issue #7: ログに乗る PII（メールアドレス / JWT）が確実にマスクされ、
 * 一方で運用診断に必要な情報（UUID / Supabase エラーの構造）が残ることを検証する。
 *
 * 受け入れ基準:
 *   - email: `u***@example.com` 形式（local-part 1 文字目だけ残す）
 *   - JWT: 完全削除（`<redacted-jwt>`）
 *   - logger.error は内部で console.error を 1 回だけ呼ぶ
 */

describe("maskEmail", () => {
  it("シンプルな email を `u***@example.com` 形式にマスクする", () => {
    expect(maskEmail("user@example.com")).toBe("u***@example.com");
  });

  it("local-part に記号があっても 1 文字目を保持する", () => {
    expect(maskEmail("a.bcd+test@example.co.jp")).toBe("a***@example.co.jp");
  });

  it("大文字を含む email でも 1 文字目を保持してマスクする", () => {
    expect(maskEmail("Alice@Example.COM")).toBe("A***@Example.COM");
  });

  it("文中に複数の email が含まれていても全てマスクする", () => {
    const input = "from a@x.com to b@y.com";
    expect(maskEmail(input)).toBe("from a***@x.com to b***@y.com");
  });

  it("email を含まない文字列は不変", () => {
    expect(maskEmail("user_id 11111111-2222-3333-4444-555555555555")).toBe(
      "user_id 11111111-2222-3333-4444-555555555555",
    );
  });

  it("ドメイン部分を完全保持する（運用診断用）", () => {
    // ドメインは情報漏洩リスクが低く、テナント絞り込み等の運用診断に有用なため残す
    const masked = maskEmail("alice@tenant-acme.example.com");
    expect(masked).toContain("@tenant-acme.example.com");
    expect(masked.startsWith("a***")).toBe(true);
  });
});

describe("maskJwt", () => {
  // テスト用の JWT 形（header.payload.signature の 3 セグメント）。
  // 値は本物ではなく `_TEST_FIXTURE_` 接頭辞で gitleaks の誤検知も避ける。
  const FAKE_JWT_HEADER = "eyJ_TEST_FIXTURE_HEADER";
  const FAKE_JWT_PAYLOAD = "eyJ_TEST_FIXTURE_PAYLOAD";
  const FAKE_JWT_SIG = "_TEST_FIXTURE_SIGNATURE_abc-DEF_123";

  it("典型的な JWT を `<redacted-jwt>` に置換する", () => {
    const jwt = `${FAKE_JWT_HEADER}.${FAKE_JWT_PAYLOAD}.${FAKE_JWT_SIG}`;
    expect(maskJwt(jwt)).toBe("<redacted-jwt>");
  });

  it("文中に JWT が混じっていても置換する", () => {
    const input = `Authorization: Bearer ${FAKE_JWT_HEADER}.${FAKE_JWT_PAYLOAD}.${FAKE_JWT_SIG} (expired)`;
    expect(maskJwt(input)).toBe(
      "Authorization: Bearer <redacted-jwt> (expired)",
    );
  });

  it("eyJ で始まるが JWT 形式でない文字列は不変（誤検知防止）", () => {
    expect(maskJwt("eyJ alone is not a JWT")).toBe("eyJ alone is not a JWT");
  });
});

describe("sanitizeString", () => {
  it("email と JWT を両方含む文字列を一括でサニタイズする", () => {
    const input =
      "user@example.com tried token eyJ_TEST_FIXTURE_H.eyJ_TEST_FIXTURE_P.test_sig";
    const out = sanitizeString(input);
    expect(out).toBe("u***@example.com tried token <redacted-jwt>");
  });
});

describe("sanitizeError", () => {
  it("Error 派生は { name, message, stack } に縮約してマスクする", () => {
    const err = new TypeError("Cannot login user@example.com");
    const result = sanitizeError(err) as {
      name: string;
      message: string;
      stack?: string;
    };
    expect(result.name).toBe("TypeError");
    expect(result.message).toBe("Cannot login u***@example.com");
    if (typeof result.stack === "string") {
      expect(result.stack).not.toContain("user@example.com");
    }
  });

  it("Supabase 風 plain object（{ message, status, name }）の message のみマスクする", () => {
    const supabaseLike = {
      message: "User user@example.com not found",
      status: 404,
      name: "AuthApiError",
    };
    const result = sanitizeError(supabaseLike) as typeof supabaseLike;
    expect(result.message).toBe("User u***@example.com not found");
    // 他フィールドは保持（運用診断のため）
    expect(result.status).toBe(404);
    expect(result.name).toBe("AuthApiError");
  });

  it("文字列はそのままマスクして返す", () => {
    expect(sanitizeError("contact admin@x.com")).toBe("contact a***@x.com");
  });

  it("null / undefined は不変", () => {
    expect(sanitizeError(null)).toBeNull();
    expect(sanitizeError(undefined)).toBeUndefined();
  });

  it("UUID は内部識別子として保持する（user_id 等の運用診断のため）", () => {
    const err = {
      message: "User 11111111-2222-3333-4444-555555555555 not found",
    };
    const result = sanitizeError(err) as { message: string };
    expect(result.message).toBe(
      "User 11111111-2222-3333-4444-555555555555 not found",
    );
  });

  it("非 Error / 非 message オブジェクトは JSON 化してマスクする", () => {
    const odd = { detail: "user@example.com tried something" };
    const result = sanitizeError(odd);
    expect(typeof result).toBe("string");
    expect(result).toContain("u***@example.com");
    expect(result).not.toContain("user@example.com");
  });
});

describe("sanitizeFields", () => {
  it("文字列フィールドはマスク、プリミティブはそのまま、オブジェクトは sanitizeError で処理", () => {
    const out = sanitizeFields({
      email: "user@example.com",
      retries: 3,
      flagged: true,
      err: { message: "connection refused for admin@x.com" },
    });
    expect(out.email).toBe("u***@example.com");
    expect(out.retries).toBe(3);
    expect(out.flagged).toBe(true);
    expect(out.err).toMatchObject({
      message: "connection refused for a***@x.com",
    });
  });
});

describe("logger.error", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    errorSpy?.mockRestore();
  });

  it("`<context>:` + sanitized error の 2 引数で console.error を呼ぶ", () => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // suppress
    });
    logger.error("auth.signIn", { message: "invalid for user@example.com" });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith("auth.signIn:", {
      message: "invalid for u***@example.com",
    });
  });

  it("fields 付きのときは 3 引数で渡す（fields もマスク）", () => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // suppress
    });
    logger.error(
      "admin.listUsers",
      { message: "db error" },
      { email: "alice@example.com" },
    );
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      "admin.listUsers:",
      { message: "db error" },
      { email: "a***@example.com" },
    );
  });

  it("PII を含まない error は元の構造を保ったまま渡る（既存テストの spy パターンと互換）", () => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // suppress
    });
    const err = { message: "Invalid login credentials" };
    logger.error("auth.changePassword reauth failed", err);
    expect(errorSpy).toHaveBeenCalledWith(
      "auth.changePassword reauth failed:",
      {
        message: "Invalid login credentials",
      },
    );
  });

  it("Error インスタンスの message に email が混じっていてもマスクされる", () => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // suppress
    });
    const err = new Error("User user@example.com is locked");
    logger.error("auth.signIn", err);
    const call = errorSpy.mock.calls[0];
    const sanitized = call[1] as { message: string };
    expect(sanitized.message).toBe("User u***@example.com is locked");
  });
});
