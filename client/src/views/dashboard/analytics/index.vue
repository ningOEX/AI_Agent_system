<script lang="ts" setup>
import { computed } from 'vue';

import { useUserStore } from '@vben/stores';

import AdminAnalytics from './admin-analytics.vue';
import UserAnalytics from './user-analytics.vue';

defineOptions({ name: 'Analytics' });

const userStore = useUserStore();

// 管理员看到全站分析页，普通用户看到专属的个人创作分析页
const isAdmin = computed(
  () => userStore.userInfo?.roles?.includes('admin') ?? false,
);
</script>

<template>
  <AdminAnalytics v-if="isAdmin" />
  <UserAnalytics v-else />
</template>
