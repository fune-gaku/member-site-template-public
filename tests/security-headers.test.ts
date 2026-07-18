import { describe, expect, it } from "vitest";

import {
  SECURITY_HEADERS,
  applySecurityHeaders,
} from "../src/lib/security-headers";

describe("SECURITY_HEADERS", () => {
  it("contains all required directives", () => {
    expect(SECURITY_HEADERS).toMatchObject({
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": expect.stringContaining("strict-origin"),
      "Strict-Transport-Security": expect.stringContaining("max-age"),
      "Permissions-Policy": expect.stringContaining("camera=()"),
      "Cross-Origin-Opener-Policy": "same-origin",
    });
  });

  it("header CSP は frame-ancestors のみ（script-src/style-src は <meta> に集約）", () => {
    // frame-ancestors は <meta> では無視される header 限定ディレクティブなので header で出す。
    // 一方 script-src/style-src/default-src を header に含めると meta 側のハッシュ付き
    // ポリシーと二重評価され bundle script が拒否されるため、header CSP は frame-ancestors
    // だけに限定する。
    const csp = SECURITY_HEADERS["Content-Security-Policy"];
    expect(csp).toBe("frame-ancestors 'none'");
    expect(csp).not.toContain("script-src");
    expect(csp).not.toContain("style-src");
    expect(csp).not.toContain("default-src");
  });

  it("HSTS has production-grade max-age", () => {
    const hsts = SECURITY_HEADERS["Strict-Transport-Security"];
    expect(hsts).toMatch(/max-age=(\d+)/);
    const maxAge = parseInt(/max-age=(\d+)/.exec(hsts)![1], 10);
    expect(maxAge).toBeGreaterThanOrEqual(31536000); // 1 年以上
  });
});

describe("applySecurityHeaders", () => {
  it("sets all SECURITY_HEADERS on a Response without those headers", () => {
    const response = new Response("ok");
    applySecurityHeaders(response);

    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(response.headers.get(name)).toBe(value);
    }
  });

  it("does not overwrite headers already set on the response", () => {
    const response = new Response("ok", {
      headers: {
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
    applySecurityHeaders(response);

    // 既存値を尊重
    expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    // 他のヘッダは追加されている
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
