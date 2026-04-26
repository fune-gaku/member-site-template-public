// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetTurnstileLoaderForTests,
  ensureTurnstileLoaded,
} from "../../src/lib/turnstile-loader";

/**
 * PR #29 codex review で指摘された「同一ページに複数 TurnstileWidget が
 * mount された場合に最後の 1 件しか render されない」問題のリグレッションテスト。
 *
 * loader が Promise singleton として動作し、複数インスタンスから同時に呼ばれても
 *   - script tag は 1 回だけ注入される
 *   - すべての caller が同じ Promise を共有する
 *   - script onload (= window.onTurnstileReady 発火) で全 caller が resolve する
 * を検証する。
 */

describe("ensureTurnstileLoaded (PR #29 multi-widget safety)", () => {
  beforeEach(() => {
    __resetTurnstileLoaderForTests();
    document.head.innerHTML = "";
    // window.turnstile / onTurnstileReady を毎回まっさら化
    delete (window as unknown as { turnstile?: unknown }).turnstile;
    delete (window as unknown as { onTurnstileReady?: () => void })
      .onTurnstileReady;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("`window.turnstile` が既に存在する場合は即 resolve し、script を注入しない", async () => {
    (window as unknown as { turnstile?: unknown }).turnstile = {};
    await expect(ensureTurnstileLoaded()).resolves.toBeUndefined();
    const scripts = document.head.querySelectorAll(
      'script[data-turnstile-loader="true"]',
    );
    expect(scripts.length).toBe(0);
  });

  it("初回 call で script tag を 1 回だけ注入する", async () => {
    void ensureTurnstileLoaded();
    const scripts = document.head.querySelectorAll(
      'script[data-turnstile-loader="true"]',
    );
    expect(scripts.length).toBe(1);
    expect(scripts[0].getAttribute("src")).toContain(
      "https://challenges.cloudflare.com/turnstile/v0/api.js",
    );
  });

  it("注入される script は Turnstile 公式の explicit rendering URL と defer-only 属性を持つ (regression: render=explicit / onload= / async 非付与)", async () => {
    // Cloudflare 公式 (https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/) は
    // explicit rendering で `?render=explicit&onload=...` URL と `defer` のみを推奨する。
    // 旧 URL (`?onload=...` 単独) や `async` 再混入を回帰検出する。
    void ensureTurnstileLoaded();
    const script = document.head.querySelector<HTMLScriptElement>(
      'script[data-turnstile-loader="true"]',
    );
    expect(script).not.toBeNull();
    const src = script!.getAttribute("src") ?? "";
    expect(src).toContain("render=explicit");
    expect(src).toContain("onload=onTurnstileReady");
    expect(script!.hasAttribute("async")).toBe(false);
    expect(script!.hasAttribute("defer")).toBe(true);
  });

  it("複数 call しても script tag は 1 件しか注入されない (singleton)", async () => {
    const p1 = ensureTurnstileLoaded();
    const p2 = ensureTurnstileLoaded();
    const p3 = ensureTurnstileLoaded();
    expect(p1).toBe(p2);
    expect(p2).toBe(p3);
    const scripts = document.head.querySelectorAll(
      'script[data-turnstile-loader="true"]',
    );
    expect(scripts.length).toBe(1);
  });

  it("script onload (window.onTurnstileReady 発火) ですべての caller が resolve する", async () => {
    const p1 = ensureTurnstileLoaded();
    const p2 = ensureTurnstileLoaded();
    const p3 = ensureTurnstileLoaded();

    // loader script の onload を simulate
    (window as unknown as { turnstile: unknown }).turnstile = {};
    window.onTurnstileReady?.();

    await expect(Promise.all([p1, p2, p3])).resolves.toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("既に script が注入済 (別経路) で window.turnstile も定義済なら即 resolve", async () => {
    // 別経路で script を先に注入したシナリオ
    const script = document.createElement("script");
    script.dataset.turnstileLoader = "true";
    document.head.appendChild(script);
    (window as unknown as { turnstile: unknown }).turnstile = {};

    await expect(ensureTurnstileLoaded()).resolves.toBeUndefined();
    // 既存 script はそのまま、新規追加もしない
    const scripts = document.head.querySelectorAll(
      'script[data-turnstile-loader="true"]',
    );
    expect(scripts.length).toBe(1);
  });

  it("既に script が注入済だが window.turnstile が未定義なら onTurnstileReady を待つ", async () => {
    const script = document.createElement("script");
    script.dataset.turnstileLoader = "true";
    document.head.appendChild(script);
    // window.turnstile はまだ未定義

    const p = ensureTurnstileLoaded();
    // 重複 script は注入しない
    expect(
      document.head.querySelectorAll('script[data-turnstile-loader="true"]')
        .length,
    ).toBe(1);
    // onload 発火を simulate
    (window as unknown as { turnstile: unknown }).turnstile = {};
    window.onTurnstileReady?.();
    await expect(p).resolves.toBeUndefined();
  });
});
