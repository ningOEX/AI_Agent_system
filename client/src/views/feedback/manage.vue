<script lang="ts" setup>
import type { FeedbackItem, FeedbackStatus, FeedbackType } from '#/api/feedback';

import { onMounted, ref } from 'vue';

import {
  Button,
  Card,
  Descriptions,
  Drawer,
  Input,
  Select,
  Table,
  Tag,
  message,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import EmojiPicker from '#/components/EmojiPicker.vue';
import { insertEmojiAtCursor } from '#/utils/insert-emoji';

import {
  getAllFeedbacksApi,
  replyFeedbackApi,
} from '#/api/feedback';

defineOptions({ name: 'FeedbackManage' });

const typeOptions: { label: string; value: FeedbackType }[] = [
  { value: 'bug', label: '功能异常' },
  { value: 'feature', label: '功能建议' },
  { value: 'experience', label: '体验问题' },
  { value: 'content', label: '内容问题' },
  { value: 'other', label: '其他' },
];

const statusOptions = [
  { value: 'pending', label: '待处理' },
  { value: 'processing', label: '处理中' },
  { value: 'resolved', label: '已解决' },
];

const statusMeta: Record<FeedbackStatus, { color: string; text: string }> = {
  pending: { color: 'orange', text: '待处理' },
  processing: { color: 'blue', text: '处理中' },
  resolved: { color: 'green', text: '已解决' },
};

function typeText(type: FeedbackType) {
  return typeOptions.find((item) => item.value === type)?.label || '其他';
}

function statusTag(status: string) {
  return statusMeta[status as FeedbackStatus] || statusMeta.pending;
}

// ---------- 列表 ----------
const loading = ref(false);
const list = ref<FeedbackItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const statusFilter = ref<FeedbackStatus | undefined>(undefined);
const keyword = ref('');
const counts = ref({ pending: 0, processing: 0, resolved: 0 });

async function loadList() {
  loading.value = true;
  try {
    const res = await getAllFeedbacksApi({
      page: page.value,
      pageSize: pageSize.value,
      status: statusFilter.value,
      keyword: keyword.value.trim() || undefined,
    });
    list.value = res.list;
    total.value = res.total;
    counts.value = res.counts;
  } catch (err) {
    message.error((err as Error)?.message || '加载反馈列表失败');
  } finally {
    loading.value = false;
  }
}

function reload() {
  page.value = 1;
  loadList();
}

function handleTableChange(pagination: { current?: number }) {
  page.value = pagination.current || 1;
  loadList();
}

const columns = [
  { title: '提交人', dataIndex: 'username', width: 120 },
  { title: '标题', dataIndex: 'title' },
  { title: '类型', dataIndex: 'type', width: 110 },
  { title: '状态', dataIndex: 'status', width: 100 },
  { title: '提交时间', dataIndex: 'createdAt', width: 170 },
  { title: '处理结果', dataIndex: 'reply' },
  { title: '操作', dataIndex: 'action', width: 100 },
];

// ---------- 处理 ----------
const drawerOpen = ref(false);
const saving = ref(false);
const current = ref<FeedbackItem | null>(null);
const editStatus = ref<FeedbackStatus>('processing');
const editReply = ref('');

function openDrawer(record: Record<string, any>) {
  const item = record as FeedbackItem;
  current.value = item;
  editStatus.value = item.status;
  editReply.value = item.reply || '';
  drawerOpen.value = true;
}

async function handleReplyEmoji(emoji: string) {
  await insertEmojiAtCursor('feedback-reply', editReply.value, emoji, (value) => {
    editReply.value = value;
  });
}

async function saveReply() {
  if (!current.value) return;
  if (editStatus.value === 'resolved' && !editReply.value.trim()) {
    message.warning('标记为已解决时请填写处理结果');
    return;
  }

  saving.value = true;
  try {
    await replyFeedbackApi(current.value._id, {
      status: editStatus.value,
      reply: editReply.value.trim(),
    });
    message.success('处理结果已保存，用户可在「问题反馈」中看到');
    drawerOpen.value = false;
    loadList();
  } catch (err) {
    message.error((err as Error)?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

onMounted(loadList);
</script>

<template>
  <div class="p-5">
    <Card :bordered="false">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="text-base font-semibold">问题反馈处理</div>
          <div class="mt-1 text-xs text-gray-500">
            查看用户提交的问题，填写处理结果并更新状态，用户端会同步显示
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Input
            v-model:value="keyword"
            placeholder="搜索标题 / 内容 / 提交人"
            allow-clear
            style="width: 220px"
            @press-enter="reload"
          />
          <Select
            v-model:value="statusFilter"
            :options="statusOptions"
            allow-clear
            placeholder="全部状态"
            style="width: 140px"
            @change="reload"
          />
          <Button @click="reload">刷新</Button>
        </div>
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-3">
        <Tag color="orange">待处理 {{ counts.pending }}</Tag>
        <Tag color="blue">处理中 {{ counts.processing }}</Tag>
        <Tag color="green">已解决 {{ counts.resolved }}</Tag>
      </div>
    </Card>

    <Card class="mt-4" :bordered="false">
      <Table
        row-key="_id"
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :pagination="{
          current: page,
          pageSize,
          total,
          showSizeChanger: false,
          showTotal: (t: number) => `共 ${t} 条`,
        }"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'title'">
            <span class="font-medium">{{ record.title }}</span>
          </template>
          <template v-else-if="column.dataIndex === 'type'">
            <Tag :bordered="false">{{ typeText(record.type) }}</Tag>
          </template>
          <template v-else-if="column.dataIndex === 'status'">
            <Tag :color="statusTag(record.status).color">
              {{ statusTag(record.status).text }}
            </Tag>
          </template>
          <template v-else-if="column.dataIndex === 'createdAt'">
            {{ dayjs(record.createdAt).format('YYYY-MM-DD HH:mm') }}
          </template>
          <template v-else-if="column.dataIndex === 'reply'">
            <span v-if="record.reply" class="line-clamp-1 text-gray-600">
              {{ record.reply }}
            </span>
            <span v-else class="text-gray-400">未处理</span>
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <Button type="link" size="small" @click="openDrawer(record)">
              处理
            </Button>
          </template>
        </template>
      </Table>
    </Card>

    <!-- 处理抽屉 -->
    <Drawer v-model:open="drawerOpen" title="处理反馈" :width="560">
      <template v-if="current">
        <Descriptions :column="1" size="small" bordered>
          <Descriptions.Item label="提交人">{{ current.username }}</Descriptions.Item>
          <Descriptions.Item label="标题">{{ current.title }}</Descriptions.Item>
          <Descriptions.Item label="类型">{{ typeText(current.type) }}</Descriptions.Item>
          <Descriptions.Item label="提交时间">
            {{ dayjs(current.createdAt).format('YYYY-MM-DD HH:mm:ss') }}
          </Descriptions.Item>
        </Descriptions>

        <div class="mt-5">
          <div class="mb-2 font-medium">问题描述</div>
          <div class="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
            {{ current.content }}
          </div>
        </div>

        <div class="mt-5">
          <div class="mb-1 font-medium">处理状态</div>
          <Select v-model:value="editStatus" :options="statusOptions" style="width: 100%" />
        </div>

        <div class="mt-4">
          <div class="mb-1 font-medium">处理结果</div>
          <div class="relative">
            <Input.TextArea
              id="feedback-reply"
              v-model:value="editReply"
              placeholder="填写给用户的回复，例如：该问题已在最新版本修复，请刷新后重试"
              :rows="6"
              :maxlength="2000"
              show-count
              style="padding-bottom: 30px"
            />
            <!-- 左下角表情包入口 -->
            <div class="absolute bottom-1 left-1">
              <EmojiPicker @select="handleReplyEmoji" />
            </div>
          </div>
        </div>

        <div
          v-if="current.repliedBy"
          class="mt-2 text-xs text-gray-400"
        >
          上次处理：{{ current.repliedBy }} ·
          {{ dayjs(current.repliedAt).format('YYYY-MM-DD HH:mm') }}
        </div>

        <div class="mt-5 flex justify-end gap-2">
          <Button @click="drawerOpen = false">取消</Button>
          <Button type="primary" :loading="saving" @click="saveReply">
            保存处理结果
          </Button>
        </div>
      </template>
    </Drawer>
  </div>
</template>
