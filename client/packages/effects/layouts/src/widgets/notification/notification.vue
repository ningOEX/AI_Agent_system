<script lang="ts" setup>
import type { NotificationItem } from './types';

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

import { Bell, CircleCheckBig, CircleX, MailCheck } from '@vben/icons';
import { $t } from '@vben/locales';
import { useAccessStore, useUserStore } from '@vben/stores';

import {
  VbenButton,
  VbenIconButton,
  VbenPopover,
  VbenScrollbar,
} from '@vben-core/shadcn-ui';

import { useToggle } from '@vueuse/core';

defineOptions({ name: 'NotificationPopup' });

const props = withDefaults(
  defineProps<{
    /** 显示圆点 */
    dot?: boolean;
    /** 消息列表（如果外部传了就用外部的；不传则自动从后端拉） */
    notifications?: NotificationItem[];
  }>(),
  {
    dot: false,
    notifications: () => [],
  },
);

const emit = defineEmits<{
  clear: [];
  makeAll: [];
  onClick: [NotificationItem];
  read: [NotificationItem];
  remove: [NotificationItem];
  viewAll: [];
}>();

// ---------- 自动从后端拉数据 ----------
const accessStore = useAccessStore();
const userStore = useUserStore();
const apiBase = import.meta.env.VITE_GLOB_API_URL || '/api';

// 内部数据
const internalList = ref<NotificationItem[]>([]);
const unreadCount = ref(0);
const dotVisible = ref(false);
let pollTimer: ReturnType<typeof setInterval> | null = null;

// ------ 前端隐藏状态（localStorage） ------
// "清空" / 单条 CircleX 都是对当前用户隐藏，后端列表页不受影响
// 按 userId 隔离：不同账号各管各的隐藏列表
const hiddenIds = ref<Set<string>>(new Set());

function hiddenStorageKey() {
  const uid = String(userStore.userInfo?.userId || 'guest');
  return `widget.notification.hidden.${uid}`;
}

function loadHiddenIds() {
  try {
    const raw = localStorage.getItem(hiddenStorageKey());
    hiddenIds.value = new Set(raw ? JSON.parse(raw) : []);
  } catch {
    hiddenIds.value = new Set();
  }
}

function saveHiddenIds() {
  try {
    localStorage.setItem(
      hiddenStorageKey(),
      JSON.stringify([...hiddenIds.value]),
    );
  } catch { /* noop */ }
}

function hideAll(items: NotificationItem[]) {
  items.forEach((n) => n.id && hiddenIds.value.add(String(n.id)));
  saveHiddenIds();
  broadcast?.postMessage({ type: 'hidden-updated' });
}

function hideOne(id: string | number) {
  hiddenIds.value.add(String(id));
  saveHiddenIds();
  broadcast?.postMessage({ type: 'hidden-updated' });
}

// ------ 跨 tab/window 实时同步 ------
let broadcast: BroadcastChannel | null = null;

function getToken() {
  return accessStore.accessToken ?? '';
}

function formatBackendItem(n: any): NotificationItem {
  return {
    id: n._id,
    title: n.title,
    message: n.content,
    date: new Date(n.createdAt).toLocaleString(),
    avatar: '',
    isRead: !!n.isRead,
    link: '/notification',
    _id: n._id,
  } as NotificationItem;
}

async function fetchNotifications() {
  if (!getToken()) return;
  try {
    const resp = await fetch(`${apiBase}/notifications?pageSize=20`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!resp.ok) return;
    const json = await resp.json();
    const all = (json.list || []).map(formatBackendItem);
    // 过滤掉"已隐藏"的（按当前用户的 localStorage 记录）
    internalList.value = all.filter(
      (n: NotificationItem) => !n.id || !hiddenIds.value.has(String(n.id)),
    );
    // 未读数只算可见的、未读的
    const visibleUnread = internalList.value.filter(
      (n: NotificationItem) => !n.isRead,
    ).length;
    unreadCount.value = visibleUnread;
    dotVisible.value = visibleUnread > 0;
  } catch { /* 静默失败 */ }
}

async function refresh() {
  await fetchNotifications();
}

onMounted(() => {
  loadHiddenIds();
  refresh();
  pollTimer = setInterval(() => {
    // 轮询只刷新 unreadCount 更快，但 filter 需要 hiddenIds
    fetchNotifications();
  }, 30 * 1000);

  try {
    broadcast = new BroadcastChannel('app-notification');
    broadcast.onmessage = (e) => {
      if (e.data?.type === 'refresh' || e.data?.type === 'hidden-updated') {
        refresh();
      }
    };
  } catch { /* BroadcastChannel 不可用时静默降级 */ }
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
  broadcast?.close();
});

// 登录/登出
watch(
  () => accessStore.accessToken,
  (token) => {
    if (token) {
      loadHiddenIds();
      refresh();
    } else {
      internalList.value = [];
      unreadCount.value = 0;
      dotVisible.value = false;
      hiddenIds.value = new Set();
    }
  },
);

// userId 变化（切换账号）→ 重新加载对应隐藏列表
watch(
  () => userStore.userInfo?.userId,
  () => {
    loadHiddenIds();
    refresh();
  },
);

// Popover 打开时强制刷新
const [open, toggle] = useToggle();
watch(open, (isOpen) => {
  if (isOpen) refresh();
});

// 最终渲染的数据（props > 内部）
const list = computed(() =>
  props.notifications.length > 0 ? props.notifications : internalList.value,
);

const showDot = computed(() => props.dot || dotVisible.value);

// ---------- 交互处理 ----------

function close() {
  open.value = false;
}

async function handleViewAll() {
  emit('viewAll');
  close();
}

async function handleMakeAll() {
  emit('makeAll');
  if (getToken()) {
    try {
      await fetch(`${apiBase}/notifications/read-all`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
    } catch { /* noop */ }
  }
  internalList.value.forEach((n) => (n.isRead = true));
  unreadCount.value = 0;
  dotVisible.value = false;
  broadcast?.postMessage({ type: 'refresh' });
}

function handleClear() {
  emit('clear');
  // 把当前弹框里显示的全部标记为"对我隐藏"
  hideAll(internalList.value);
  internalList.value = [];
  unreadCount.value = 0;
  dotVisible.value = false;
  close();
}

async function handleRead(item: NotificationItem) {
  emit('read', item);
  if (getToken() && item.id) {
    try {
      await fetch(`${apiBase}/notifications/${item.id}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
    } catch { /* noop */ }
  }
  item.isRead = true;
  unreadCount.value = Math.max(0, unreadCount.value - 1);
  dotVisible.value = unreadCount.value > 0;
}

function handleRemove(item: NotificationItem) {
  emit('remove', item);
  // 单条 CircleX = 对我隐藏（不是从后端真删除）
  if (item.id) hideOne(item.id);
  const idx = internalList.value.findIndex((n) => n.id === item.id);
  if (idx >= 0) internalList.value.splice(idx, 1);
  if (!item.isRead) {
    unreadCount.value = Math.max(0, unreadCount.value - 1);
    dotVisible.value = unreadCount.value > 0;
  }
}

function handleClick(item: NotificationItem) {
  emit('onClick', item);
  if (!item.isRead) handleRead(item);
}

defineExpose({ toggle, refresh });
</script>
<template>
  <VbenPopover v-model:open="open" content-class="relative right-2 w-90 p-0">
    <template #trigger>
      <div class="mr-2 flex-center h-full" @click.stop="toggle()">
        <VbenIconButton class="bell-button relative text-foreground">
          <span
            v-if="showDot"
            class="absolute top-0.5 right-0.5 size-2 rounded-full bg-primary"
          ></span>
          <Bell class="size-4" />
        </VbenIconButton>
      </div>
    </template>

    <div class="relative">
      <div class="flex items-center justify-between p-4 py-3">
        <div class="text-foreground">
          {{ $t('ui.widgets.notifications') }}
          <span v-if="unreadCount > 0" class="ml-1 text-xs text-muted-foreground">
            ({{ unreadCount }})
          </span>
        </div>
        <VbenIconButton
          :disabled="list.length <= 0"
          :tooltip="$t('ui.widgets.markAllAsRead')"
          @click="handleMakeAll"
        >
          <MailCheck class="size-4" />
        </VbenIconButton>
      </div>
      <VbenScrollbar v-if="list.length > 0">
        <ul class="flex! max-h-90 w-full flex-col">
          <template v-for="item in list" :key="item.id ?? item.title">
            <li
              class="relative flex w-full cursor-pointer items-start gap-5 border-t border-border p-3 hover:bg-accent"
              @click="handleClick(item)"
            >
              <slot name="content" :item="item">
                <span
                  v-if="!item.isRead"
                  class="absolute top-2 right-2 size-2 rounded-sm bg-primary"
                ></span>

                <span
                  v-if="item.avatar"
                  class="relative flex size-10 shrink-0 overflow-hidden rounded-full"
                >
                  <img
                    :src="item.avatar"
                    class="aspect-square size-full object-cover"
                  />
                </span>
                <div class="flex flex-col gap-1 leading-none">
                  <p class="font-semibold">{{ item.title }}</p>
                  <p class="my-1 line-clamp-2 text-xs text-muted-foreground">
                    {{ item.message }}
                  </p>
                  <p class="line-clamp-2 text-xs text-muted-foreground">
                    {{ item.date }}
                  </p>
                </div>
                <div
                  class="absolute top-1/2 right-3 flex -translate-y-1/2 flex-row gap-1"
                >
                  <slot name="action" :item="item">
                    <slot name="action-prepend" :item="item"></slot>
                    <VbenIconButton
                      v-if="!item.isRead"
                      size="xs"
                      variant="ghost"
                      class="h-6 px-2"
                      :tooltip="$t('common.confirm')"
                      @click.stop="handleRead(item)"
                    >
                      <CircleCheckBig class="size-4" />
                    </VbenIconButton>
                    <VbenIconButton
                      size="xs"
                      variant="ghost"
                      class="h-6 px-2 text-destructive"
                      :tooltip="$t('common.delete')"
                      @click.stop="handleRemove(item)"
                    >
                      <CircleX class="size-4" />
                    </VbenIconButton>
                    <slot name="action-append" :item="item"></slot>
                  </slot>
                </div>
              </slot>
            </li>
          </template>
        </ul>
      </VbenScrollbar>

      <template v-else>
        <div class="flex-center min-h-37.5 w-full text-muted-foreground">
          {{ $t('common.noData') }}
        </div>
      </template>

      <div
        class="flex items-center justify-between border-t border-border px-4 py-3"
      >
        <VbenButton
          :disabled="list.length <= 0"
          size="sm"
          variant="ghost"
          @click="handleClear"
        >
          {{ $t('ui.widgets.clearNotifications') }}
        </VbenButton>
        <VbenButton size="sm" @click="handleViewAll">
          {{ $t('ui.widgets.viewAll') }}
        </VbenButton>
      </div>
    </div>
  </VbenPopover>
</template>

<style scoped>
:deep(.bell-button) {
  &:hover {
    svg {
      animation: bell-ring 1s both;
    }
  }
}

@keyframes bell-ring {
  0%,
  100% {
    transform-origin: top;
  }

  15% {
    transform: rotateZ(10deg);
  }

  30% {
    transform: rotateZ(-10deg);
  }

  45% {
    transform: rotateZ(5deg);
  }

  60% {
    transform: rotateZ(-5deg);
  }

  75% {
    transform: rotateZ(2deg);
  }
}
</style>
