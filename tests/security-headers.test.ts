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
      "Content-Security-Policy": expect.stringContaining(
        "frame-ancestors 'none'",
      ),
    });
  });

  it("CSP allows Supabase endpoints", () => {
    const csp = SECURITY_HEADERS["Content-Security-Policy"]!;
    expect(csp).toContain("https://*.supabase.co");
    expect(csp).toContain("wss://*.supabase.co");
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
