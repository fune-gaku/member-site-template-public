<script setup lang="ts">
import { z } from "astro/zod";
import { actions } from "astro:actions";
import { ref } from "vue";

import { logger } from "../lib/logger";

const emit = defineEmits<{
  invited: [payload: { email: string; userId: string }];
}>();

const inviteSchema = z.object({
  email: z.string().email("正しいメールアドレスを入力してください"),
});

const email = ref("");
const isSubmitting = ref(false);
const error = ref("");
const success = ref("");

async function handleSubmit() {
  error.value = "";
  success.value = "";

  const parsed = inviteSchema.safeParse({ email: email.value.trim() });
  if (!parsed.success) {
    error.value =
      parsed.error.issues[0]?.message ?? "入力内容を確認してください";
    return;
  }

  isSubmitting.value = true;
  try {
    const formData = new FormData();
    formData.append("email", parsed.data.email);
    const { data, error: actionError } =
      await actions.admin.inviteUser(formData);
    if (actionError) {
      error.value = actionError.message;
      return;
    }
    if (data) {
      success.value = `${parsed.data.email} に招待メールを送信しました`;
      emit("invited", { email: parsed.data.email, userId: data.userId });
      email.value = "";
    }
  } catch (e) {
    logger.error("InviteUserForm error", e);
    error.value = "予期しないエラーが発生しました";
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
    <h3 class="mb-2 text-lg font-semibold text-gray-900">
      新しいユーザーを招待
    </h3>
    <p class="mb-4 text-sm text-gray-600">
      入力したメールアドレスに招待メールが送信されます。
    </p>

    <div
      v-if="error"
      class="mb-4 rounded-lg border border-red-200 bg-red-50 p-3"
    >
      <p class="text-sm text-red-800">{{ error }}</p>
    </div>
    <div
      v-if="success"
      class="mb-4 rounded-lg border border-green-200 bg-green-50 p-3"
    >
      <p class="text-sm text-green-800">{{ success }}</p>
    </div>

    <form
      class="flex flex-col gap-3 sm:flex-row"
      @submit.prevent="handleSubmit"
    >
      <input
        v-model="email"
        type="email"
        required
        autocomplete="email"
        :disabled="isSubmitting"
        class="focus:ring-brand-500 focus:border-brand-500 flex-1 rounded-lg border border-gray-300 px-4 py-2 transition outline-none focus:ring-2 disabled:bg-gray-50"
        placeholder="user@example.com"
      />
      <button
        type="submit"
        :disabled="isSubmitting"
        class="bg-brand-600 hover:bg-brand-700 rounded-lg px-5 py-2 font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50"
      >
        {{ isSubmitting ? "送信中..." : "招待メールを送信" }}
      </button>
    </form>
  </div>
</template>
