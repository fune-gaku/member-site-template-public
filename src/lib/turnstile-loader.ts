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
 *
 * Issue #30: ad blocker / 社内 proxy / CSP / Cloudflare 障害で loader script
 * の取得が失敗した場合、`script.onerror` で捕捉して Promise を reject する。
 * onerror が発火しないケース (ごく稀: CSP が静かに drop / 5xx 直前で hang)
 * の保険として 10 秒の timeout も併用する。reject 時は singleton をリセット
 * するため、ユーザが ad blocker を無効化して再操作すれば次回 call で再試行可能。
 */

declare global {
  interface Window {
    turnstile?: unknown;
    onTurnstileReady?: () => void;
  }
}

let loaderPromise: Promise<void> | null = null;

// 公式: explicit rendering 用 URL は `?render=explicit&onload=...`、
// 属性は `defer` のみ推奨 (`async` は付けない)。
// https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileReady";
const LOADER_SCRIPT_MARKER = "data-turnstile-loader";

/** Loader script 取得の timeout (Issue #30、テストから差し替え可)。 */
export const TURNSTILE_LOADER_TIMEOUT_MS = 10_000;

/**
 * Turnstile loader が読み込み完了 (`window.turnstile` 利用可能) になるまで
 * 待機する Promise を返す。多重 call しても script は 1 回だけ注入される。
 *
 * - すでに loader が読み込み済みなら resolved Promise を即座に返す
 * - まだ読み込み中なら同一の pending Promise を共有
 * - 別経路で `data-turnstile-loader` script が注入済みでも、`window.turnstile`
 *   が定義済なら即 resolve、未定義なら `onTurnstileReady` を hook
 * - 取得失敗 (onerror / timeout) では Promise を reject し singleton をリセット
 *   する (Issue #30)。次回 call で再試行可能。
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

  loaderPromise = new Promise<void>((resolve, reject) => {
    let settled = false;
    // timeoutId を先に declare してから setTimeout で初期化することで、
    // appendChild 中に同期的に onerror が発火した場合でも `clearTimeout(undefined)`
    // が安全に動作するようにする (closure の `finish` から forward-reference する)。
    // eslint-disable-next-line prefer-const -- 初期化前に closure から参照されるため let 必須
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      action();
    };

    const fail = (reason: Error) => {
      finish(() => {
        // 次回 call での再試行を許可 (ユーザが ad blocker を無効化した後等)
        loaderPromise = null;
        // 失敗した script を DOM から除去し、後続 call が `existing` 分岐で
        // 同じ失敗 script に張り付き続けるのを防ぐ。`Auth.astro` 等が <head>
        // に preload した script でも同様 (失敗が確定した以上残す意味はなく、
        // 残すと次回も同じ pending → timeout で詰む)。
        trackedScript?.remove();
        reject(reason);
      });
    };

    // `onTurnstileReady` を 1 度だけ wire (loader script の onload で呼ばれる)。
    // 既に別 widget が wire 済の場合でも、本 module は singleton なので
    // この path に到達するのは初回 call のみ → 上書き安全。
    window.onTurnstileReady = () => finish(resolve);

    let trackedScript: HTMLScriptElement | undefined;

    const existing = document.querySelector<HTMLScriptElement>(
      `script[${LOADER_SCRIPT_MARKER}="true"]`,
    );
    if (existing) {
      // 別 path で既に注入済 (テンプレ外のコードや `Auth.astro` preload が
      // 先に loader を注入した等)。onload が既に発火済の可能性があるので
      // `window.turnstile` の有無で判断する。なければ `onTurnstileReady` の
      // 発火を待ちつつ、`error` event でも fail に分岐させる
      // (Issue #30: 実運用では `Auth.astro` が常に preload するためこの分岐が
      // 主経路。`else` 分岐側だけ onerror を hook しても意味がなかった)。
      if (window.turnstile) {
        finish(resolve);
        return;
      }
      existing.onerror = () =>
        fail(new Error("Cloudflare Turnstile loader script failed to load"));
      trackedScript = existing;
    } else {
      const script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT_SRC;
      script.defer = true;
      script.dataset.turnstileLoader = "true";
      script.onerror = () =>
        fail(new Error("Cloudflare Turnstile loader script failed to load"));
      trackedScript = script;
      document.head.appendChild(script);
    }

    timeoutId = setTimeout(
      () => fail(new Error("Cloudflare Turnstile loader script timed out")),
      TURNSTILE_LOADER_TIMEOUT_MS,
    );
  });

  return loaderPromise;
}

/**
 * テスト用: 内部 singleton state をリセットする。本番コードからは呼ばないこと。
 */
export function __resetTurnstileLoaderForTests(): void {
  loaderPromise = null;
}
