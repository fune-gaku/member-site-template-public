import { describe, expect, it, vi } from "vitest";

import { getAuthUser } from "../../src/lib/auth-claims";

// SupabaseClient の auth.getClaims() だけを satisfies する最小モック
function clientWithClaims(impl: () => Promise<unknown>) {
  return {
    auth: { getClaims: vi.fn(impl) },
    // biome-ignore lint/suspicious/noExplicitAny: 部分モック
  } as any;
}

describe("getAuthUser (= auth.getClaims wrapper)", () => {
  it("有効な claims から id と email を取り出す", async () => {
    const supabase = clientWithClaims(async () => ({
      data: {
        claims: {
          sub: "user-123",
          email: "test@example.com",
          aud: "authenticated",
        },
      },
      error: null,
    }));

    const user = await getAuthUser(supabase);
    expect(user).toEqual({ id: "user-123", email: "test@example.com" });
  });

  it("email クレームが無いケースでも id だけ返す", async () => {
    const supabase = clientWithClaims(async () => ({
      data: { claims: { sub: "user-456" } },
      error: null,
    }));

    const user = await getAuthUser(supabase);
    expect(user).toEqual({ id: "user-456", email: undefined });
  });

  it("error が返ったら null", async () => {
    const supabase = clientWithClaims(async () => ({
      data: null,
      error: { message: "JWT expired" },
    }));

    expect(await getAuthUser(supabase)).toBeNull();
  });

  it("data.claims が無ければ null", async () => {
    const supabase = clientWithClaims(async () => ({
      data: {},
      error: null,
    }));

    expect(await getAuthUser(supabase)).toBeNull();
  });

  it("claims.sub が文字列でなければ null (壊れた JWT への防御)", async () => {
    const supabase = clientWithClaims(async () => ({
      data: { claims: { sub: 12345 } },
      error: null,
    }));

    expect(await getAuthUser(supabase)).toBeNull();
  });

  it("claims.sub が空文字列なら null", async () => {
    const supabase = clientWithClaims(async () => ({
      data: { claims: { sub: "" } },
      error: null,
    }));

    expect(await getAuthUser(supabase)).toBeNull();
  });

  it("claims.email が文字列でなければ undefined にフォールバック", async () => {
    const supabase = clientWithClaims(async () => ({
      data: { claims: { sub: "user-789", email: 42 } },
      error: null,
    }));

    const user = await getAuthUser(supabase);
    expect(user).toEqual({ id: "user-789", email: undefined });
  });
});
