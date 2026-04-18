<script setup lang="ts">
import { ref } from "vue";
import { actions } from "astro:actions";

const email = ref("");
const password = ref("");
const isLoading = ref(false);
const error = ref("");

async function handleSubmit() {
  error.value = "";
  isLoading.value = true;

  try {
    const { data, error: actionError } = await actions.auth.signIn({
      email: email.value,
      password: password.value,
    });

    if (actionError) {
      error.value = actionError.message;
    } else {
      // ログイン成功時、ダッシュボードにリダイレクト
      const urlParams = new URLSearchParams(window.location.search);
      const next = urlParams.get("next") || "/member/dashboard";
      window.location.href = next;
    }
  } catch (e) {
    error.value = "予期しないエラーが発生しました";
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div>
    <form @submit.prevent="handleSubmit" class="space-y-6">
      <div v-if="error" class="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p class="text-sm text-red-800">{{ error }}</p>
      </div>

      <div>
        <label for="email" class="block text-sm font-medium text-gray-700 mb-2">
          メールアドレス
        </label>
        <input
          id="email"
          v-model="email"
          type="email"
          required
          class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition"
          placeholder="you@example.com"
          :disabled="isLoading"
        />
      </div>

      <div>
        <label for="password" class="block text-sm font-medium text-gray-700 mb-2">
          パスワード
        </label>
        <input
          id="password"
          v-model="password"
          type="password"
          required
          class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition"
          placeholder="パスワードを入力"
          :disabled="isLoading"
        />
      </div>

      <div class="flex items-center justify-between text-sm">
        <label class="flex items-center">
          <input type="checkbox" class="mr-2 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
          <span class="text-gray-700">ログイン状態を保持</span>
        </label>
        <a href="/auth/reset-password" class="text-brand-600 hover:text-brand-700 font-medium">
          パスワードを忘れた
        </a>
      </div>

      <button
        type="submit"
        :disabled="isLoading"
        class="w-full px-4 py-3 text-white bg-brand-600 rounded-lg font-medium hover:bg-brand-700 focus:ring-4 focus:ring-brand-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {{ isLoading ? "サインイン中..." : "サインイン" }}
      </button>

      <div class="text-center text-sm text-gray-600">
        アカウントをお持ちでない方は
        <a href="/auth/signup" class="text-brand-600 hover:text-brand-700 font-medium">
          新規登録
        </a>
      </div>
    </form>
  </div>
</template>
