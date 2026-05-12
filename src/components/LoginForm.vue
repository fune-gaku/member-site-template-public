<script setup lang="ts">
import { actions } from "astro:actions";
import { ref } from "vue";

import { logger } from "../lib/logger";

// `next` は signin.astro 側で safeNextPath() による検証済みの値を受け取る。
// クライアント側で window.location.search から直接読むと Open Redirect
// （CWE-601）を踏むため、必ず props 経由で受け取ること。
const props = withDefaults(defineProps<{ next?: string }>(), {
  next: "/member/dashboard",
});

const email = ref("");
const password = ref("");
const isLoading = ref(false);
const error = ref("");

async function handleSubmit() {
  error.value = "";
  isLoading.value = true;

  try {
    const formData = new FormData();
    formData.append("email", email.value);
    formData.append("password", password.value);

    const { error: actionError } = await actions.auth.signIn(formData);

    if (actionError) {
      error.value = actionError.message;
    } else {
      // ログイン成功時、サーバ検証済みの next へリダイレクト
      window.location.href = props.next;
    }
  } catch (e) {
    logger.error("Login error", e);
    error.value = "予期しないエラーが発生しました";
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div>
    <form class="space-y-6" @submit.prevent="handleSubmit">
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
          autocomplete="email"
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
          autocomplete="current-password"
          class="focus:ring-brand-500 focus:border-brand-500 w-full rounded-lg border border-gray-300 px-4 py-2 transition outline-none focus:ring-2"
          placeholder="パスワードを入力"
          :disabled="isLoading"
        />
      </div>

      <div class="flex justify-end text-sm">
        <a
          href="/auth/reset-password"
          class="text-brand-600 hover:text-brand-700 font-medium"
        >
          パスワードを忘れた
        </a>
      </div>

      <button
        type="submit"
        :disabled="isLoading"
        class="bg-brand-600 hover:bg-brand-700 focus:ring-brand-200 w-full rounded-lg px-4 py-3 font-medium text-white transition focus:ring-4 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {{ isLoading ? "サインイン中..." : "サインイン" }}
      </button>

      <div class="text-center text-sm text-gray-600">
        アカウントをお持ちでない方は
        <a
          href="/auth/signup"
          class="text-brand-600 hover:text-brand-700 font-medium"
        >
          新規登録
        </a>
      </div>
    </form>
  </div>
</template>
