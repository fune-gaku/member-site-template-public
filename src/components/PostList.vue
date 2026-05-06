<script setup lang="ts">
import { actions } from "astro:actions";
import { ref } from "vue";

import { logger } from "../lib/logger";

import PostForm from "./PostForm.vue";

interface Post {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
}

const props = withDefaults(
  defineProps<{
    /** SSR で取得した初期データ */
    initialPosts?: Post[];
  }>(),
  { initialPosts: () => [] },
);

const posts = ref<Post[]>([...props.initialPosts]);
const editingPost = ref<Post | null>(null);
const error = ref("");
const pendingDeleteId = ref<string | null>(null);

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function handleSaved(saved: Post) {
  const idx = posts.value.findIndex((p) => p.id === saved.id);
  if (idx >= 0) {
    posts.value.splice(idx, 1, saved);
  } else {
    // 新規作成: 先頭に追加（created_at 降順を維持）
    posts.value.unshift(saved);
  }
  editingPost.value = null;
}

function handleEdit(post: Post) {
  editingPost.value = post;
  // 編集フォームにスクロール
  if (typeof window !== "undefined") {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function handleCancelEdit() {
  editingPost.value = null;
}

async function handleDelete(post: Post) {
  if (typeof window !== "undefined") {
    const ok = window.confirm(
      `投稿「${post.title}」を削除します。よろしいですか？`,
    );
    if (!ok) return;
  }

  error.value = "";
  pendingDeleteId.value = post.id;
  try {
    const { error: actionError } = await actions.posts.delete({ id: post.id });
    if (actionError) {
      error.value = actionError.message;
      return;
    }
    posts.value = posts.value.filter((p) => p.id !== post.id);
    // 削除対象が編集中だったら編集を解除
    if (editingPost.value?.id === post.id) {
      editingPost.value = null;
    }
  } catch (e) {
    logger.error("PostList delete error", e);
    error.value = "予期しないエラーが発生しました";
  } finally {
    pendingDeleteId.value = null;
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- 作成 / 編集フォーム -->
    <PostForm
      :editing-post="editingPost"
      @saved="handleSaved"
      @cancel="handleCancelEdit"
    />

    <!-- エラーメッセージ -->
    <div v-if="error" class="rounded-lg border border-red-200 bg-red-50 p-4">
      <p class="text-sm text-red-800">{{ error }}</p>
    </div>

    <!-- 一覧 -->
    <div
      class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
    >
      <div class="border-b border-gray-200 px-6 py-4">
        <h3 class="text-lg font-semibold text-gray-900">
          マイポスト（{{ posts.length }}件）
        </h3>
      </div>

      <!-- データなし -->
      <div v-if="posts.length === 0" class="px-6 py-12 text-center">
        <svg
          class="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p class="mt-4 text-sm text-gray-600">まだ投稿がありません</p>
        <p class="mt-1 text-xs text-gray-500">
          上のフォームから最初の投稿を作成してみましょう。
        </p>
      </div>

      <!-- 一覧テーブル -->
      <div v-else class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th
                scope="col"
                class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
              >
                タイトル
              </th>
              <th
                scope="col"
                class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
              >
                本文
              </th>
              <th
                scope="col"
                class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
              >
                作成日時
              </th>
              <th
                scope="col"
                class="px-6 py-3 text-right text-xs font-medium tracking-wider text-gray-500 uppercase"
              >
                操作
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 bg-white">
            <tr
              v-for="post in posts"
              :key="post.id"
              class="transition hover:bg-gray-50"
              :class="{ 'bg-brand-50': editingPost?.id === post.id }"
            >
              <td class="px-6 py-4">
                <div class="text-sm font-medium break-words text-gray-900">
                  {{ post.title }}
                </div>
              </td>
              <td class="px-6 py-4">
                <div class="line-clamp-2 text-sm text-gray-600">
                  {{ post.body || "（本文なし）" }}
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-500">
                  {{ formatDate(post.created_at) }}
                </div>
              </td>
              <td class="px-6 py-4 text-right whitespace-nowrap">
                <div class="flex justify-end gap-2">
                  <button
                    type="button"
                    :disabled="pendingDeleteId === post.id"
                    class="text-brand-700 hover:bg-brand-50 rounded-md border border-transparent px-3 py-1 text-sm font-medium transition disabled:opacity-50"
                    @click="handleEdit(post)"
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    :disabled="pendingDeleteId === post.id"
                    class="rounded-md border border-transparent px-3 py-1 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                    @click="handleDelete(post)"
                  >
                    {{ pendingDeleteId === post.id ? "削除中..." : "削除" }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
