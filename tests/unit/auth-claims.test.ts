import { describe, expect, it, vi } from "vitest";

import { getAuthUser, getAuthUserFresh } from "../../src/lib/auth-claims";

// SupabaseClient の auth.getClaims() だけを satisfies する最小モック
function clientWithClaims(impl: () => Promise<unknown>) {
  return {
    auth: { getClaims: vi.fn(impl) },
    // biome-ignore lint/suspicious/noExplicitAny: 部分モック
  } as any;
}

// SupabaseClient の auth.getUser() だけを satisfies する最小モック
function clientWithGetUser(impl: () => Promise<unknown>) {
  return {
    auth: { getUser: vi.fn(impl) },
    // biome-ignore lint/suspicious/noExplicitAny: 部分モック
  } as any;
}

describe("getAuthUser (= auth.getClaims wrapper)", () => {
  it("有効な claims から id と email を取り出す", async () => {
    const supabase = clientWithClaims(async () => ({
      data: {
        claims: {
          sub: "user-123",
          email: "michio@example.com",
          aud: "authenticated",
        },
      },
      error: null,
    }));

    const user = await getAuthUser(supabase);
    expect(user).toEqual({ id: "user-123", email: "michio@example.com" });
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

describe("getAuthUserFresh (= auth.getUser wrapper, 強制サーバ検証)", () => {
  it("有効な user を { id, email } に詰めて返す", async () => {
    const supabase = clientWithGetUser(async () => ({
      data: {
        user: {
          id: "admin-1",
          email: "admin@example.com",
          app_metadata: {},
          user_metadata: {},
          aud: "authenticated",
        },
      },
      error: null,
    }));

    const user = await getAuthUserFresh(supabase);
    expect(user).toEqual({ id: "admin-1", email: "admin@example.com" });
  });

  it("error が返ったら null (失効済みセッション・アカウント停止)", async () => {
    const supabase = clientWithGetUser(async () => ({
      data: { user: null },
      error: { message: "JWT revoked" },
    }));

    expect(await getAuthUserFresh(supabase)).toBeNull();
  });

  it("user が無ければ null", async () => {
    const supabase = clientWithGetUser(async () => ({
      data: { user: null },
      error: null,
    }));

    expect(await getAuthUserFresh(supabase)).toBeNull();
  });

  it("email が文字列でなければ undefined にフォールバック (壊れた User 防御)", async () => {
    const supabase = clientWithGetUser(async () => ({
      data: { user: { id: "u1", email: 12345 } },
      error: null,
    }));

    const user = await getAuthUserFresh(supabase);
    expect(user).toEqual({ id: "u1", email: undefined });
  });

  it("getAuthUser とは違って auth.getUser を呼ぶ (= サーバ検証経路)", async () => {
    const getUserSpy = vi.fn(async () => ({
      data: { user: { id: "u2", email: "u2@example.com" } },
      error: null,
    }));
    const supabase = { auth: { getUser: getUserSpy } } as unknown as Parameters<
      typeof getAuthUserFresh
    >[0];

    await getAuthUserFresh(supabase);
    expect(getUserSpy).toHaveBeenCalledTimes(1);
  });
});
