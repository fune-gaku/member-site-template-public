import { describe, it, expect, vi, beforeEach } from "vitest";

import { createClient } from "../../src/lib/supabase";

// import.meta.env をモック
vi.stubEnv("PUBLIC_SUPABASE_URL", "https://test.supabase.co");
vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");

describe("createClient", () => {
  let mockCookies: {
    set: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockCookies = {
      set: vi.fn(),
      get: vi.fn(),
    };
  });

  it("request と cookies を受け取って client を返す", () => {
    const request = new Request("https://example.com", {
      headers: { Cookie: "" },
    });
    const client = createClient({
      request,
      // biome-ignore lint/suspicious/noExplicitAny: テスト用
      cookies: mockCookies as any,
    });
    expect(client).toBeDefined();
    expect(client.auth).toBeDefined();
  });

  it("Cookie ヘッダーが空でもエラーにならない", () => {
    const request = new Request("https://example.com");
    expect(() =>
      createClient({
        request,
        // biome-ignore lint/suspicious/noExplicitAny: テスト用
        cookies: mockCookies as any,
      }),
    ).not.toThrow();
  });
});
