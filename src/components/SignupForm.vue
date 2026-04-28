<script setup lang="ts">
import { actions } from "astro:actions";
import { ref } from "vue";

import {
  PASSWORD_POLICY_HINT,
  validatePasswordStrength,
} from "../lib/password-schema";

const email = ref("");
const password = ref("");
const confirmPassword = ref("");
const isLoading = ref(false);
const error = ref("");
const success = ref(false);
const successMessage = ref("");

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

  isLoading.value = true;

  try {
    const formData = new FormData();
    formData.append("email", email.value);
    formData.append("password", password.value);

    const { data, error: actionError } = await actions.auth.signUp(formData);

    if (actionError) {
      error.value = actionError.message;
    } else if (data) {
      // performSignUp は既登録メールでも success: true + 統一メッセージを返すため、
      // UI からは登録有無を判別できない (Issue #14)。
      success.value = true;
      successMessage.value = data.message;
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
      <p class="text-sm text-green-800">{{ successMessage }}</p>
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
          autocomplete="new-password"
          class="focus:ring-brand-500 focus:border-brand-500 w-full rounded-lg border border-gray-300 px-4 py-2 transition outline-none focus:ring-2"
          placeholder="パスワードを再入力"
          :disabled="isLoading"
        />
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
