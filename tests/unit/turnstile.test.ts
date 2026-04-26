import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TURNSTILE_RESPONSE_FIELD,
  isTurnstileEnabled,
  verifyTurnstileToken,
} from "../../src/lib/turnstile";

describe("isTurnstileEnabled", () => {
  it("両方の env が設定されているときだけ有効", () => {
    expect(isTurnstileEnabled("site", "secret")).toBe(true);
  });

  it("片方欠落 / undefined / 空文字列はすべて無効", () => {
    expect(isTurnstileEnabled(undefined, "secret")).toBe(false);
    expect(isTurnstileEnabled("site", undefined)).toBe(false);
    expect(isTurnstileEnabled(undefined, undefined)).toBe(false);
    expect(isTurnstileEnabled("", "secret")).toBe(false);
    expect(isTurnstileEnabled("site", "")).toBe(false);
  });
});

describe("verifyTurnstileToken (fail-closed)", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  // siteverify がエラーログを吐いてもテスト出力を汚さない
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    fetchSpy.mockReset();
    errorSpy.mockClear();
  });

  afterEach(() => {
    fetchSpy.mockReset();
  });

  it("空 / undefined token は fetch せずに false", async () => {
    expect(await verifyTurnstileToken(undefined, "secret")).toBe(false);
    expect(await verifyTurnstileToken("", "secret")).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("siteverify が success:true を返したときだけ true", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    expect(await verifyTurnstileToken("token", "secret")).toBe(true);
  });

  it("success:false は false (fail-closed)", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }),
        { status: 200 },
      ),
    );
    expect(await verifyTurnstileToken("token", "secret")).toBe(false);
  });

  it("HTTP エラーステータスは false", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("oops", { status: 500 }));
    expect(await verifyTurnstileToken("token", "secret")).toBe(false);
  });

  it("ネットワーク失敗は throw せず false", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("ECONNRESET"));
    expect(await verifyTurnstileToken("token", "secret")).toBe(false);
  });

  it("壊れた JSON でも throw せず false", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("<html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );
    expect(await verifyTurnstileToken("token", "secret")).toBe(false);
  });

  it("POST + URLSearchParams で secret/response/remoteip を送る", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    await verifyTurnstileToken("the-token", "the-secret", "203.0.113.7");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    );
    expect(init?.method).toBe("POST");
    const body = init?.body as URLSearchParams;
    expect(body.get("secret")).toBe("the-secret");
    expect(body.get("response")).toBe("the-token");
    expect(body.get("remoteip")).toBe("203.0.113.7");
  });

  it("remoteip 省略時は body に含めない", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    await verifyTurnstileToken("t", "s");

    const body = fetchSpy.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.has("remoteip")).toBe(false);
  });
});

describe("TURNSTILE_RESPONSE_FIELD", () => {
  it("Turnstile 規約の hidden field 名と一致する", () => {
    expect(TURNSTILE_RESPONSE_FIELD).toBe("cf-turnstile-response");
  });
});
