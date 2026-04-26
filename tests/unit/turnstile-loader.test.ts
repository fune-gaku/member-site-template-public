// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetTurnstileLoaderForTests,
  ensureTurnstileLoaded,
  TURNSTILE_LOADER_TIMEOUT_MS,
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

/**
 * happy-dom は `disableJavaScriptFileLoading: true` の既定動作として、
 * script element の appendChild 時点で同期的に `error` event を dispatch する。
 * Issue #30 で `script.onerror` を hook したことにより、この自動 error が
 * 我々の handler に届いて script が即時除去され、テストが壊れるため、
 * **document の capture phase で `error` event を吸収** する。capture 段階
 * リスナーは target phase より先に走るので `stopImmediatePropagation()` で
 * `script.onerror` 呼出を抑止できる。
 *
 * 個別テストで意図的に error を発火したい場合は `script.onerror?.(new Event("error"))`
 * を直接呼ぶことで dispatchEvent path をバイパスできる。
 */
let autoErrorSuppressor: ((e: Event) => void) | undefined;

function suppressAutoOnerror() {
  autoErrorSuppressor = function (e: Event) {
    if (
      e.target instanceof HTMLScriptElement &&
      e.target.dataset.turnstileLoader === "true"
    ) {
      e.stopImmediatePropagation();
    }
  };
  document.addEventListener("error", autoErrorSuppressor, true);
  window.addEventListener("error", autoErrorSuppressor, true);
}

function restoreAutoOnerror() {
  if (autoErrorSuppressor) {
    document.removeEventListener("error", autoErrorSuppressor, true);
    window.removeEventListener("error", autoErrorSuppressor, true);
    autoErrorSuppressor = undefined;
  }
}

describe("ensureTurnstileLoaded (PR #29 multi-widget safety)", () => {
  beforeEach(() => {
    __resetTurnstileLoaderForTests();
    document.head.innerHTML = "";
    // window.turnstile / onTurnstileReady を毎回まっさら化
    delete (window as unknown as { turnstile?: unknown }).turnstile;
    delete (window as unknown as { onTurnstileReady?: () => void })
      .onTurnstileReady;
    suppressAutoOnerror();
  });

  afterEach(() => {
    restoreAutoOnerror();
    vi.useRealTimers();
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

describe("ensureTurnstileLoaded loader-error handling (Issue #30)", () => {
  beforeEach(() => {
    __resetTurnstileLoaderForTests();
    document.head.innerHTML = "";
    delete (window as unknown as { turnstile?: unknown }).turnstile;
    delete (window as unknown as { onTurnstileReady?: () => void })
      .onTurnstileReady;
    suppressAutoOnerror();
  });

  afterEach(() => {
    restoreAutoOnerror();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("script.onerror 発火で Promise が reject され、失敗 script は DOM から除去される", async () => {
    const p = ensureTurnstileLoaded();
    const script = document.head.querySelector<HTMLScriptElement>(
      'script[data-turnstile-loader="true"]',
    );
    expect(script).not.toBeNull();

    // ad blocker / CSP / network 失敗を simulate
    script!.onerror?.(new Event("error"));

    await expect(p).rejects.toThrow(/failed to load/i);

    // 失敗 script は次回 retry を阻害しないよう DOM から除去される
    expect(
      document.head.querySelectorAll('script[data-turnstile-loader="true"]')
        .length,
    ).toBe(0);
  });

  it("reject 後の再 call は singleton リセットにより新しい注入を試みる", async () => {
    const p1 = ensureTurnstileLoaded();
    const script1 = document.head.querySelector<HTMLScriptElement>(
      'script[data-turnstile-loader="true"]',
    );
    script1!.onerror?.(new Event("error"));
    await expect(p1).rejects.toThrow();

    // 2 回目の call で新しい script tag が注入されること (singleton 解除)
    const p2 = ensureTurnstileLoaded();
    expect(p2).not.toBe(p1);
    const script2 = document.head.querySelector<HTMLScriptElement>(
      'script[data-turnstile-loader="true"]',
    );
    expect(script2).not.toBeNull();
    expect(script2).not.toBe(script1);

    // クリーンアップ: ぶら下がる Promise を意図的に rejection 化して
    // unhandled rejection 警告を抑止
    script2!.onerror?.(new Event("error"));
    await expect(p2).rejects.toThrow();
  });

  it("timeout (TURNSTILE_LOADER_TIMEOUT_MS) 経過で reject される (onerror 不発の保険)", async () => {
    vi.useFakeTimers();
    const p = ensureTurnstileLoaded();

    // timeout 直前は pending
    vi.advanceTimersByTime(TURNSTILE_LOADER_TIMEOUT_MS - 1);
    // microtask を flush しても resolve / reject していない
    let settled = false;
    void p.then(
      () => (settled = true),
      () => (settled = true),
    );
    await Promise.resolve();
    expect(settled).toBe(false);

    // timeout を超えると reject
    vi.advanceTimersByTime(2);
    await expect(p).rejects.toThrow(/timed out/i);
  });

  it("onload (onTurnstileReady) が timeout 前に発火すれば timeout は無効化される", async () => {
    vi.useFakeTimers();
    const p = ensureTurnstileLoaded();

    // onload を simulate
    (window as unknown as { turnstile: unknown }).turnstile = {};
    window.onTurnstileReady?.();

    await expect(p).resolves.toBeUndefined();

    // timeout 経過後も追加 reject が起きないこと (settled flag が機能している)
    vi.advanceTimersByTime(TURNSTILE_LOADER_TIMEOUT_MS + 1000);
    // 既に resolve 済の Promise は変化しないため、再度 await しても OK
    await expect(p).resolves.toBeUndefined();
  });
});
