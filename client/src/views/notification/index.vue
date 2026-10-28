<script setup lang="ts">
import type { NotificationItem } from '#/api/core/notification';

import { computed, h, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import dayjs from 'dayjs';

import {
  Button,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  message,
} from 'ant-design-vue';

import {
  deleteNotificationApi,
  getNotificationListApi,
  markAllNotificationsReadApi,
  type NotificationListResult,
} from '#/api/core/notification';
import { useUserStore } from '@vben/stores';

defineOptions({ name: 'NotificationList' });

const router = useRouter();
const userStore = useUserStore();

const loading = ref(false);
const data = ref<NotificationItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const keyword = ref('');

const isAdmin = computed(() => userStore.userInfo?.roles?.includes('admin') ?? false);

async function loadList() {
  loading.value = true;
  try {
    const res: NotificationListResult = await getNotificationListApi({
      page: page.value,
      pageSize: pageSize.value,
    });
    const kw = keyword.value.trim().toLowerCase();
    if (kw) {
      data.value = res.list.filter(
        (n) =>
          n.title.toLowerCase().includes(kw) ||
          n.content.toLowerCase().includes(kw) ||
          n.publisherName.toLowerCase().includes(kw),
      );
    } else {
      data.value = res.list;
    }
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

function handleTableChange(pag: any) {
  page.value = pag.current;
  pageSize.value = pag.pageSize;
  loadList();
}

function handleSearch() {
  page.value = 1;
  loadList();
}

function handleReset() {
  keyword.value = '';
  page.value = 1;
  loadList();
}

async function handleReadAll() {
  try {
    await markAllNotificationsReadApi();
    message.success('已全部标记为已读');
    loadList();
    broadcastRefresh();
  } catch (e: any) {
    message.error(e?.message || '操作失败');
  }
}

function handleEdit(id: string) {
  router.push(`/notification/${id}/edit`);
}

async function handleDelete(id: string) {
  Modal.confirm({
    title: '确认删除',
    content: '删除后不可恢复，确定要删除这条通知吗？',
    okText: '确定删除',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      await deleteNotificationApi(id);
      message.success('删除成功');
      loadList();
      broadcastRefresh();
    },
  });
}

// ---------- 跨 tab 同步 ----------
let broadcast: BroadcastChannel | null = null;
function broadcastRefresh() {
  try { broadcast?.postMessage({ type: 'refresh' }); } catch { /* noop */ }
}

onMounted(() => {
  loadList();
  try {
    broadcast = new BroadcastChannel('app-notification');
    broadcast.onmessage = (e) => {
      if (e.data?.type === 'refresh') loadList();
    };
  } catch { /* noop */ }
});

onUnmounted(() => {
  broadcast?.close();
});

function fmtDate(iso: string) {
  return dayjs(iso).format('YYYY-MM-DD HH:mm:ss');
}

const columns = computed(() => [
  {
    title: '#',
    key: 'idx',
    width: 50,
    customRender: ({ index }: { index: number }) =>
      (page.value - 1) * pageSize.value + index + 1,
  },
  {
    title: '状态',
    dataIndex: 'isRead',
    width: 90,
    customRender: ({ text }: { text: boolean }) =>
      h(Tag, { color: text ? 'default' : 'red' }, () => (text ? '已读' : '未读')),
  },
  {
    title: '标题',
    dataIndex: 'title',
    width: 220,
    ellipsis: true,
  },
  {
    title: '内容',
    dataIndex: 'content',
    width: 280,
    ellipsis: true,
  },
  {
    title: '发布人',
    dataIndex: 'publisherName',
    width: 120,
    customRender: ({ text, record }: { text: string; record: NotificationItem }) =>
      h('span', {}, [
        text,
        record.publisherId === userStore.userInfo?.userId
          ? h(Tag, { color: 'blue', class: 'ml-1' }, () => '我')
          : null,
      ]),
  },
  {
    title: '发布时间',
    dataIndex: 'createdAt',
    width: 180,
    customRender: ({ text }: { text: string }) => fmtDate(text),
    sorter: true,
  },
  {
    title: '操作',
    key: 'action',
    width: 160,
    fixed: 'right' as const,
    customRender: ({ record }: { record: NotificationItem }) =>
      h(Space, {}, () => [
        h(
          Button,
          {
            type: 'link',
            size: 'small',
            disabled: record.isRead,
            onClick: async () => {
              // 单条标记已读
              const { markNotificationReadApi } = await import(
                '#/api/core/notification'
              );
              await markNotificationReadApi(record._id);
              message.success('已标记为已读');
              loadList();
            },
          },
          () => '标记已读',
        ),
        isAdmin.value
          ? h(
              Button,
              {
                type: 'link',
                size: 'small',
                onClick: () => handleEdit(record._id),
              },
              () => '编辑',
            )
          : null,
        isAdmin.value
          ? h(
              Popconfirm,
              {
                title: '确认删除？',
                okText: '删除',
                cancelText: '取消',
                okButtonProps: { danger: true },
                onConfirm: () => handleDelete(record._id),
              },
              () =>
                h(Button, { type: 'link', size: 'small', danger: true }, () => '删除'),
            )
          : null,
      ]),
  },
]);
</script>

<template>
  <div class="p-4">
    <!-- 搜索/操作区 -->
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <Input
        v-model:value="keyword"
        placeholder="搜索标题 / 内容 / 发布人"
        style="width: 260px"
        allow-clear
        @press-enter="handleSearch"
      />
      <Button type="primary" @click="handleSearch">搜索</Button>
      <Button @click="handleReset">重置</Button>
      <Button @click="handleReadAll">全部已读</Button>

      <div v-if="isAdmin" class="ml-auto flex gap-2">
        <Button type="primary" @click="router.push('/notification/create')">
          + 发布通知
        </Button>
      </div>
    </div>

    <!-- 表格 -->
    <Table
      :columns="columns"
      :data-source="data"
      :loading="loading"
      :pagination="{
        current: page,
        pageSize,
        total,
        showSizeChanger: true,
        showQuickJumper: true,
        showTotal: (t: number) => `共 ${t} 条`,
      }"
      :scroll="{ x: 1050 }"
      row-key="_id"
      row-class-name="!cursor-pointer"
      @change="handleTableChange"
    />
  </div>
</template>
