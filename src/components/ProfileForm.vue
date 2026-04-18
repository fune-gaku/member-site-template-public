<script setup lang="ts">
import { ref, onMounted } from "vue";
import { actions } from "astro:actions";
import { createBrowserSupabase } from "../lib/supabase-browser";

const supabase = createBrowserSupabase();

const displayName = ref("");
const avatarFile = ref<File | null>(null);
const avatarUrl = ref("");
const isLoading = ref(false);
const isUploadingAvatar = ref(false);
const error = ref("");
const success = ref("");

async function loadProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", user.id)
    .single();

  if (profile) {
    displayName.value = profile.display_name || "";
  }
}

async function handleAvatarChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  // ファイルサイズチェック（5MB）
  if (file.size > 5 * 1024 * 1024) {
    error.value = "ファイルサイズは5MB以下にしてください";
    return;
  }

  // 画像形式チェック
  if (!file.type.startsWith("image/")) {
    error.value = "画像ファイルを選択してください";
    return;
  }

  avatarFile.value = file;
  error.value = "";
  success.value = "";
}

async function handleUploadAvatar() {
  if (!avatarFile.value) return;

  isUploadingAvatar.value = true;
  error.value = "";
  success.value = "";

  try {
    const { data, error: actionError } = await actions.storage.uploadAvatar({
      file: avatarFile.value,
    });

    if (actionError) {
      error.value = actionError.message;
    } else if (data) {
      // アップロード成功後、署名付きURLを取得
      const { data: urlData, error: urlError } = await actions.storage.getSignedUrl({
        path: data.path,
      });

      if (urlError) {
        error.value = "画像URLの取得に失敗しました";
      } else if (urlData) {
        avatarUrl.value = urlData.url;
        success.value = "アバターをアップロードしました";
        avatarFile.value = null;
      }
    }
  } catch (e) {
    error.value = "予期しないエラーが発生しました";
  } finally {
    isUploadingAvatar.value = false;
  }
}

async function handleUpdateProfile() {
  isLoading.value = true;
  error.value = "";
  success.value = "";

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      error.value = "ユーザー情報を取得できませんでした";
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ display_name: displayName.value })
      .eq("user_id", user.id);

    if (updateError) {
      error.value = updateError.message;
    } else {
      success.value = "プロフィールを更新しました";
    }
  } catch (e) {
    error.value = "予期しないエラーが発生しました";
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  loadProfile();
});
</script>

<template>
  <div class="space-y-8">
    <!-- メッセージ -->
    <div v-if="error" class="p-4 bg-red-50 border border-red-200 rounded-lg">
      <p class="text-sm text-red-800">{{ error }}</p>
    </div>
    <div v-if="success" class="p-4 bg-green-50 border border-green-200 rounded-lg">
      <p class="text-sm text-green-800">{{ success }}</p>
    </div>

    <!-- アバターアップロード -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">アバター画像</h3>

      <div class="flex items-start space-x-6">
        <div class="flex-shrink-0">
          <div class="w-24 h-24 rounded-full bg-gray-200 overflow-hidden">
            <img
              v-if="avatarUrl"
              :src="avatarUrl"
              alt="アバター"
              class="w-full h-full object-cover"
            />
            <div v-else class="w-full h-full flex items-center justify-center text-gray-400">
              <svg class="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </div>
          </div>
        </div>

        <div class="flex-1">
          <input
            type="file"
            accept="image/*"
            @change="handleAvatarChange"
            class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 cursor-pointer"
            :disabled="isUploadingAvatar"
          />
          <p class="mt-2 text-xs text-gray-500">PNG, JPG, GIF（最大5MB）</p>

          <button
            v-if="avatarFile"
            @click="handleUploadAvatar"
            :disabled="isUploadingAvatar"
            class="mt-3 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ isUploadingAvatar ? "アップロード中..." : "アップロード" }}
          </button>
        </div>
      </div>
    </div>

    <!-- プロフィール編集 -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">基本情報</h3>

      <form @submit.prevent="handleUpdateProfile" class="space-y-4">
        <div>
          <label for="display-name" class="block text-sm font-medium text-gray-700 mb-2">
            表示名
          </label>
          <input
            id="display-name"
            v-model="displayName"
            type="text"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition"
            placeholder="山田 太郎"
            :disabled="isLoading"
          />
        </div>

        <button
          type="submit"
          :disabled="isLoading"
          class="px-6 py-2 text-white bg-brand-600 rounded-lg font-medium hover:bg-brand-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ isLoading ? "更新中..." : "プロフィールを更新" }}
        </button>
      </form>
    </div>
  </div>
</template>
