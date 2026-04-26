<script setup lang="ts">
import { actions } from "astro:actions";
import { onMounted, onBeforeUnmount, ref } from "vue";

import {
  PASSWORD_POLICY_HINT,
  validatePasswordStrength,
} from "../lib/password-schema";

const TURNSTILE_RESPONSE_FIELD = "cf-turnstile-response";

// 公開 site key。未設定なら Turnstile を表示しない (opt-in)。
const turnstileSiteKey = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY ?? "";

const email = ref("");
const password = ref("");
const confirmPassword = ref("");
const isLoading = ref(false);
const error = ref("");
const success = ref(false);
const turnstileToken = ref("");
const turnstileWidgetEl = ref<HTMLDivElement | null>(null);
let turnstileWidgetId: string | undefined;

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement | string,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
        },
      ) => string;
      remove: (id: string) => void;
      reset: (id?: string) => void;
    };
    onTurnstileReady?: () => void;
  }
}

function renderTurnstile() {
  if (!turnstileSiteKey || !turnstileWidgetEl.value || !window.turnstile) {
    return;
  }
  turnstileWidgetId = window.turnstile.render(turnstileWidgetEl.value, {
    sitekey: turnstileSiteKey,
    callback: (token: string) => {
      turnstileToken.value = token;
    },
    "expired-callback": () => {
      turnstileToken.value = "";
    },
    "error-callback": () => {
      turnstileToken.value = "";
    },
  });
}

onMounted(() => {
  if (!turnstileSiteKey) return;

  // すでに script があるなら直接 render、無ければ動的注入。
  if (window.turnstile) {
    renderTurnstile();
    return;
  }
  const existing = document.querySelector<HTMLScriptElement>(
    'script[data-turnstile-loader="true"]',
  );
  if (existing) {
    window.onTurnstileReady = renderTurnstile;
    return;
  }
  window.onTurnstileReady = renderTurnstile;
  const s = document.createElement("script");
  s.src =
    "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileReady";
  s.async = true;
  s.defer = true;
  s.dataset.turnstileLoader = "true";
  document.head.appendChild(s);
});

onBeforeUnmount(() => {
  if (turnstileWidgetId && window.turnstile) {
    window.turnstile.remove(turnstileWidgetId);
  }
});

async function handleSubmit() {
  error.value = "";

  if (password.value !== confirmPassword.value) {
    error.value = "パスワードが一致しません";
    return;
  }

  const policyError = validatePasswordStrength(password.value);
  if (policyError) {
    error.value = policyError;
    return;
  }

  if (turnstileSiteKey && !turnstileToken.value) {
    error.value =
      "ボット対策のチェックを完了してください (チェックボックスをタップ)";
    return;
  }

  isLoading.value = true;

  try {
    // FormDataを作成
    const formData = new FormData();
    formData.append("email", email.value);
    formData.append("password", password.value);
    if (turnstileToken.value) {
      formData.append(TURNSTILE_RESPONSE_FIELD, turnstileToken.value);
    }

    const { data: _data, error: actionError } =
      await actions.auth.signUp(formData);

    if (actionError) {
      error.value = actionError.message;
      // 失敗時は token を捨てて widget を再要求 (token は 1 回限り)
      if (turnstileWidgetId && window.turnstile) {
        window.turnstile.reset(turnstileWidgetId);
        turnstileToken.value = "";
      }
    } else {
      success.value = true;
    }
  } catch (e) {
    console.error("Signup error:", e);
    error.value = "予期しないエラーが発生しました";
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div>
    <div
      v-if="success"
      class="mb-6 rounded-lg border border-green-200 bg-green-50 p-4"
    >
      <p class="text-sm text-green-800">
        確認メールを送信しました。メール内のリンクをクリックして登録を完了してください。
      </p>
    </div>

    <form v-else class="space-y-6" @submit.prevent="handleSubmit">
      <div v-if="error" class="rounded-lg border border-red-200 bg-red-50 p-4">
        <p class="text-sm text-red-800">{{ error }}</p>
      </div>

      <div>
        <label for="email" class="mb-2 block text-sm font-medium text-gray-700">
          メールアドレス
        </label>
        <input
          id="email"
          v-model="email"
          type="email"
          required
          class="focus:ring-brand-500 focus:border-brand-500 w-full rounded-lg border border-gray-300 px-4 py-2 transition outline-none focus:ring-2"
          placeholder="you@example.com"
          :disabled="isLoading"
        />
      </div>

      <div>
        <label
          for="password"
          class="mb-2 block text-sm font-medium text-gray-700"
        >
          パスワード
        </label>
        <input
          id="password"
          v-model="password"
          type="password"
          required
          minlength="8"
          maxlength="72"
          autocomplete="new-password"
          class="focus:ring-brand-500 focus:border-brand-500 w-full rounded-lg border border-gray-300 px-4 py-2 transition outline-none focus:ring-2"
          :placeholder="PASSWORD_POLICY_HINT"
          :disabled="isLoading"
        />
        <p class="mt-1 text-xs text-gray-500">
          {{ PASSWORD_POLICY_HINT }}
        </p>
      </div>

      <div>
        <label
          for="confirm-password"
          class="mb-2 block text-sm font-medium text-gray-700"
        >
          パスワード（確認）
        </label>
        <input
          id="confirm-password"
          v-model="confirmPassword"
          type="password"
          required
          class="focus:ring-brand-500 focus:border-brand-500 w-full rounded-lg border border-gray-300 px-4 py-2 transition outline-none focus:ring-2"
          placeholder="パスワードを再入力"
          :disabled="isLoading"
        />
      </div>

      <div v-if="turnstileSiteKey" class="flex justify-center">
        <div ref="turnstileWidgetEl" />
      </div>

      <button
        type="submit"
        :disabled="isLoading"
        class="bg-brand-600 hover:bg-brand-700 focus:ring-brand-200 w-full rounded-lg px-4 py-3 font-medium text-white transition focus:ring-4 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {{ isLoading ? "登録中..." : "アカウント作成" }}
      </button>

      <div class="text-center text-sm text-gray-600">
        すでにアカウントをお持ちの方は
        <a
          href="/auth/signin"
          class="text-brand-600 hover:text-brand-700 font-medium"
        >
          サインイン
        </a>
      </div>
    </form>
  </div>
</template>
