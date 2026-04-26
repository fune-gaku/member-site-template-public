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

  it("does not emit Content-Security-Policy header (CSP is injected via Astro <meta>)", () => {
    // CSP を header と <meta> の両方から出すと両者が独立評価され、
    // ハッシュ無しの header 側で bundle script が拒否される。
    // CSP は astro.config.mjs の security.csp にのみ集約する。
    expect(SECURITY_HEADERS["Content-Security-Policy"]).toBeUndefined();
  });

  it("HSTS has production-grade max-age", () => {
    const hsts = SECURITY_HEADERS["Strict-Transport-Security"]!;
    expect(hsts).toMatch(/max-age=(\d+)/);
    const maxAge = parseInt(hsts.match(/max-age=(\d+)/)![1]!, 10);
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
