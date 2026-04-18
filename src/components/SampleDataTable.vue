<script setup lang="ts">
import { ref, onMounted } from "vue";
import { createBrowserSupabase } from "../lib/supabase-browser";

interface Post {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
}

const supabase = createBrowserSupabase();

const posts = ref<Post[]>([]);
const isLoading = ref(true);
const error = ref("");

async function loadPosts() {
  isLoading.value = true;
  error.value = "";

  try {
    const { data, error: fetchError } = await supabase
      .from("member_posts")
      .select("id, title, body, created_at")
      .order("created_at", { ascending: false });

    if (fetchError) {
      error.value = fetchError.message;
    } else {
      posts.value = data || [];
    }
  } catch (e) {
    error.value = "予期しないエラーが発生しました";
  } finally {
    isLoading.value = false;
  }
}

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

onMounted(() => {
  loadPosts();
});
</script>

<template>
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
    <div class="px-6 py-4 border-b border-gray-200">
      <h3 class="text-lg font-semibold text-gray-900">マイポスト</h3>
    </div>

    <!-- ローディング -->
    <div v-if="isLoading" class="px-6 py-12 text-center">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-brand-500 border-t-transparent"></div>
      <p class="mt-4 text-sm text-gray-600">読み込み中...</p>
    </div>

    <!-- エラー -->
    <div v-else-if="error" class="px-6 py-8">
      <div class="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p class="text-sm text-red-800">{{ error }}</p>
      </div>
    </div>

    <!-- データなし -->
    <div v-else-if="posts.length === 0" class="px-6 py-12 text-center">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p class="mt-4 text-sm text-gray-600">まだ投稿がありません</p>
    </div>

    <!-- テーブル -->
    <div v-else class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              タイトル
            </th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              内容
            </th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              作成日時
            </th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-for="post in posts" :key="post.id" class="hover:bg-gray-50 transition">
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="text-sm font-medium text-gray-900">{{ post.title }}</div>
            </td>
            <td class="px-6 py-4">
              <div class="text-sm text-gray-600 line-clamp-2">
                {{ post.body || "（本文なし）" }}
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="text-sm text-gray-500">{{ formatDate(post.created_at) }}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- フッター -->
    <div class="px-6 py-4 bg-gray-50 border-t border-gray-200">
      <p class="text-sm text-gray-600">
        全 {{ posts.length }} 件
      </p>
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
