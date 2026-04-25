import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase をモック
vi.mock("../../src/lib/supabase", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(),
    },
  })),
}));

import { createClient } from "../../src/lib/supabase";
import { onRequest } from "../../src/middleware";

/**
 * createClient のモックを構築するヘルパー。
 * - user: auth.getUser() が返すユーザー（null 可）
 * - role: profiles テーブルの role 列の値（指定時のみ from をモック）
 */
function buildSupabaseMock(options: {
  user: { id: string; email: string } | null;
  role?: "member" | "admin";
  profileError?: boolean;
}) {
  const single = vi
    .fn()
    .mockResolvedValue(
      options.profileError
        ? { data: null, error: new Error("profile error") }
        : { data: { role: options.role ?? "member" }, error: null },
    );
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: options.user } }),
    },
    from,
    // 参照しやすいように内部 mock も露出
    __mocks: { from, select, eq, single },
  };
}

describe("middleware: /member 配下の認可", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未認証で /member/dashboard にアクセスすると /auth/signin にリダイレクト", async () => {
    vi.mocked(createClient).mockReturnValue(
      buildSupabaseMock({ user: null }) as unknown as ReturnType<
        typeof createClient
      >,
    );

    const context = {
      url: new URL("https://example.com/member/dashboard"),
      request: new Request("https://example.com/member/dashboard"),
      cookies: {},
      locals: { user: null, profile: null },
      redirect: vi.fn(
        (path: string) =>
          new Response(null, {
            status: 302,
            headers: { Location: path },
          }),
      ),
      // biome-ignore lint/suspicious/noExplicitAny: モック簡略化のため
    } as any;
    const next = vi.fn(async () => new Response("ok"));

    await onRequest(context, next);

    expect(context.redirect).toHaveBeenCalledWith(
      expect.stringContaining("/auth/signin"),
    );
    expect(context.redirect).toHaveBeenCalledWith(
      expect.stringContaining("next=%2Fmember%2Fdashboard"),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("認証済みユーザーは /member 配下にアクセスできる", async () => {
    const mockUser = { id: "user-123", email: "test@example.com" };

    vi.mocked(createClient).mockReturnValue(
      buildSupabaseMock({
        user: mockUser,
        role: "member",
      }) as unknown as ReturnType<typeof createClient>,
    );

    const context = {
      url: new URL("https://example.com/member/dashboard"),
      request: new Request("https://example.com/member/dashboard"),
      cookies: {},
      locals: { user: null, profile: null },
      redirect: vi.fn(),
      // biome-ignore lint/suspicious/noExplicitAny: モック簡略化のため
    } as any;
    const next = vi.fn(async () => new Response("ok"));

    await onRequest(context, next);

    expect(context.redirect).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    expect(context.locals.user).toEqual(mockUser);
    expect(context.locals.profile).toEqual({ role: "member" });
  });

  it("/member 以外のパスでは未認証でもリダイレクトしない（ただし getUser は全ページで呼ばれる）", async () => {
    // 新しい middleware は全ページで getUser() を呼ぶ
    // （トークンの自動リフレッシュのため）
    vi.mocked(createClient).mockReturnValue(
      buildSupabaseMock({ user: null }) as unknown as ReturnType<
        typeof createClient
      >,
    );

    const context = {
      url: new URL("https://example.com/auth/signin"),
      request: new Request("https://example.com/auth/signin"),
      cookies: {},
      locals: { user: null, profile: null },
      redirect: vi.fn(),
      // biome-ignore lint/suspicious/noExplicitAny: モック簡略化のため
    } as any;
    const next = vi.fn(async () => new Response("ok"));

    await onRequest(context, next);

    // 全ページで getUser（トークンリフレッシュ）が走る
    expect(createClient).toHaveBeenCalled();
    // しかし /member 以外はリダイレクトされない
    expect(context.redirect).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});

describe("middleware: /admin 配下の認可", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未認証で /admin/users にアクセスすると /auth/signin にリダイレクト", async () => {
    vi.mocked(createClient).mockReturnValue(
      buildSupabaseMock({ user: null }) as unknown as ReturnType<
        typeof createClient
      >,
    );

    const context = {
      url: new URL("https://example.com/admin/users"),
      request: new Request("https://example.com/admin/users"),
      cookies: {},
      locals: { user: null, profile: null },
      redirect: vi.fn(
        (path: string) =>
          new Response(null, {
            status: 302,
            headers: { Location: path },
          }),
      ),
      // biome-ignore lint/suspicious/noExplicitAny: モック簡略化のため
    } as any;
    const next = vi.fn(async () => new Response("ok"));

    await onRequest(context, next);

    expect(context.redirect).toHaveBeenCalledWith(
      expect.stringContaining("/auth/signin"),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("認証済み・member ロールは /admin を踏むと /member/dashboard にリダイレクト", async () => {
    const mockUser = { id: "user-abc", email: "member@example.com" };

    vi.mocked(createClient).mockReturnValue(
      buildSupabaseMock({
        user: mockUser,
        role: "member",
      }) as unknown as ReturnType<typeof createClient>,
    );

    const context = {
      url: new URL("https://example.com/admin/users"),
      request: new Request("https://example.com/admin/users"),
      cookies: {},
      locals: { user: null, profile: null },
      redirect: vi.fn(
        (path: string) =>
          new Response(null, {
            status: 302,
            headers: { Location: path },
          }),
      ),
      // biome-ignore lint/suspicious/noExplicitAny: モック簡略化のため
    } as any;
    const next = vi.fn(async () => new Response("ok"));

    await onRequest(context, next);

    expect(context.redirect).toHaveBeenCalledWith("/member/dashboard");
    expect(next).not.toHaveBeenCalled();
  });

  it("admin ロールは /admin 配下にアクセスできる", async () => {
    const mockUser = { id: "admin-1", email: "admin@example.com" };

    vi.mocked(createClient).mockReturnValue(
      buildSupabaseMock({
        user: mockUser,
        role: "admin",
      }) as unknown as ReturnType<typeof createClient>,
    );

    const context = {
      url: new URL("https://example.com/admin/users"),
      request: new Request("https://example.com/admin/users"),
      cookies: {},
      locals: { user: null, profile: null },
      redirect: vi.fn(),
      // biome-ignore lint/suspicious/noExplicitAny: モック簡略化のため
    } as any;
    const next = vi.fn(async () => new Response("ok"));

    await onRequest(context, next);

    expect(context.redirect).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    expect(context.locals.profile).toEqual({ role: "admin" });
  });
});

describe("middleware: /_actions/* ボディサイズガード (Issue #9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * /_actions/* に POST する場合の context をビルドする。
   * 100KB 一般 / 6MB アップロードの両方を扱えるよう Content-Length を任意で受け取る。
   */
  function buildActionContext(opts: {
    pathname: string;
    contentLength: string | null;
  }) {
    const url = new URL(`https://example.com${opts.pathname}`);
    const headers = new Headers({ "content-type": "application/json" });
    if (opts.contentLength !== null) {
      headers.set("content-length", opts.contentLength);
    }
    const request = new Request(url, {
      method: "POST",
      headers,
      // body は省略（middleware は読まない、Content-Length だけ見る）
    });
    return {
      url,
      request,
      cookies: {},
      locals: { user: null, profile: null },
      redirect: vi.fn(),
      // biome-ignore lint/suspicious/noExplicitAny: モック簡略化のため
    } as any;
  }

  it("一般 Action に 200KB を送ると 413 / Supabase は呼ばれない", async () => {
    const context = buildActionContext({
      pathname: "/_actions/posts.create",
      contentLength: String(200 * 1024),
    });
    const next = vi.fn(async () => new Response("ok"));

    const response = (await onRequest(context, next)) as Response;

    expect(response.status).toBe(413);
    expect(createClient).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("アップロード Action に 5.5MB を送ると middleware は通る (next が呼ばれる)", async () => {
    vi.mocked(createClient).mockReturnValue(
      buildSupabaseMock({ user: null }) as unknown as ReturnType<
        typeof createClient
      >,
    );
    const context = buildActionContext({
      pathname: "/_actions/storage.uploadAvatar",
      contentLength: String(5.5 * 1024 * 1024),
    });
    const next = vi.fn(async () => new Response("ok"));

    await onRequest(context, next);

    expect(next).toHaveBeenCalled();
  });

  it("アップロード Action に 7MB を送ると 413 / Supabase は呼ばれない", async () => {
    const context = buildActionContext({
      pathname: "/_actions/storage.uploadAvatar",
      contentLength: String(7 * 1024 * 1024),
    });
    const next = vi.fn(async () => new Response("ok"));

    const response = (await onRequest(context, next)) as Response;

    expect(response.status).toBe(413);
    expect(createClient).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("Action パスに Content-Length 欠損で POST すると 411", async () => {
    const context = buildActionContext({
      pathname: "/_actions/posts.create",
      contentLength: null,
    });
    const next = vi.fn(async () => new Response("ok"));

    const response = (await onRequest(context, next)) as Response;

    expect(response.status).toBe(411);
    expect(createClient).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("非 Action パスは Content-Length 欠損でも従来どおり通る (リグレッション無し)", async () => {
    vi.mocked(createClient).mockReturnValue(
      buildSupabaseMock({ user: null }) as unknown as ReturnType<
        typeof createClient
      >,
    );
    // Content-Length 無しで /auth/signin (非 Action) を叩く
    const context = {
      url: new URL("https://example.com/auth/signin"),
      request: new Request("https://example.com/auth/signin"),
      cookies: {},
      locals: { user: null, profile: null },
      redirect: vi.fn(),
      // biome-ignore lint/suspicious/noExplicitAny: モック簡略化のため
    } as any;
    const next = vi.fn(async () => new Response("ok"));

    await onRequest(context, next);

    // Action ではないので 411 にはならず、通常通り middleware を通過する
    expect(next).toHaveBeenCalled();
  });

  it("413 / 411 レスポンスにもセキュリティヘッダが付与される", async () => {
    const context = buildActionContext({
      pathname: "/_actions/posts.create",
      contentLength: String(1_000_000),
    });
    const next = vi.fn(async () => new Response("ok"));

    const response = (await onRequest(context, next)) as Response;

    expect(response.status).toBe(413);
    // 代表的なヘッダをサンプリング検査（applySecurityHeaders の網羅は別テスト）
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Content-Security-Policy")).not.toBeNull();
  });
});
