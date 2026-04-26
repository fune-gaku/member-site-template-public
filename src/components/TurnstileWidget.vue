<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

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
    onTurnstileReady?: () => void;
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

onMounted(() => {
  if (window.turnstile) {
    render();
    return;
  }
  const existing = document.querySelector<HTMLScriptElement>(
    'script[data-turnstile-loader="true"]',
  );
  if (existing) {
    window.onTurnstileReady = render;
    return;
  }
  window.onTurnstileReady = render;
  const s = document.createElement("script");
  s.src =
    "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileReady";
  s.async = true;
  s.defer = true;
  s.dataset.turnstileLoader = "true";
  document.head.appendChild(s);
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
