<script setup lang="ts">
import { actions } from "astro:actions";
import { ref } from "vue";

import { logger } from "../lib/logger";
import {
  PASSWORD_POLICY_HINT,
  validatePasswordStrength,
} from "../lib/password-schema";

const currentPassword = ref("");
const newPassword = ref("");
const confirmNewPassword = ref("");
const isLoading = ref(false);
const error = ref("");
const success = ref("");

function reset() {
  currentPassword.value = "";
  newPassword.value = "";
  confirmNewPassword.value = "";
}

async function handleSubmit() {
  error.value = "";
  success.value = "";

  if (!currentPassword.value) {
    error.value = "現在のパスワードを入力してください";
    return;
  }

  if (newPassword.value !== confirmNewPassword.value) {
    error.value = "新しいパスワードが一致しません";
    return;
  }

  if (currentPassword.value === newPassword.value) {
    error.value =
      "新しいパスワードは現在のパスワードと異なるものを設定してください";
    return;
  }

  const policyError = validatePasswordStrength(newPassword.value);
  if (policyError) {
    error.value = policyError;
    return;
  }

  isLoading.value = true;
  try {
    const formData = new FormData();
    formData.append("currentPassword", currentPassword.value);
    formData.append("newPassword", newPassword.value);
    const { error: actionError } = await actions.auth.changePassword(formData);

    if (actionError) {
      error.value = actionError.message;
    } else {
      success.value = "パスワードを更新しました";
      reset();
    }
  } catch (e) {
    logger.error("Change password error", e);
    error.value = "予期しないエラーが発生しました";
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
    <h3 class="mb-4 text-lg font-semibold text-gray-900">パスワード変更</h3>
    <p class="mb-4 text-sm text-gray-600">
      セキュリティ上、現在のパスワードでの本人確認が必要です。
    </p>

    <div
      v-if="error"
      class="mb-4 rounded-lg border border-red-200 bg-red-50 p-4"
    >
      <p class="text-sm text-red-800">{{ error }}</p>
    </div>
    <div
      v-if="success"
      class="mb-4 rounded-lg border border-green-200 bg-green-50 p-4"
    >
      <p class="text-sm text-green-800">{{ success }}</p>
    </div>

    <form class="space-y-4" @submit.prevent="handleSubmit">
      <div>
        <label
          for="current-password"
          class="mb-2 block text-sm font-medium text-gray-700"
        >
          現在のパスワード
        </label>
        <input
          id="current-password"
          v-model="currentPassword"
          type="password"
          required
          maxlength="72"
          autocomplete="current-password"
          class="focus:ring-brand-500 focus:border-brand-500 w-full rounded-lg border border-gray-300 px-4 py-2 transition outline-none focus:ring-2"
          :disabled="isLoading"
        />
      </div>

      <div>
        <label
          for="new-password"
          class="mb-2 block text-sm font-medium text-gray-700"
        >
          新しいパスワード
        </label>
        <input
          id="new-password"
          v-model="newPassword"
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
          for="confirm-new-password"
          class="mb-2 block text-sm font-medium text-gray-700"
        >
          新しいパスワード（確認）
        </label>
        <input
          id="confirm-new-password"
          v-model="confirmNewPassword"
          type="password"
          required
          maxlength="72"
          autocomplete="new-password"
          class="focus:ring-brand-500 focus:border-brand-500 w-full rounded-lg border border-gray-300 px-4 py-2 transition outline-none focus:ring-2"
          placeholder="新しいパスワードを再入力"
          :disabled="isLoading"
        />
      </div>

      <button
        type="submit"
        :disabled="isLoading"
        class="bg-brand-600 hover:bg-brand-700 focus:ring-brand-200 rounded-lg px-6 py-2 font-medium text-white transition focus:ring-4 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {{ isLoading ? "更新中..." : "パスワードを更新" }}
      </button>
    </form>
  </div>
</template>
