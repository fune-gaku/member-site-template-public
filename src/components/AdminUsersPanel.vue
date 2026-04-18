<script setup lang="ts">
import { ref } from "vue";

import AdminUserList from "./AdminUserList.vue";
import InviteUserForm from "./InviteUserForm.vue";

defineProps<{
  currentUserId: string;
}>();

const listRef = ref<InstanceType<typeof AdminUserList> | null>(null);

function handleInvited() {
  // 招待成功後、一覧を再取得
  listRef.value?.refresh();
}
</script>

<template>
  <div class="space-y-6">
    <InviteUserForm @invited="handleInvited" />
    <AdminUserList ref="listRef" :current-user-id="currentUserId" />
  </div>
</template>
