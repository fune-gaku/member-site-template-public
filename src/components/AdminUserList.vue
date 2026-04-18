<script setup lang="ts">
import { actions } from "astro:actions";
import { ref, onMounted } from "vue";

interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: "member" | "admin";
  createdAt: string;
}

const props = defineProps<{
  /** 現在操作しているユーザーの ID（自己変更禁止のため） */
  currentUserId: string;
}>();

const users = ref<AdminUser[]>([]);
const isLoading = ref(true);
const error = ref("");
const pendingRoleId = ref<string | null>(null);

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function loadUsers() {
  isLoading.value = true;
  error.value = "";
  try {
    const { data, error: actionError } = await actions.admin.listUsers({});
    if (actionError) {
      error.value = actionError.message;
      return;
    }
    if (data) {
      users.value = data.users;
    }
  } catch (e) {
    console.error("AdminUserList load error:", e);
    error.value = "予期しないエラーが発生しました";
  } finally {
    isLoading.value = false;
  }
}

async function toggleRole(target: AdminUser) {
  if (target.id === props.currentUserId) {
    error.value = "自分自身のロールは変更できません";
    return;
  }
  const nextRole: "member" | "admin" =
    target.role === "admin" ? "member" : "admin";
  const confirmMessage =
    nextRole === "admin"
      ? `${target.email} を管理者に昇格します。よろしいですか？`
      : `${target.email} の管理者権限を外します。よろしいですか？`;
  if (typeof window !== "undefined" && !window.confirm(confirmMessage)) {
    return;
  }

  error.value = "";
  pendingRoleId.value = target.id;
  try {
    const { error: actionError } = await actions.admin.updateUserRole({
      userId: target.id,
      role: nextRole,
    });
    if (actionError) {
      error.value = actionError.message;
      return;
    }
    // ローカル状態も更新
    const idx = users.value.findIndex((u) => u.id === target.id);
    if (idx >= 0) {
      users.value.splice(idx, 1, { ...users.value[idx], role: nextRole });
    }
  } catch (e) {
    console.error("AdminUserList updateRole error:", e);
    error.value = "予期しないエラーが発生しました";
  } finally {
    pendingRoleId.value = null;
  }
}

/** 親からの招待成功を受けてリスト再取得 */
function refresh() {
  loadUsers();
}
defineExpose({ refresh });

onMounted(loadUsers);
</script>

<template>
  <div
    class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
  >
    <div
      class="flex items-center justify-between border-b border-gray-200 px-6 py-4"
    >
      <h3 class="text-lg font-semibold text-gray-900">
        ユーザー一覧（{{ users.length }}件）
      </h3>
      <button
        type="button"
        :disabled="isLoading"
        class="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
        @click="loadUsers"
      >
        {{ isLoading ? "更新中..." : "更新" }}
      </button>
    </div>

    <div v-if="error" class="border-b border-red-200 bg-red-50 px-6 py-3">
      <p class="text-sm text-red-800">{{ error }}</p>
    </div>

    <!-- ローディング -->
    <div v-if="isLoading && users.length === 0" class="px-6 py-12 text-center">
      <div
        class="border-brand-500 inline-block h-8 w-8 animate-spin rounded-full border-4 border-t-transparent"
      ></div>
      <p class="mt-4 text-sm text-gray-600">読み込み中...</p>
    </div>

    <!-- データなし -->
    <div
      v-else-if="users.length === 0"
      class="px-6 py-12 text-center text-sm text-gray-600"
    >
      ユーザーがいません
    </div>

    <!-- 一覧 -->
    <div v-else class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th
              scope="col"
              class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
            >
              メールアドレス
            </th>
            <th
              scope="col"
              class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
            >
              表示名
            </th>
            <th
              scope="col"
              class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
            >
              ロール
            </th>
            <th
              scope="col"
              class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
            >
              登録日
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
            v-for="u in users"
            :key="u.id"
            class="transition hover:bg-gray-50"
          >
            <td class="px-6 py-4">
              <div class="text-sm font-medium break-all text-gray-900">
                {{ u.email }}
                <span
                  v-if="u.id === currentUserId"
                  class="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-600"
                >
                  自分
                </span>
              </div>
            </td>
            <td class="px-6 py-4">
              <div class="text-sm text-gray-700">
                {{ u.displayName || "（未設定）" }}
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <span
                class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                :class="
                  u.role === 'admin'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-800'
                "
              >
                {{ u.role }}
              </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="text-sm text-gray-500">
                {{ formatDate(u.createdAt) }}
              </div>
            </td>
            <td class="px-6 py-4 text-right whitespace-nowrap">
              <button
                type="button"
                :disabled="u.id === currentUserId || pendingRoleId === u.id"
                :title="
                  u.id === currentUserId
                    ? '自分自身のロールは変更できません'
                    : ''
                "
                class="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                @click="toggleRole(u)"
              >
                <template v-if="pendingRoleId === u.id">更新中...</template>
                <template v-else-if="u.role === 'admin'">管理者を外す</template>
                <template v-else>管理者にする</template>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
