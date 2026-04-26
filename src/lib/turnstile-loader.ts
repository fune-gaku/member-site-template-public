/**
 * Turnstile loader script (`turnstile/v0/api.js`) の注入と読み込み完了の
 * Promise 化。複数 `TurnstileWidget.vue` インスタンスが同一ページに同時 mount
 * された場合でも安全に共有できる singleton。
 *
 * 共通化前 (SignupForm 単体時代) は各 widget が `window.onTurnstileReady`
 * を直接上書きしていたが、複数インスタンスで mount された場合は **最後に
 * 上書きしたものだけが onload で呼ばれ、他は永遠に待機する** という silent
 * fail が起きるため (PR #29 codex review で発見)、本モジュールで loader を
 * 一元管理する。
 *
 * SSR / Node 環境では `window` が無いため no-op (Promise.resolve())。
 */

declare global {
  interface Window {
    turnstile?: unknown;
    onTurnstileReady?: () => void;
  }
}

let loaderPromise: Promise<void> | null = null;

const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileReady";
const LOADER_SCRIPT_MARKER = "data-turnstile-loader";

/**
 * Turnstile loader が読み込み完了 (`window.turnstile` 利用可能) になるまで
 * 待機する Promise を返す。多重 call しても script は 1 回だけ注入される。
 *
 * - すでに loader が読み込み済みなら resolved Promise を即座に返す
 * - まだ読み込み中なら同一の pending Promise を共有
 * - 別経路で `data-turnstile-loader` script が注入済みでも、`window.turnstile`
 *   が定義済なら即 resolve、未定義なら `onTurnstileReady` を hook
 */
export function ensureTurnstileLoaded(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  if (window.turnstile) {
    return Promise.resolve();
  }
  if (loaderPromise) {
    return loaderPromise;
  }

  loaderPromise = new Promise<void>((resolve) => {
    // `onTurnstileReady` を 1 度だけ wire (loader script の onload で呼ばれる)。
    // 既に別 widget が wire 済の場合でも、本 module は singleton なので
    // この path に到達するのは初回 call のみ → 上書き安全。
    window.onTurnstileReady = () => resolve();

    const existing = document.querySelector<HTMLScriptElement>(
      `script[${LOADER_SCRIPT_MARKER}="true"]`,
    );
    if (existing) {
      // 別 path で既に注入済 (テンプレ外のコードが先に loader を注入した等)。
      // onload が既に発火済の可能性があるので、`window.turnstile` の有無で
      // 判断する。なければ `onTurnstileReady` の発火を待つ (上で wire 済)。
      if (window.turnstile) {
        resolve();
      }
      return;
    }

    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.dataset.turnstileLoader = "true";
    document.head.appendChild(script);
  });

  return loaderPromise;
}

/**
 * テスト用: 内部 singleton state をリセットする。本番コードからは呼ばないこと。
 */
export function __resetTurnstileLoaderForTests(): void {
  loaderPromise = null;
}
