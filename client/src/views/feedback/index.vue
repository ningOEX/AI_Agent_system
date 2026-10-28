<script lang="ts" setup>
import type { FeedbackItem, FeedbackStatus, FeedbackType } from '#/api/feedback';

import { onMounted, reactive, ref } from 'vue';

import { PlusOutlined } from '@ant-design/icons-vue';
import {
  Button,
  Card,
  Descriptions,
  Drawer,
  Input,
  Modal,
  Select,
  Table,
  Tag,
  message,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import EmojiPicker from '#/components/EmojiPicker.vue';
import { insertEmojiAtCursor } from '#/utils/insert-emoji';

import {
  createFeedbackApi,
  getMyFeedbacksApi,
} from '#/api/feedback';

defineOptions({ name: 'FeedbackList' });

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
const counts = ref({ pending: 0, processing: 0, resolved: 0 });

async function loadList() {
  loading.value = true;
  try {
    const res = await getMyFeedbacksApi({
      page: page.value,
      pageSize: pageSize.value,
      status: statusFilter.value,
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
  { title: '标题', dataIndex: 'title' },
  { title: '类型', dataIndex: 'type', width: 110 },
  { title: '状态', dataIndex: 'status', width: 100 },
  { title: '提交时间', dataIndex: 'createdAt', width: 170 },
  { title: '处理结果', dataIndex: 'reply' },
  { title: '操作', dataIndex: 'action', width: 90 },
];

// ---------- 提交反馈 ----------
const submitOpen = ref(false);
const submitting = ref(false);
const form = reactive({
  type: 'bug' as FeedbackType,
  title: '',
  content: '',
});

function openSubmit() {
  form.type = 'bug';
  form.title = '';
  form.content = '';
  submitOpen.value = true;
}

async function handleEmoji(emoji: string) {
  await insertEmojiAtCursor('feedback-content', form.content, emoji, (value) => {
    form.content = value;
  });
}

async function submitFeedback() {
  if (!form.title.trim()) {
    message.warning('请填写问题标题');
    return;
  }
  if (!form.content.trim()) {
    message.warning('请描述具体问题');
    return;
  }

  submitting.value = true;
  try {
    await createFeedbackApi({
      title: form.title.trim(),
      content: form.content.trim(),
      type: form.type,
    });
    message.success('反馈已提交，管理员处理后会在这里显示结果');
    submitOpen.value = false;
    reload();
  } catch (err) {
    message.error((err as Error)?.message || '提交失败');
  } finally {
    submitting.value = false;
  }
}

// ---------- 详情 ----------
const detailOpen = ref(false);
const current = ref<FeedbackItem | null>(null);

function openDetail(record: Record<string, any>) {
  current.value = record as FeedbackItem;
  detailOpen.value = true;
}

onMounted(loadList);
</script>

<template>
  <div class="p-5">
    <Card :bordered="false">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="text-base font-semibold">问题反馈</div>
          <div class="mt-1 text-xs text-gray-500">
            遇到功能异常或有改进建议？提交后由管理员跟进处理，处理结果会显示在下方列表
          </div>
        </div>
        <Button type="primary" @click="openSubmit">
          <PlusOutlined />
          提交反馈
        </Button>
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-3">
        <Tag color="orange">待处理 {{ counts.pending }}</Tag>
        <Tag color="blue">处理中 {{ counts.processing }}</Tag>
        <Tag color="green">已解决 {{ counts.resolved }}</Tag>

        <div class="ml-auto flex items-center gap-2">
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
            <span v-else class="text-gray-400">暂无处理结果</span>
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <Button type="link" size="small" @click="openDetail(record)">
              查看
            </Button>
          </template>
        </template>
      </Table>
    </Card>

    <!-- 提交反馈 -->
    <Modal
      v-model:open="submitOpen"
      title="提交问题反馈"
      :confirm-loading="submitting"
      ok-text="提交"
      cancel-text="取消"
      @ok="submitFeedback"
    >
      <div class="space-y-4 py-2">
        <div>
          <label class="mb-1 block font-medium">问题类型</label>
          <Select v-model:value="form.type" :options="typeOptions" style="width: 100%" />
        </div>
        <div>
          <label class="mb-1 block font-medium">问题标题</label>
          <Input
            v-model:value="form.title"
            placeholder="一句话概括遇到的问题"
            :maxlength="100"
            show-count
          />
        </div>
        <div>
          <label class="mb-1 block font-medium">问题描述</label>
          <div class="relative">
            <Input.TextArea
              id="feedback-content"
              v-model:value="form.content"
              placeholder="请描述具体的操作步骤、期望结果和实际结果，便于管理员定位问题"
              :rows="5"
              :maxlength="2000"
              show-count
              style="padding-bottom: 30px"
            />
            <!-- 左下角表情包入口 -->
            <div class="absolute bottom-1 left-1">
              <EmojiPicker @select="handleEmoji" />
            </div>
          </div>
        </div>
      </div>
    </Modal>

    <!-- 反馈详情 -->
    <Drawer v-model:open="detailOpen" title="反馈详情" :width="520">
      <template v-if="current">
        <Descriptions :column="1" size="small" bordered>
          <Descriptions.Item label="标题">{{ current.title }}</Descriptions.Item>
          <Descriptions.Item label="类型">{{ typeText(current.type) }}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag :color="statusMeta[current.status].color">
              {{ statusMeta[current.status].text }}
            </Tag>
          </Descriptions.Item>
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
          <div class="mb-2 font-medium">处理结果</div>
          <div
            v-if="current.reply"
            class="whitespace-pre-wrap rounded-lg border border-green-100 bg-green-50 p-3 text-sm text-gray-700"
          >
            {{ current.reply }}
          </div>
          <div
            v-else
            class="rounded-lg border border-dashed border-gray-200 p-3 text-sm text-gray-400"
          >
            管理员还未给出处理结果，请耐心等待
          </div>
          <div v-if="current.repliedBy" class="mt-2 text-xs text-gray-400">
            处理人：{{ current.repliedBy }} ·
            {{ dayjs(current.repliedAt).format('YYYY-MM-DD HH:mm') }}
          </div>
        </div>
      </template>
    </Drawer>
  </div>
</template>
