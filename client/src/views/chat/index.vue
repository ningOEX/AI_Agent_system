<script lang="ts" setup>
import type { ChatSessionItem, FaqItem } from '#/api/chat';

import { computed, h, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue';

import {
  Button,
  Card,
  Drawer,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  message,
} from 'ant-design-vue';

import {
  batchDeleteChatSessionsApi,
  createFaqApi,
  deleteChatSessionApi,
  deleteFaqApi,
  getChatSessionDetailApi,
  getChatSessionsApi,
  getFaqListApi,
  markSessionHandledApi,
  replyChatSessionApi,
  updateFaqApi,
} from '#/api/chat';

defineOptions({ name: 'ChatManage' });

const activeTab = ref<'faq' | 'sessions'>('faq');

// source 枚举 → 管理员可读的中文标签
const SOURCE_LABEL: Record<string, string> = {
  option: '预设选项',
  faq: 'FAQ 命中',
  ai: 'AI 自动回复',
  fallback: '兜底回复',
  handoff: '转人工',
  waiting: '等待人工回复',
  admin: '管理员回复',
};
const sourceLabel = (s?: string) => (s ? SOURCE_LABEL[s] || s : '');

// ============ 高频问答 ============
const faqLoading = ref(false);
const faqList = ref<FaqItem[]>([]);
const faqModalOpen = ref(false);
const editingId = ref<string | null>(null);
const submitting = ref(false);

const faqForm = reactive({
  question: '',
  answer: '',
  category: '通用',
  keywords: '',
  followUps: '',
  order: 0,
  enabled: true,
});

const faqModalTitle = computed(() => (editingId.value ? '编辑问答' : '新增问答'));

async function loadFaqs() {
  faqLoading.value = true;
  try {
    const res = await getFaqListApi();
    faqList.value = res.list || [];
  } catch (err) {
    message.error((err as Error)?.message || '加载问答失败');
  } finally {
    faqLoading.value = false;
  }
}

function openCreate() {
  editingId.value = null;
  Object.assign(faqForm, {
    question: '',
    answer: '',
    category: '通用',
    keywords: '',
    followUps: '',
    order: 0,
    enabled: true,
  });
  faqModalOpen.value = true;
}

function openEdit(row: FaqItem) {
  editingId.value = row._id;
  Object.assign(faqForm, {
    question: row.question,
    answer: row.answer,
    category: row.category || '通用',
    keywords: (row.keywords || []).join('，'),
    followUps: (row.followUps || []).join('，'),
    order: row.order ?? 0,
    enabled: row.enabled,
  });
  faqModalOpen.value = true;
}

async function submitFaq() {
  if (!faqForm.question.trim() || !faqForm.answer.trim()) {
    message.warning('问题和答案都不能为空');
    return;
  }
  submitting.value = true;
  const payload = {
    question: faqForm.question.trim(),
    answer: faqForm.answer.trim(),
    category: faqForm.category.trim() || '通用',
    keywords: faqForm.keywords.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    followUps: faqForm.followUps.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    order: Number(faqForm.order) || 0,
    enabled: faqForm.enabled,
  };
  try {
    if (editingId.value) {
      await updateFaqApi(editingId.value, payload);
      message.success('已更新');
    } else {
      await createFaqApi(payload);
      message.success('已新增');
    }
    faqModalOpen.value = false;
    await loadFaqs();
  } catch (err) {
    message.error((err as Error)?.message || '保存失败');
  } finally {
    submitting.value = false;
  }
}

async function toggleFaq(row: FaqItem, checked: boolean) {
  try {
    await updateFaqApi(row._id, { enabled: checked });
    row.enabled = checked;
    message.success(checked ? '已启用' : '已停用');
  } catch (err) {
    message.error((err as Error)?.message || '操作失败');
  }
}

async function removeFaq(row: FaqItem) {
  try {
    await deleteFaqApi(row._id);
    message.success('已删除');
    await loadFaqs();
  } catch (err) {
    message.error((err as Error)?.message || '删除失败');
  }
}

const faqColumns = [
  { title: '排序', dataIndex: 'order', width: 70 },
  {
    title: '问题',
    dataIndex: 'question',
    ellipsis: true,
  },
  {
    title: '分类',
    dataIndex: 'category',
    width: 110,
    customRender: ({ text }: { text: string }) =>
      h(Tag, { color: 'blue' }, () => text || '通用'),
  },
  {
    title: '关键词',
    dataIndex: 'keywords',
    width: 220,
    customRender: ({ text }: { text: string[] }) =>
      text?.length ? text.map((k) => h(Tag, {}, () => k)) : '-',
  },
  { title: '命中', dataIndex: 'hitCount', width: 80 },
  {
    title: '启用',
    dataIndex: 'enabled',
    width: 80,
    customRender: ({ record }: { record: FaqItem }) =>
      h(Switch, {
        checked: record.enabled,
        size: 'small',
        onChange: (checked: boolean | string | number) => {
          toggleFaq(record, !!checked).catch(() => {});
        },
      }),
  },
  {
    title: '操作',
    width: 150,
    customRender: ({ record }: { record: FaqItem }) =>
      h(Space, {}, () => [
        h(
          Button,
          { type: 'link', size: 'small', onClick: () => openEdit(record) },
          () => '编辑',
        ),
        h(
          Popconfirm,
          {
            title: '确认删除该问答？',
            onConfirm: () => removeFaq(record),
          },
          () =>
            h(Button, { type: 'link', danger: true, size: 'small' }, () => '删除'),
        ),
      ]),
  },
];

// ============ 会话记录 ============
const sessionLoading = ref(false);
const sessions = ref<ChatSessionItem[]>([]);
const onlyUnhandled = ref(false);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);

const drawerOpen = ref(false);
const detail = ref<{
  sessionId: string;
  unhandled: boolean;
  messages: {
    _id: string;
    role: 'user' | 'assistant';
    content: string;
    source?: string;
    createdAt: string;
  }[];
} | null>(null);

// ============ 实时轮询 ============
const POLL_INTERVAL = 5000;
let detailPollTimer: ReturnType<typeof setInterval> | null = null;
let listPollTimer: ReturnType<typeof setInterval> | null = null;

/** 拉取会话详情，增量追加新消息（按 _id 比较），同时更新 unhandled 状态 */
async function refreshDetail() {
  if (!detail.value) return;
  try {
    const res = await getChatSessionDetailApi(detail.value.sessionId);
    const serverMsgs = res.messages || [];
    const localIds = new Set(detail.value.messages.map((m) => m._id));
    const newMsgs = serverMsgs.filter((m) => !localIds.has(m._id));
    if (newMsgs.length) {
      detail.value.messages.push(...newMsgs);
      scrollDetailToBottom();
    }
    // 同步 unhandled 状态
    if (res.unhandled !== detail.value.unhandled) {
      detail.value.unhandled = res.unhandled;
      const row = sessions.value.find((s) => s.sessionId === detail.value?.sessionId);
      if (row) row.unhandled = res.unhandled;
    }
  } catch {
    // 轮询失败静默忽略
  }
}

/** 将抽屉消息区滚动到底部 */
function scrollDetailToBottom() {
  nextTick(() => {
    const body = document.querySelector('.ant-drawer-body');
    if (body) body.scrollTop = body.scrollHeight;
  });
}

function startDetailPolling() {
  stopDetailPolling();
  detailPollTimer = setInterval(refreshDetail, POLL_INTERVAL);
}

function stopDetailPolling() {
  if (detailPollTimer) {
    clearInterval(detailPollTimer);
    detailPollTimer = null;
  }
}

/** 刷新会话列表（用于实时检测新会话 / unhandled 状态变化） */
async function refreshSessions() {
  if (activeTab.value !== 'sessions') return;
  try {
    const res = await getChatSessionsApi({
      page: page.value,
      pageSize: pageSize.value,
      unhandled: onlyUnhandled.value || undefined,
    });
    sessions.value = res.list || [];
    total.value = res.total || 0;
  } catch {
    // 轮询失败静默忽略
  }
}

function startListPolling() {
  stopListPolling();
  listPollTimer = setInterval(refreshSessions, POLL_INTERVAL);
}

function stopListPolling() {
  if (listPollTimer) {
    clearInterval(listPollTimer);
    listPollTimer = null;
  }
}

onUnmounted(() => {
  stopDetailPolling();
  stopListPolling();
});

// ============ 批量删除 ============
const selectedRowKeys = ref<string[]>([]);

function onSelectChange(keys: (string | number)[]) {
  selectedRowKeys.value = keys.map(String);
}

async function batchDeleteSessions() {
  if (!selectedRowKeys.value.length) return;
  try {
    const res = await batchDeleteChatSessionsApi(selectedRowKeys.value);
    message.success(`已删除 ${res.deleted} 条会话`);
    selectedRowKeys.value = [];
    await loadSessions();
  } catch (err) {
    message.error((err as Error)?.message || '批量删除失败');
  }
}

// ============ 管理员回复 ============
const replyText = ref('');
const replying = ref(false);

async function sendReply() {
  if (!detail.value) return;
  const text = replyText.value.trim();
  if (!text) {
    message.warning('请输入回复内容');
    return;
  }
  replying.value = true;
  try {
    await replyChatSessionApi(detail.value.sessionId, text);
    replyText.value = '';
    message.success('回复已发送');
    // 重新拉取详情，同步服务端真实 _id，避免轮询时重复追加
    const res = await getChatSessionDetailApi(detail.value.sessionId);
    detail.value.messages = res.messages || [];
    detail.value.unhandled = res.unhandled;
    const row = sessions.value.find((s) => s.sessionId === detail.value?.sessionId);
    if (row) row.unhandled = res.unhandled;
    scrollDetailToBottom();
  } catch (err) {
    message.error((err as Error)?.message || '回复失败');
  } finally {
    replying.value = false;
  }
}

async function loadSessions() {
  sessionLoading.value = true;
  try {
    const res = await getChatSessionsApi({
      page: page.value,
      pageSize: pageSize.value,
      unhandled: onlyUnhandled.value || undefined,
    });
    sessions.value = res.list || [];
    total.value = res.total || 0;
  } catch (err) {
    message.error((err as Error)?.message || '加载会话失败');
  } finally {
    sessionLoading.value = false;
  }
}

async function openDetail(row: ChatSessionItem) {
  try {
    const res = await getChatSessionDetailApi(row.sessionId);
    detail.value = {
      sessionId: res.sessionId,
      unhandled: res.unhandled,
      messages: res.messages || [],
    };
    drawerOpen.value = true;
    startDetailPolling();
    scrollDetailToBottom();
  } catch (err) {
    message.error((err as Error)?.message || '加载会话详情失败');
  }
}

async function markHandled(row: ChatSessionItem) {
  try {
    await markSessionHandledApi(row.sessionId);
    message.success('已标记为已处理');
    await loadSessions();
  } catch (err) {
    message.error((err as Error)?.message || '操作失败');
  }
}

async function removeSession(row: ChatSessionItem) {
  try {
    await deleteChatSessionApi(row.sessionId);
    message.success('已删除');
    await loadSessions();
  } catch (err) {
    message.error((err as Error)?.message || '删除失败');
  }
}

const sessionColumns = [
  {
    title: '会话 ID',
    dataIndex: 'sessionId',
    width: 220,
    customRender: ({ text }: { text: string }) =>
      h('span', { class: 'font-mono text-xs text-slate-500' }, text?.slice(0, 18)),
  },
  { title: '消息数', dataIndex: 'messageCount', width: 90 },
  {
    title: '最后一条',
    dataIndex: 'lastMessage',
    ellipsis: true,
    customRender: ({ text }: { text: string }) => text || '-',
  },
  {
    title: '最后活跃',
    dataIndex: 'lastMessageAt',
    width: 170,
    customRender: ({ text }: { text: string }) =>
      text ? new Date(text).toLocaleString() : '-',
  },
  {
    title: '状态',
    dataIndex: 'unhandled',
    width: 110,
    customRender: ({ record }: { record: ChatSessionItem }) =>
      record.unhandled
        ? h(Tag, { color: 'red' }, () => '待跟进')
        : h(Tag, { color: 'green' }, () => '已处理'),
  },
  {
    title: '操作',
    width: 210,
    customRender: ({ record }: { record: ChatSessionItem }) =>
      h(Space, {}, () => [
        h(
          Button,
          { type: 'link', size: 'small', onClick: () => openDetail(record) },
          () => '查看',
        ),
        record.unhandled
          ? h(
              Button,
              {
                type: 'link',
                size: 'small',
                onClick: () => markHandled(record),
              },
              () => '标记已处理',
            )
          : null,
        h(
          Popconfirm,
          { title: '确认删除该会话？', onConfirm: () => removeSession(record) },
          () => h(Button, { type: 'link', danger: true, size: 'small' }, () => '删除'),
        ),
      ]),
  },
];

function onPageChange(nextPage: number, nextSize: number) {
  page.value = nextPage;
  pageSize.value = nextSize;
  loadSessions();
}

function onTabChange(key: string | number) {
  activeTab.value = key as 'faq' | 'sessions';
  if (activeTab.value === 'sessions') {
    if (sessions.value.length === 0) loadSessions();
    startListPolling();
  } else {
    stopListPolling();
  }
}

function onDrawerClose() {
  stopDetailPolling();
}

onMounted(loadFaqs);
</script>

<template>
  <div class="p-4">
    <Card :bordered="false">
      <Tabs :active-key="activeTab" @change="onTabChange">
        <Tabs.TabPane key="faq" tab="高频问答">
          <div class="mb-3 flex items-center gap-2">
            <Button type="primary" @click="openCreate">+ 新增问答</Button>
            <Button @click="loadFaqs">刷新</Button>
            <span class="text-xs text-slate-400">
              预设问答优先于 AI 回答，命中后直接返回、不消耗模型额度
            </span>
          </div>
          <Table
            row-key="_id"
            size="middle"
            :loading="faqLoading"
            :columns="faqColumns"
            :data-source="faqList"
            :pagination="false"
          />
        </Tabs.TabPane>

        <Tabs.TabPane key="sessions" tab="会话记录">
          <div class="mb-3 flex items-center gap-3">
            <Button @click="loadSessions">刷新</Button>
            <Popconfirm
              :disabled="!selectedRowKeys.length"
              :title="`确认删除选中的 ${selectedRowKeys.length} 条会话？此操作不可恢复`"
              @confirm="batchDeleteSessions"
            >
              <Button danger :disabled="!selectedRowKeys.length">
                批量删除{{ selectedRowKeys.length ? `（${selectedRowKeys.length}）` : '' }}
              </Button>
            </Popconfirm>
            <span class="flex items-center gap-2 text-sm text-slate-500">
              只看待跟进
              <Switch
                v-model:checked="onlyUnhandled"
                size="small"
                @change="() => { page = 1; loadSessions(); }"
              />
            </span>
          </div>
          <Table
            row-key="sessionId"
            size="middle"
            :loading="sessionLoading"
            :columns="sessionColumns"
            :data-source="sessions"
            :row-selection="{
              selectedRowKeys,
              onChange: onSelectChange,
            }"
            :pagination="{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              onChange: onPageChange,
            }"
          />
        </Tabs.TabPane>
      </Tabs>
    </Card>

    <!-- 问答编辑弹窗 -->
    <Modal
      v-model:open="faqModalOpen"
      :title="faqModalTitle"
      :confirm-loading="submitting"
      width="640px"
      ok-text="保存"
      cancel-text="取消"
      @ok="submitFaq"
    >
      <div class="space-y-3 py-2">
        <div>
          <label class="mb-1 block text-sm font-medium">问题</label>
          <Input v-model:value="faqForm.question" placeholder="用户会怎么问？" :maxlength="120" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium">答案</label>
          <Input.TextArea
            v-model:value="faqForm.answer"
            :rows="4"
            placeholder="直接返回给用户的答案"
            :maxlength="2000"
          />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="mb-1 block text-sm font-medium">分类</label>
            <Input v-model:value="faqForm.category" placeholder="如：使用指南" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium">排序（越小越靠前）</label>
            <Input v-model:value.number="faqForm.order" type="number" />
          </div>
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium">关键词</label>
          <Input
            v-model:value="faqForm.keywords"
            placeholder="逗号分隔，如：评论，审核，看不到"
          />
          <p class="mt-1 text-xs text-slate-400">
            用户输入包含关键词时直接命中，无需调用大模型
          </p>
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium">追问建议</label>
          <Input
            v-model:value="faqForm.followUps"
            placeholder="逗号分隔，回答后展示给用户点击"
          />
        </div>
        <div class="flex items-center gap-2">
          <label class="text-sm font-medium">启用</label>
          <Switch v-model:checked="faqForm.enabled" />
        </div>
      </div>
    </Modal>

    <!-- 会话详情抽屉 -->
    <Drawer
      v-model:open="drawerOpen"
      width="480"
      placement="right"
      @close="onDrawerClose"
    >
      <template #title>
        <span class="flex items-center gap-2">
          会话详情
          <span class="flex items-center gap-1 text-xs font-normal text-green-600">
            <span class="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500"></span>
            实时
          </span>
        </span>
      </template>
      <div v-if="detail" class="space-y-3">
        <div class="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          <div class="font-mono break-all">会话 ID：{{ detail.sessionId }}</div>
          <div class="mt-1">
            状态：
            <Tag :color="detail.unhandled ? 'red' : 'green'">
              {{ detail.unhandled ? '待跟进' : '已处理' }}
            </Tag>
          </div>
        </div>
        <div class="space-y-2">
          <div
            v-for="msg in detail.messages"
            :key="msg._id"
            class="flex"
            :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
          >
            <div
              class="max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm"
              :class="
                msg.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : msg.source === 'admin'
                    ? 'bg-purple-100 text-purple-900 ring-1 ring-purple-200'
                    : 'bg-slate-100 text-slate-700'
              "
            >
              <div
                v-if="msg.source === 'admin'"
                class="mb-1 text-[10px] font-semibold text-purple-500"
              >
                管理员回复
              </div>
              {{ msg.content }}
              <div
                v-if="msg.role === 'assistant' && msg.source && msg.source !== 'admin'"
                class="mt-1 text-[10px] opacity-60"
              >
                来源：{{ sourceLabel(msg.source) }}
              </div>
            </div>
          </div>
        </div>

        <!-- 管理员回复输入框 -->
        <div class="sticky bottom-0 mt-4 border-t border-slate-100 pt-3">
          <Input.TextArea
            v-model:value="replyText"
            :rows="2"
            placeholder="输入回复内容，发送后用户下次打开客服即可看到"
            :maxlength="2000"
            :disabled="replying"
            @press-enter="sendReply"
          />
          <div class="mt-2 flex justify-end">
            <Button
              type="primary"
              :loading="replying"
              @click="sendReply"
            >
              发送回复
            </Button>
          </div>
        </div>
      </div>
    </Drawer>
  </div>
</template>
