<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { useAccessStore, useUserStore } from '@vben/stores';

// 博客前台（blog-web）独立站点地址：开发 http://localhost:3000、生产 http://123.57.41.200
const BLOG_WEB_URL =
  import.meta.env.VITE_GLOB_BLOG_WEB_URL || 'http://localhost:3000';

const accessStore = useAccessStore();
const userStore = useUserStore();

const target = ref('');

/**
 * 拼出带登录参数的博客前台地址：
 *  - token：前台存入 localStorage 后即为登录态，评论无需再次登录
 *  - role：前台据此隐藏管理员不该看到的模块（如智能客服弹窗）
 */
function buildTargetUrl() {
  const url = new URL(BLOG_WEB_URL);
  const token = accessStore.accessToken;
  const role = userStore.userInfo?.roles?.[0] || 'user';
  if (token) {
    url.searchParams.set('token', token);
  }
  url.searchParams.set('role', role);
  return url.toString();
}

onMounted(() => {
  target.value = buildTargetUrl();
  window.location.replace(target.value);
});
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center gap-3 p-8">
    <p class="text-sm text-muted-foreground">
      正在跳转到博客前台并同步登录状态…
    </p>
    <a v-if="target" :href="target" class="text-sm text-primary underline">
      如果没有自动跳转，请点击这里
    </a>
  </div>
</template>
