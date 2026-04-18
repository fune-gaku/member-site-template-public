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

describe("middleware: /member 配下の認可", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未認証で /member/dashboard にアクセスすると /auth/signin にリダイレクト", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
      // biome-ignore lint/suspicious/noExplicitAny: モック簡略化のため
    } as any);

    const context = {
      url: new URL("https://example.com/member/dashboard"),
      request: new Request("https://example.com/member/dashboard"),
      cookies: {},
      locals: { user: null },
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
    const mockUser = {
      id: "user-123",
      email: "test@example.com",
    };

    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }),
      },
      // biome-ignore lint/suspicious/noExplicitAny: モック簡略化のため
    } as any);

    const context = {
      url: new URL("https://example.com/member/dashboard"),
      request: new Request("https://example.com/member/dashboard"),
      cookies: {},
      locals: { user: null },
      redirect: vi.fn(),
      // biome-ignore lint/suspicious/noExplicitAny: モック簡略化のため
    } as any;
    const next = vi.fn(async () => new Response("ok"));

    await onRequest(context, next);

    expect(context.redirect).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    expect(context.locals.user).toEqual(mockUser);
  });

  it("/member 以外のパスでは未認証でもリダイレクトしない（ただし getUser は全ページで呼ばれる）", async () => {
    // 新しい middleware は全ページで getUser() を呼ぶ
    // （トークンの自動リフレッシュのため）
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
      // biome-ignore lint/suspicious/noExplicitAny: モック簡略化のため
    } as any);

    const context = {
      url: new URL("https://example.com/auth/signin"),
      request: new Request("https://example.com/auth/signin"),
      cookies: {},
      locals: { user: null },
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
