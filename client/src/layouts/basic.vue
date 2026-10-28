<script lang="ts" setup>
import type { NotificationItem } from '@vben/layouts';

import { computed, watch } from 'vue';
import { useRouter } from 'vue-router';

import { AuthenticationLoginExpiredModal } from '@vben/common-ui';
import { useWatermark } from '@vben/hooks';
import {
  BasicLayout,
  LockScreen,
  Notification,
  UserDropdown,
} from '@vben/layouts';
import { preferences, usePreferences } from '@vben/preferences';
import { useAccessStore, useUserStore } from '@vben/stores';

import { $t } from '#/locales';
import { useAuthStore } from '#/store';
import LoginForm from '#/views/_core/authentication/login.vue';

const router = useRouter();
const userStore = useUserStore();
const authStore = useAuthStore();
const accessStore = useAccessStore();
const { destroyWatermark, updateWatermark } = useWatermark();
const { isDark } = usePreferences();

async function handleLogout() {
  await authStore.logout(false);
}

const viewAll = () => {
  router.push('/notification');
};

const handleClick = (item: NotificationItem) => {
  // 优先用 item.link，没有就默认跳通知列表
  if (item.link) {
    if (/^https?:\/\//i.test(item.link)) {
      window.open(item.link, '_blank');
    } else {
      router.push({ path: item.link, query: item.query || {}, state: item.state });
    }
  } else {
    router.push('/notification');
  }
};

const menus = computed(() => [
  {
    handler: () => { router.push({ name: 'Profile' }); },
    icon: 'lucide:user',
    text: $t('page.auth.profile'),
  },
]);

const avatar = computed(() => {
  return userStore.userInfo?.avatar ?? preferences.app.defaultAvatar;
});

// ============ 水印 ============
watch(
  () => ({
    enable: preferences.app.watermark,
    content: preferences.app.watermarkContent,
    isDark: isDark.value,
  }),
  async ({ enable, content, isDark: isDarkValue }) => {
    if (enable) {
      const watermarkColor = isDarkValue
        ? 'rgba(255, 255, 255, 0.12)'
        : 'rgba(0, 0, 0, 0.12)';
      await updateWatermark({
        advancedStyle: {
          colorStops: [{ color: watermarkColor, offset: 0 }, { color: watermarkColor, offset: 1 }],
          type: 'linear',
        },
        content: content || `${userStore.userInfo?.username} - ${userStore.userInfo?.realName}`,
      });
    } else {
      destroyWatermark();
    }
  },
  { immediate: true },
);
</script>

<template>
  <BasicLayout
    :avatar
    :text="userStore.userInfo?.realName"
    @clear-preferences-and-logout="handleLogout"
    @logout="handleLogout"
  >
    <template #user-dropdown>
      <UserDropdown
        :avatar
        :menus
        :text="userStore.userInfo?.realName"
        @clear-preferences-and-logout="handleLogout"
        @logout="handleLogout"
      />
    </template>
    <template #notification>
      <!-- 不传 notifications / dot — 让 Vben 组件自己 fetch+polling -->
      <Notification
        @on-click="handleClick"
        @view-all="viewAll"
      />
    </template>
    <template #lock-screen>
      <LockScreen />
    </template>
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
    <AuthenticationLoginExpiredModal v-model:open="accessStore.loginExpired">
      <LoginForm v-if="accessStore.loginExpired" />
    </AuthenticationLoginExpiredModal>
  </BasicLayout>
</template>
