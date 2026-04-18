<script setup lang="ts">
import { z } from "astro/zod";
import { actions } from "astro:actions";
import { ref, watch } from "vue";

interface Post {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
}

const props = withDefaults(
  defineProps<{
    /** 編集対象の投稿。未指定（null）なら新規作成モード。 */
    editingPost?: Post | null;
  }>(),
  { editingPost: null },
);

const emit = defineEmits<{
  /** 作成 / 更新成功時に親に通知 */
  saved: [post: Post];
  /** 編集キャンセル時に親に通知 */
  cancel: [];
}>();

// フロントエンド側でも Zod バリデーション（バックエンドと同スキーマ）
const postSchema = z.object({
  title: z.string().trim().min(1, "タイトルは必須です").max(200),
  body: z.string().max(10_000).optional().default(""),
});

const title = ref("");
const body = ref("");
const isSubmitting = ref(false);
const error = ref("");

// 編集対象が変わったらフォームに反映
watch(
  () => props.editingPost,
  (p) => {
    title.value = p?.title ?? "";
    body.value = p?.body ?? "";
    error.value = "";
  },
  { immediate: true },
);

function resetForm() {
  title.value = "";
  body.value = "";
  error.value = "";
}

async function handleSubmit() {
  error.value = "";

  const parsed = postSchema.safeParse({
    title: title.value,
    body: body.value,
  });
  if (!parsed.success) {
    error.value =
      parsed.error.issues[0]?.message ?? "入力内容を確認してください";
    return;
  }

  isSubmitting.value = true;
  try {
    if (props.editingPost) {
      const { data, error: actionError } = await actions.posts.update({
        id: props.editingPost.id,
        title: parsed.data.title,
        body: parsed.data.body,
      });
      if (actionError) {
        error.value = actionError.message;
        return;
      }
      if (data) {
        emit("saved", data.post);
        resetForm();
      }
    } else {
      const { data, error: actionError } = await actions.posts.create({
        title: parsed.data.title,
        body: parsed.data.body,
      });
      if (actionError) {
        error.value = actionError.message;
        return;
      }
      if (data) {
        emit("saved", data.post);
        resetForm();
      }
    }
  } catch (e) {
    console.error("PostForm submit error:", e);
    error.value = "予期しないエラーが発生しました";
  } finally {
    isSubmitting.value = false;
  }
}

function handleCancel() {
  resetForm();
  emit("cancel");
}
</script>

<template>
  <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
    <h3 class="mb-4 text-lg font-semibold text-gray-900">
      {{ editingPost ? "投稿を編集" : "新しい投稿" }}
    </h3>

    <div
      v-if="error"
      class="mb-4 rounded-lg border border-red-200 bg-red-50 p-3"
    >
      <p class="text-sm text-red-800">{{ error }}</p>
    </div>

    <form class="space-y-4" @submit.prevent="handleSubmit">
      <div>
        <label
          for="post-title"
          class="mb-1 block text-sm font-medium text-gray-700"
        >
          タイトル <span class="text-red-600">*</span>
        </label>
        <input
          id="post-title"
          v-model="title"
          type="text"
          maxlength="200"
          required
          :disabled="isSubmitting"
          class="focus:ring-brand-500 focus:border-brand-500 w-full rounded-lg border border-gray-300 px-4 py-2 transition outline-none focus:ring-2 disabled:bg-gray-50"
          placeholder="例: 今日のメモ"
        />
      </div>

      <div>
        <label
          for="post-body"
          class="mb-1 block text-sm font-medium text-gray-700"
        >
          本文
        </label>
        <textarea
          id="post-body"
          v-model="body"
          rows="4"
          maxlength="10000"
          :disabled="isSubmitting"
          class="focus:ring-brand-500 focus:border-brand-500 w-full rounded-lg border border-gray-300 px-4 py-2 transition outline-none focus:ring-2 disabled:bg-gray-50"
          placeholder="本文（任意）"
        ></textarea>
      </div>

      <div class="flex items-center gap-3">
        <button
          type="submit"
          :disabled="isSubmitting"
          class="bg-brand-600 hover:bg-brand-700 rounded-lg px-5 py-2 font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {{
            isSubmitting
              ? editingPost
                ? "更新中..."
                : "作成中..."
              : editingPost
                ? "更新する"
                : "作成する"
          }}
        </button>
        <button
          v-if="editingPost"
          type="button"
          :disabled="isSubmitting"
          class="rounded-lg border border-gray-300 bg-white px-5 py-2 font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          @click="handleCancel"
        >
          キャンセル
        </button>
      </div>
    </form>
  </div>
</template>
