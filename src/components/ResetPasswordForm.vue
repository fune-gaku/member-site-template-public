<script setup lang="ts">
import { actions } from "astro:actions";
import { ref } from "vue";

import { TURNSTILE_RESPONSE_FIELD } from "../lib/turnstile";

import TurnstileWidget from "./TurnstileWidget.vue";

const turnstileSiteKey = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY ?? "";

const email = ref("");
const isLoading = ref(false);
const error = ref("");
const success = ref(false);
const successMessage = ref("");
const turnstileToken = ref("");
const turnstileWidget = ref<InstanceType<typeof TurnstileWidget> | null>(null);

async function handleSubmit() {
  error.value = "";

  if (turnstileSiteKey && !turnstileToken.value) {
    error.value =
      "ボット対策のチェックを完了してください (チェックボックスをタップ)";
    return;
  }

  isLoading.value = true;

  try {
    const formData = new FormData();
    formData.append("email", email.value);
    if (turnstileToken.value) {
      formData.append(TURNSTILE_RESPONSE_FIELD, turnstileToken.value);
    }

    const { data, error: actionError } =
      await actions.auth.resetPassword(formData);

    if (actionError) {
      error.value = actionError.message;
      turnstileWidget.value?.reset();
    } else if (data) {
      // performResetPassword は失敗 (内部 SMTP / レート / 未登録) でも
      // success: true + 統一メッセージを返すため、UI からは登録有無を判別できない。
      success.value = true;
      successMessage.value = data.message;
    }
  } catch (e) {
    console.error("Reset password error:", e);
    error.value = "予期しないエラーが発生しました";
    turnstileWidget.value?.reset();
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div>
    <div
      v-if="success"
      class="rounded-lg border border-green-200 bg-green-50 p-4"
    >
      <p class="text-sm text-green-800">{{ successMessage }}</p>
      <div class="mt-4 text-center">
        <a
          href="/auth/signin"
          class="text-brand-600 hover:text-brand-700 text-sm font-medium"
        >
          サインインに戻る
        </a>
      </div>
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

      <div v-if="turnstileSiteKey" class="flex justify-center">
        <TurnstileWidget
          ref="turnstileWidget"
          :site-key="turnstileSiteKey"
          @update:token="turnstileToken = $event"
        />
      </div>

      <button
        type="submit"
        :disabled="isLoading"
        class="bg-brand-600 hover:bg-brand-700 focus:ring-brand-200 w-full rounded-lg px-4 py-3 font-medium text-white transition focus:ring-4 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {{ isLoading ? "送信中..." : "リセットメールを送信" }}
      </button>

      <div class="text-center text-sm text-gray-600">
        <a
          href="/auth/signin"
          class="text-brand-600 hover:text-brand-700 font-medium"
        >
          サインインに戻る
        </a>
      </div>
    </form>
  </div>
</template>
