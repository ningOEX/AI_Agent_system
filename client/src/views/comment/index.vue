<script lang="ts" setup>
import type { AdminCommentItem, CommentListQuery, CommentStatus } from '#/api/comment';

import { computed, h, onMounted, reactive, ref } from 'vue';

import dayjs from 'dayjs';

import {
  Avatar,
  Button,
  Card,
  Col,
  Divider,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'ant-design-vue';

import {
  deleteCommentApi,
  getCommentListApi,
  getCommentStatsApi,
  updateCommentStatusApi,
} from '#/api/comment';

defineOptions({ name: 'CommentList' });

// ---------- 统计卡片 ----------
const stats = ref({
  byStatus: { pending: 0, approved: 0, rejected: 0 } as Record<CommentStatus, number>,
  todayCount: 0,
  total: 0,
});
async function loadStats() {
  try { stats.value = await getCommentStatsApi(); } catch {}
}

// ---------- 表格状态 ----------
const loading = ref(false);
const data = ref<AdminCommentItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(15);

// ---------- 搜索条件 ----------
const searchForm = reactive<CommentListQuery>({
  keyword: '',
  status: undefined,
  blogId: '',
});

const statusOptions = [
  { value: 'pending', label: '待审核' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已拒绝' },
];

const statusColor: Record<CommentStatus, string> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
};

// ---------- 加载 ----------
async function loadList() {
  loading.value = true;
  try {
    const res = await getCommentListApi({
      page: page.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword?.trim() || undefined,
      status: searchForm.status || undefined,
      blogId: searchForm.blogId?.trim() || undefined,
    });
    data.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

function handleSearch() { page.value = 1; loadList(); }
function handleReset() {
  searchForm.keyword = '';
  searchForm.status = undefined;
  searchForm.blogId = '';
  page.value = 1;
  loadList();
}
function handleTableChange(pag: any) {
  page.value = pag.current;
  pageSize.value = pag.pageSize;
  loadList();
}

// ---------- 操作 ----------
async function handleApprove(record: AdminCommentItem) {
  try {
    const res = await updateCommentStatusApi(record._id, 'approved');
    record.status = res.status as CommentStatus;
    message.success('已通过');
    loadStats();
  } catch (err: any) {
    message.error(err?.message || '操作失败');
  }
}

async function handleReject(record: AdminCommentItem) {
  try {
    const res = await updateCommentStatusApi(record._id, 'rejected');
    record.status = res.status as CommentStatus;
    message.success('已拒绝');
    loadStats();
  } catch (err: any) {
    message.error(err?.message || '操作失败');
  }
}

function handleDelete(record: AdminCommentItem) {
  const hasReplies = record.parentId === null && record.rootId === null;
  Modal.confirm({
    title: '确认删除',
    content: hasReplies
      ? '这是一条顶级评论，删除将连同其所有回复一并删除，确定继续？'
      : '确定要删除这条评论吗？',
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      await deleteCommentApi(record._id);
      message.success('删除成功');
      loadList();
      loadStats();
    },
  });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  return dayjs(iso).format('YYYY-MM-DD HH:mm');
}

function contentPreview(s: string, n = 40) {
  if (!s) return '-';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// ---------- 列 ----------
const columns = computed(() => [
  {
    title: '评论者',
    key: 'commenter',
    width: 180,
    customRender: ({ record }: { record: AdminCommentItem }) =>
      h('div', { class: 'flex items-center gap-2' }, [
        h(Avatar, {
          size: 28,
          src: record.userId?.avatar || undefined,
          alt: record.nickname,
        }, () => (record.nickname || '?').slice(0, 1)),
        h('div', { class: 'min-w-0' }, [
          h('div', { class: 'text-[13px] font-medium truncate' }, record.nickname || '匿名'),
          record.userId?.username
            ? h('div', { class: 'text-[11px] text-slate-400' }, `@${record.userId.username}`)
            : null,
        ]),
      ]),
  },
  {
    title: '内容',
    dataIndex: 'content',
    width: 260,
    customRender: ({ text, record }: { text: string; record: AdminCommentItem }) => {
      const nodes: any[] = [];
      if (record.replyToNickname) {
        nodes.push(
          h('span', { class: 'mr-1 text-[11px] text-brand-600' }, `@${record.replyToNickname}`),
        );
      }
      nodes.push(h('span', { class: 'text-[13px]' }, contentPreview(text, 50)));
      return h('div', { class: 'max-w-[260px]' }, nodes);
    },
  },
  {
    title: '所属文章',
    key: 'blog',
    width: 180,
    customRender: ({ record }: { record: AdminCommentItem }) =>
      record.blogId
        ? h('div', { class: 'max-w-[180px] truncate text-[13px] text-brand-600' }, record.blogId.title)
        : h('span', { class: 'text-slate-400' }, '—'),
  },
  {
    title: '邮箱',
    dataIndex: 'email',
    width: 160,
    ellipsis: true,
    customRender: ({ text }: { text: string }) => text || '—',
  },
  {
    title: 'IP',
    dataIndex: 'ip',
    width: 130,
    customRender: ({ text }: { text: string }) => text || '—',
  },
  {
    title: '状态',
    dataIndex: 'status',
    width: 110,
    customRender: ({ text }: { text: CommentStatus }) =>
      h(Tag, { color: statusColor[text] || 'default' }, () => {
        const m: Record<CommentStatus, string> = {
          pending: '待审核',
          approved: '已通过',
          rejected: '已拒绝',
        };
        return m[text];
      }),
  },
  {
    title: '发布时间',
    dataIndex: 'createdAt',
    width: 160,
    customRender: ({ text }: { text: string }) => fmtDate(text),
  },
  {
    title: '操作',
    key: 'action',
    width: 200,
    fixed: 'right' as const,
    customRender: ({ record }: { record: AdminCommentItem }) =>
      h(Space, {}, () => [
        record.status !== 'approved'
          ? h(Button, {
              type: 'link', size: 'small',
              onClick: () => handleApprove(record),
            }, () => '通过')
          : null,
        record.status !== 'rejected'
          ? h(Button, {
              type: 'link', size: 'small',
              onClick: () => handleReject(record),
            }, () => '拒绝')
          : null,
        h(Button, {
          type: 'link', size: 'small', danger: true,
          onClick: () => handleDelete(record),
        }, () => '删除'),
      ]),
  },
]);

onMounted(() => { loadStats(); loadList(); });
</script>

<template>
  <div class="p-4">
    <!-- 统计卡片 -->
    <Row :gutter="12" class="mb-4">
      <Col :span="6">
        <Card size="small">
          <div class="text-xs text-slate-500">待审核</div>
          <div class="mt-1 flex items-center justify-between">
            <span class="text-2xl font-bold text-amber-500">{{ stats.byStatus.pending }}</span>
            <Button
              size="small" type="link"
              @click="searchForm.status = 'pending'; handleSearch()"
            >查看</Button>
          </div>
        </Card>
      </Col>
      <Col :span="6">
        <Card size="small">
          <div class="text-xs text-slate-500">已通过</div>
          <div class="mt-1 flex items-center justify-between">
            <span class="text-2xl font-bold text-emerald-500">{{ stats.byStatus.approved }}</span>
            <Button
              size="small" type="link"
              @click="searchForm.status = 'approved'; handleSearch()"
            >查看</Button>
          </div>
        </Card>
      </Col>
      <Col :span="6">
        <Card size="small">
          <div class="text-xs text-slate-500">已拒绝</div>
          <div class="mt-1 flex items-center justify-between">
            <span class="text-2xl font-bold text-rose-500">{{ stats.byStatus.rejected }}</span>
            <Button
              size="small" type="link"
              @click="searchForm.status = 'rejected'; handleSearch()"
            >查看</Button>
          </div>
        </Card>
      </Col>
      <Col :span="6">
        <Card size="small">
          <div class="text-xs text-slate-500">今日新增</div>
          <div class="mt-1 flex items-center justify-between">
            <span class="text-2xl font-bold text-sky-500">{{ stats.todayCount }}</span>
            <span class="text-xs text-slate-400">共 {{ stats.total }} 条</span>
          </div>
        </Card>
      </Col>
    </Row>

    <Divider class="!my-3" />

    <!-- 搜索区 -->
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <Input
        v-model:value="searchForm.keyword"
        placeholder="搜索昵称 / 邮箱 / 内容"
        style="width: 260px"
        allow-clear
        @press-enter="handleSearch"
      />
      <Select
        v-model:value="searchForm.status"
        placeholder="审核状态"
        style="width: 140px"
        allow-clear
        :options="statusOptions"
      />
      <Input
        v-model:value="searchForm.blogId"
        placeholder="文章 ID"
        style="width: 180px"
        allow-clear
        @press-enter="handleSearch"
      />
      <Button type="primary" @click="handleSearch">搜索</Button>
      <Button @click="handleReset">重置</Button>
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
      :scroll="{ x: 1300 }"
      row-key="_id"
      @change="handleTableChange"
    />
  </div>
</template>
