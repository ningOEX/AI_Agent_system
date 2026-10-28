<script lang="ts" setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue';

import {
  Bot,
  Headphones,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  X,
} from 'lucide-vue-next';

import { type ChatFaq, fetchFaqs, fetchHistory, resetChatSession, sendChat } from '../api/chat';

defineOptions({ name: 'ChatWidget' });

interface Bubble {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  source?: string;
  createdAt?: string;
}

const open = ref(false);
const booting = ref(false);
const waiting = ref(false);
const awaitingAgent = ref(false); // 转人工后进入等待模式，自动回复暂停
const faqs = ref<ChatFaq[]>([]);
const messages = ref<Bubble[]>([]);
const followUps = ref<string[]>([]);
const input = ref('');
const bodyRef = ref<HTMLElement | null>(null);

let seq = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
const POLL_INTERVAL = 5000; // 5 秒轮询一次管理员回复

const WELCOME =
  '你好，我是小 Pulse 👋 可以点下面的常见问题，也可以直接输入你的疑问。';

function scrollToBottom() {
  nextTick(() => {
    const el = bodyRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

/** 生成当前 ISO 时间戳，用于消息 createdAt 字段 */
function nowIso(): string {
  return new Date().toISOString();
}

/** 最近一条管理员回复的 createdAt，用于轮询时判断是否有新的管理员回复 */
const lastAdminAt = ref('');

/** 轮询拉取历史，仅检测管理员新回复（source=admin）并追加，避免与本地消息重复 */
async function pollNewMessages() {
  if (waiting.value) return; // AI 回复中不轮询，避免冲突
  try {
    const history = await fetchHistory();
    const newAdminMsgs = history.filter(
      (h) => h.source === 'admin' && h.createdAt && h.createdAt > lastAdminAt.value,
    );
    if (!newAdminMsgs.length) return;
    for (const h of newAdminMsgs) {
      if (!h.content) continue;
      messages.value.push({
        id: ++seq,
        role: h.role,
        content: h.content,
        source: h.source,
        createdAt: h.createdAt,
      });
      lastAdminAt.value = h.createdAt;
    }
    scrollToBottom();
  } catch {
    // 轮询失败静默忽略
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(pollNewMessages, POLL_INTERVAL);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

onMounted(async () => {
  booting.value = true;
  try {
    const [faqList, history] = await Promise.all([fetchFaqs(), fetchHistory()]);
    faqs.value = faqList;
    // 将历史消息（含管理员回复）转为气泡，跳过空内容
    for (const h of history) {
      if (!h.content) continue;
      messages.value.push({
        id: ++seq,
        role: h.role,
        content: h.content,
        source: h.source,
        createdAt: h.createdAt,
      });
      if (h.source === 'admin' && h.createdAt && h.createdAt > lastAdminAt.value) {
        lastAdminAt.value = h.createdAt;
      }
    }
  } catch {
    faqs.value = [];
  } finally {
    booting.value = false;
  }
});

onUnmounted(stopPolling);

function toggle() {
  open.value = !open.value;
  if (open.value) {
    scrollToBottom();
    startPolling();
    // 每次打开弹窗都重置等待模式：后端是幂等的（awaitingAgent=false 不变 false），
    // 这样即使页面刷新后前端丢失 awaitingAgent 状态，也能确保后端恢复 AI 自动回复
    if (awaitingAgent.value) awaitingAgent.value = false;
    resetChatSession();
  } else {
    stopPolling();
  }
}

async function submit(
  text: string,
  opts: { type?: 'text' | 'option' | 'handoff'; faqId?: string } = {},
) {
  const content = text.trim();
  if (!content || waiting.value) return;

  followUps.value = [];
  messages.value.push({ id: ++seq, role: 'user', content, createdAt: nowIso() });
  input.value = '';
  waiting.value = true;
  scrollToBottom();

  try {
    let botIndex = -1;
    const res = await sendChat({ message: content, ...opts }, (delta) => {
      if (botIndex < 0) {
        // 第一块数据到达，插入气泡
        messages.value.push({ id: ++seq, role: 'assistant', content: '', createdAt: nowIso() });
        botIndex = messages.value.length - 1;
        waiting.value = false;
      }
      messages.value[botIndex].content += delta;
      scrollToBottom();
    });

    // waiting + silent：后端已静默存库，不插入任何 assistant 气泡
    if (res.silent) {
      // 清空输入框已在前面做了，此处无需额外 UI 操作，user 气泡即"已送达"的确认
    } else if (botIndex < 0) {
      messages.value.push({
        id: ++seq,
        role: 'assistant',
        content: res.full || '（没有获取到回答）',
        source: res.source,
        createdAt: nowIso(),
      });
    } else {
      messages.value[botIndex].source = res.source;
    }

    followUps.value = res.followUps || [];

    // 等待模式状态管理
    if (res.source === 'handoff') {
      awaitingAgent.value = true;
    }
  } catch (err) {
    messages.value.push({
      id: ++seq,
      role: 'assistant',
      content:
        (err as Error)?.message || '服务暂时不可用，请稍后再试或联系管理员。',
      source: 'fallback',
      createdAt: nowIso(),
    });
  } finally {
    waiting.value = false;
    scrollToBottom();
  }
}

function pickOption(faq: ChatFaq) {
  submit(faq.question, { type: 'option', faqId: faq._id });
}

function pickFollowUp(text: string) {
  submit(text, { type: 'text' });
}

function handoff() {
  submit('转人工', { type: 'handoff' });
}

function onEnter(event: KeyboardEvent) {
  if (event.shiftKey) return;
  event.preventDefault();
  submit(input.value);
}
</script>

<template>
  <!-- 悬浮按钮 -->
  <button
    v-if="!open"
    type="button"
    class="fixed bottom-6 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/40 transition-all hover:scale-105 hover:bg-brand-600"
    aria-label="打开智能客服"
    @click="toggle"
  >
    <MessageCircle class="h-6 w-6" />
    <span
      class="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-white dark:ring-slate-900"
    />
  </button>

  <!-- 聊天面板 -->
  <div
    v-else
    class="fixed bottom-6 right-5 z-50 flex h-[560px] max-h-[calc(100vh-3rem)] w-[360px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
  >
    <!-- 头部 -->
    <header
      class="flex items-center gap-3 bg-gradient-to-r from-brand-600 to-accent-500 px-4 py-3 text-white"
    >
      <div
        class="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm"
      >
        <Sparkles class="h-5 w-5" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-semibold leading-tight">小 Pulse · 智能客服</div>
        <div class="flex items-center gap-1.5 text-[11px] text-white/80">
          <span
            :class="
              awaitingAgent
                ? 'h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse'
                : 'h-1.5 w-1.5 rounded-full bg-emerald-300'
            "
          />
          {{ awaitingAgent ? '等待人工回复 · 请稍等' : '在线 · 通常秒回' }}
        </div>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-white/85 transition-colors hover:bg-white/15"
        @click="handoff"
      >
        <Headphones class="h-3.5 w-3.5" />
        转人工
      </button>
      <button
        type="button"
        class="rounded-md p-1 text-white/85 transition-colors hover:bg-white/15"
        aria-label="关闭"
        @click="toggle"
      >
        <X class="h-4 w-4" />
      </button>
    </header>

    <!-- 消息区 -->
    <div
      ref="bodyRef"
      class="flex-1 space-y-3 overflow-y-auto bg-slate-50/70 px-3.5 py-4 dark:bg-slate-950/40"
    >
      <!-- 欢迎语 -->
      <div class="flex items-start gap-2">
        <div
          class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-900/50 dark:text-brand-300"
        >
          <Bot class="h-4 w-4" />
        </div>
        <p
          class="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200"
        >
          {{ WELCOME }}
        </p>
      </div>

      <!-- 快捷选项 -->
      <div v-if="messages.length === 0" class="space-y-2 pl-9">
        <div
          v-if="booting"
          class="flex items-center gap-1.5 text-xs text-slate-400"
        >
          <Loader2 class="h-3 w-3 animate-spin" /> 正在加载常见问题…
        </div>
        <button
          v-for="faq in faqs.slice(0, 4)"
          :key="faq._id"
          type="button"
          class="block w-full rounded-xl border border-brand-200 bg-white px-3 py-2 text-left text-[13px] text-slate-700 transition-all hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-brand-500 dark:hover:bg-slate-700"
          @click="pickOption(faq)"
        >
          {{ faq.question }}
        </button>
      </div>

      <!-- 对话气泡 -->
      <template v-for="m in messages" :key="m.id">
        <div v-if="m.role === 'user'" class="flex justify-end">
          <p
            class="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-brand-500 px-3.5 py-2.5 text-sm leading-relaxed text-white shadow-sm"
          >
            {{ m.content }}
          </p>
        </div>
        <div v-else class="flex items-start gap-2">
          <div
            class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            :class="
              m.source === 'admin'
                ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-300'
                : m.source === 'waiting'
                  ? 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                  : 'bg-brand-100 text-brand-600 dark:bg-brand-900/50 dark:text-brand-300'
            "
          >
            <Bot class="h-4 w-4" />
          </div>
          <div class="max-w-[85%]">
            <div
              v-if="m.source === 'admin'"
              class="mb-0.5 text-[10px] font-medium text-purple-500 dark:text-purple-400"
            >
              客服回复
            </div>
            <p
              class="whitespace-pre-wrap rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm leading-relaxed shadow-sm"
              :class="
                m.source === 'admin'
                  ? 'bg-purple-50 text-purple-900 dark:bg-purple-900/30 dark:text-purple-100'
                  : m.source === 'waiting'
                    ? 'bg-slate-50 text-slate-500 italic dark:bg-slate-700 dark:text-slate-400'
                    : 'bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-200'
              "
            >
              {{ m.content }}
            </p>
          </div>
        </div>
      </template>

      <!-- 等待首字 -->
      <div v-if="waiting" class="flex items-start gap-2">
        <div
          class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-900/50 dark:text-brand-300"
        >
          <Bot class="h-4 w-4" />
        </div>
        <div
          class="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-sm dark:bg-slate-800"
        >
          <span class="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
          <span
            class="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
            style="animation-delay: 0.15s"
          />
          <span
            class="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
            style="animation-delay: 0.3s"
          />
        </div>
      </div>

      <!-- 追问建议 -->
      <div v-if="followUps.length" class="space-y-2 pl-9">
        <button
          v-for="(q, i) in followUps"
          :key="i"
          type="button"
          class="block rounded-full border border-brand-200 bg-white px-3 py-1.5 text-left text-xs text-brand-600 transition-colors hover:bg-brand-50 dark:border-slate-700 dark:bg-slate-800 dark:text-brand-300 dark:hover:bg-slate-700"
          @click="pickFollowUp(q)"
        >
          {{ q }}
        </button>
      </div>
    </div>

    <!-- 输入区 -->
    <div
      class="flex items-end gap-2 border-t border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900"
    >
      <textarea
        v-model="input"
        rows="1"
        maxlength="1000"
        placeholder="输入你的问题…（Enter 发送）"
        class="max-h-24 min-h-[38px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-brand-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-brand-500"
        @keydown.enter="onEnter"
      />
      <button
        type="button"
        class="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white transition-all hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="!input.trim() || waiting"
        aria-label="发送"
        @click="submit(input)"
      >
        <Loader2 v-if="waiting" class="h-4 w-4 animate-spin" />
        <Send v-else class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>
