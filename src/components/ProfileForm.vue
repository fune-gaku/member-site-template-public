<script setup lang="ts">
import { actions } from "astro:actions";
import { ref } from "vue";

import { createBrowserSupabase } from "../lib/supabase-browser";

const props = withDefaults(
  defineProps<{
    initialDisplayName?: string;
    initialAvatarUrl?: string;
  }>(),
  {
    initialDisplayName: "",
    initialAvatarUrl: "",
  },
);

const supabase = createBrowserSupabase();

const displayName = ref(props.initialDisplayName);
const avatarFile = ref<File | null>(null);
const avatarUrl = ref(props.initialAvatarUrl);
const isLoading = ref(false);
const isUploadingAvatar = ref(false);
const error = ref("");
const success = ref("");

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
    // FormDataを作成
    const formData = new FormData();
    formData.append("file", avatarFile.value);

    const { data, error: actionError } = await actions.storage.uploadAvatar(
      formData,
    );

    if (actionError) {
      error.value = actionError.message;
    } else if (data) {
      // アップロード成功後、署名付きURLを取得
      const { data: urlData, error: urlError } =
        await actions.storage.getSignedUrl({
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
    console.error("Avatar upload error:", e);
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
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
    console.error("Profile update error:", e);
    error.value = "予期しないエラーが発生しました";
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="space-y-8">
    <!-- メッセージ -->
    <div v-if="error" class="rounded-lg border border-red-200 bg-red-50 p-4">
      <p class="text-sm text-red-800">{{ error }}</p>
    </div>
    <div
      v-if="success"
      class="rounded-lg border border-green-200 bg-green-50 p-4"
    >
      <p class="text-sm text-green-800">{{ success }}</p>
    </div>

    <!-- アバターアップロード -->
    <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h3 class="mb-4 text-lg font-semibold text-gray-900">アバター画像</h3>

      <div class="flex items-start space-x-6">
        <div class="flex-shrink-0">
          <div class="h-24 w-24 overflow-hidden rounded-full bg-gray-200">
            <img
              v-if="avatarUrl"
              :src="avatarUrl"
              alt="アバター"
              class="h-full w-full object-cover"
            />
            <div
              v-else
              class="flex h-full w-full items-center justify-center text-gray-400"
            >
              <svg class="h-12 w-12" fill="currentColor" viewBox="0 0 24 24">
                <path
                  d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                />
              </svg>
            </div>
          </div>
        </div>

        <div class="flex-1">
          <input
            type="file"
            accept="image/*"
            class="file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 block w-full cursor-pointer text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:px-4 file:py-2 file:text-sm file:font-medium"
            :disabled="isUploadingAvatar"
            @change="handleAvatarChange"
          />
          <p class="mt-2 text-xs text-gray-500">PNG, JPG, GIF（最大5MB）</p>

          <button
            v-if="avatarFile"
            :disabled="isUploadingAvatar"
            class="bg-brand-600 hover:bg-brand-700 mt-3 rounded-lg px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            @click="handleUploadAvatar"
          >
            {{ isUploadingAvatar ? "アップロード中..." : "アップロード" }}
          </button>
        </div>
      </div>
    </div>

    <!-- プロフィール編集 -->
    <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h3 class="mb-4 text-lg font-semibold text-gray-900">基本情報</h3>

      <form class="space-y-4" @submit.prevent="handleUpdateProfile">
        <div>
          <label
            for="display-name"
            class="mb-2 block text-sm font-medium text-gray-700"
          >
            表示名
          </label>
          <input
            id="display-name"
            v-model="displayName"
            type="text"
            class="focus:ring-brand-500 focus:border-brand-500 w-full rounded-lg border border-gray-300 px-4 py-2 transition outline-none focus:ring-2"
            placeholder="山田 太郎"
            :disabled="isLoading"
          />
        </div>

        <button
          type="submit"
          :disabled="isLoading"
          class="bg-brand-600 hover:bg-brand-700 rounded-lg px-6 py-2 font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {{ isLoading ? "更新中..." : "プロフィールを更新" }}
        </button>
      </form>
    </div>
  </div>
</template>
