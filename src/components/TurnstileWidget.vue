<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

import { ensureTurnstileLoaded } from "../lib/turnstile-loader";

const props = withDefaults(
  defineProps<{
    siteKey: string;
    theme?: "light" | "dark" | "auto";
  }>(),
  {
    theme: "light",
  },
);

const emit = defineEmits<(e: "update:token", token: string) => void>();

const widgetEl = ref<HTMLDivElement | null>(null);
let widgetId: string | undefined;

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement | string,
        opts: {
          sitekey: string;
          theme?: "light" | "dark" | "auto";
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
        },
      ) => string;
      remove: (id: string) => void;
      reset: (id?: string) => void;
    };
  }
}

function render() {
  if (!widgetEl.value || !window.turnstile) return;
  widgetId = window.turnstile.render(widgetEl.value, {
    sitekey: props.siteKey,
    theme: props.theme,
    callback: (token: string) => emit("update:token", token),
    "expired-callback": () => emit("update:token", ""),
    "error-callback": () => emit("update:token", ""),
  });
}

function reset() {
  if (widgetId && window.turnstile) {
    window.turnstile.reset(widgetId);
    emit("update:token", "");
  }
}

defineExpose({ reset });

onMounted(async () => {
  // loader は `src/lib/turnstile-loader.ts` で singleton 化されており、
  // 同一ページに複数 TurnstileWidget が mount されても script は 1 回だけ
  // 注入され、すべてのインスタンスが安全に render される (PR #29 codex
  // review で発覚した silent fail の対策)。
  await ensureTurnstileLoaded();
  render();
});

onBeforeUnmount(() => {
  if (widgetId && window.turnstile) {
    window.turnstile.remove(widgetId);
  }
});
</script>

<template>
  <div ref="widgetEl" />
</template>
