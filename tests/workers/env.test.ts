import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";

describe("Cloudflare Workers environment", () => {
  it("SUPABASE_SERVICE_ROLE_KEY が env に含まれる", () => {
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeDefined();
    expect(typeof env.SUPABASE_SERVICE_ROLE_KEY).toBe("string");
  });

  it("テスト用のダミーキーが設定されている", () => {
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe(
      "dummy-service-role-key-for-testing",
    );
  });
});
