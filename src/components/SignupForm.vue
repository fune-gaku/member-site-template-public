<script setup lang="ts">
import { ref } from "vue";
import { actions } from "astro:actions";

const email = ref("");
const password = ref("");
const confirmPassword = ref("");
const isLoading = ref(false);
const error = ref("");
const success = ref(false);

async function handleSubmit() {
  error.value = "";

  if (password.value !== confirmPassword.value) {
    error.value = "パスワードが一致しません";
    return;
  }

  if (password.value.length < 6) {
    error.value = "パスワードは6文字以上で入力してください";
    return;
  }

  isLoading.value = true;

  try {
    const { data, error: actionError } = await actions.auth.signUp({
      email: email.value,
      password: password.value,
    });

    if (actionError) {
      error.value = actionError.message;
    } else {
      success.value = true;
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
    <div v-if="success" class="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
      <p class="text-sm text-green-800">
        確認メールを送信しました。メール内のリンクをクリックして登録を完了してください。
      </p>
    </div>

    <form v-else @submit.prevent="handleSubmit" class="space-y-6">
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
          placeholder="6文字以上"
          :disabled="isLoading"
        />
      </div>

      <div>
        <label for="confirm-password" class="block text-sm font-medium text-gray-700 mb-2">
          パスワード（確認）
        </label>
        <input
          id="confirm-password"
          v-model="confirmPassword"
          type="password"
          required
          class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition"
          placeholder="パスワードを再入力"
          :disabled="isLoading"
        />
      </div>

      <button
        type="submit"
        :disabled="isLoading"
        class="w-full px-4 py-3 text-white bg-brand-600 rounded-lg font-medium hover:bg-brand-700 focus:ring-4 focus:ring-brand-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {{ isLoading ? "登録中..." : "アカウント作成" }}
      </button>

      <div class="text-center text-sm text-gray-600">
        すでにアカウントをお持ちの方は
        <a href="/auth/signin" class="text-brand-600 hover:text-brand-700 font-medium">
          サインイン
        </a>
      </div>
    </form>
  </div>
</template>
