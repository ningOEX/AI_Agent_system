<script setup lang="ts">
import type { PublicComment, PublicCommentTree } from '@/api';

import { computed, ref, watch } from 'vue';

import dayjs from 'dayjs';

import {
  ChevronDown,
  ChevronUp,
  Loader2,
  LogIn,
  LogOut,
  MessageCircle,
  Send,
  User,
} from 'lucide-vue-next';

import {
  createPublicCommentApi,
  getPublicBlogCommentsApi,
  getStoredToken,
  getStoredUser,
  clearAuth,
  goLogin,
} from '@/api';

const props = defineProps<{ blogId: string }>();

// ---------- 登录态（只读 localStorage，不做内部登录） ----------
const token = ref<string | null>(getStoredToken());
const currentUser = ref(getStoredUser());
const isLoggedIn = computed(() => !!token.value);

function logout() {
  clearAuth();
  token.value = null;
  currentUser.value = null;
}

// ---------- 评论列表 ----------
const loading = ref(false);
const tree = ref<PublicCommentTree>({ total: 0, rootCount: 0, roots: [] });

async function load() {
  if (!props.blogId) return;
  loading.value = true;
  try { tree.value = await getPublicBlogCommentsApi(props.blogId); }
  finally { loading.value = false; }
}

watch(() => props.blogId, load, { immediate: true });

// ---------- 提交评论 ----------
const submitLoading = ref(false);
const content = ref('');
const replyParentId = ref<string | null>(null);
const replyTargetNickname = ref('');
const notice = ref('');

async function submit() {
  if (!isLoggedIn.value) { goLogin(); return; }
  if (!content.value.trim()) { notice.value = '内容不能为空'; return; }
  submitLoading.value = true;
  try {
    await createPublicCommentApi(props.blogId, {
      content: content.value.trim(),
      parentId: replyParentId.value ?? undefined,
    });
    content.value = '';
    replyParentId.value = null;
    replyTargetNickname.value = '';
    notice.value = '✅ 评论已提交，等待管理员审核后显示';
    setTimeout(() => { notice.value = ''; }, 5000);
    await load();
  } catch (err: any) {
    if (err?.response?.status === 401) {
      logout(); goLogin();
    } else {
      notice.value = err?.response?.data?.message || '提交失败，请稍后重试';
    }
  } finally { submitLoading.value = false; }
}

function startReply(comment: PublicComment) {
  if (!isLoggedIn.value) { goLogin(); return; }
  replyParentId.value = comment._id;
  replyTargetNickname.value = comment.nickname || comment.userId?.username || '匿名';
  content.value = '';
  setTimeout(() => {
    const el = document.getElementById('comment-input');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 50);
}

function cancelReply() {
  replyParentId.value = null;
  replyTargetNickname.value = '';
  content.value = '';
}

// ---------- 折叠 ----------
const expandedMap = ref<Record<string, boolean>>({});
function isExpanded(rootId: string) { return expandedMap.value[rootId] ?? false; }
function toggleExpand(rootId: string) { expandedMap.value[rootId] = !isExpanded(rootId); }

function displayReplies(root: PublicComment) {
  const replies = root.replies || [];
  if (replies.length <= 3) return replies;
  return isExpanded(root._id) ? replies : replies.slice(0, 3);
}

const totalCount = computed(() => tree.value.total);
const rootCount = computed(() => tree.value.rootCount);

function avatarOf(c: PublicComment) { return c.userId?.avatar || ''; }
function nameOf(c: PublicComment) { return c.userId?.username || c.nickname || '匿名'; }
function timeOf(c: PublicComment) { return dayjs(c.createdAt).format('YYYY-MM-DD HH:mm'); }
</script>

<template>
  <section class="mt-10 rounded-3xl border border-slate-200/60 bg-white/70 p-6 shadow-sm backdrop-blur sm:p-8 dark:border-slate-700/60 dark:bg-slate-800/70">
    <!-- 标题 + 登录状态 -->
    <div class="mb-6 flex flex-wrap items-center gap-3">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 text-white shadow-md">
        <MessageCircle class="h-5 w-5" />
      </div>
      <div class="flex-1">
        <h2 class="text-xl font-bold text-slate-900 dark:text-white">评论区</h2>
        <p class="text-xs text-slate-500">
          共 <span class="font-medium text-brand-600 dark:text-brand-400">{{ totalCount }}</span> 条评论
          · <span class="font-medium text-accent-500">{{ rootCount }}</span> 栋楼
        </p>
      </div>

      <!-- 登录状态胶囊 -->
      <template v-if="isLoggedIn">
        <div class="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800">
          <div class="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 text-[10px] font-bold text-white">
            {{ currentUser?.username?.[0]?.toUpperCase() || 'U' }}
          </div>
          <span class="font-medium text-slate-700 dark:text-slate-200">{{ currentUser?.username }}</span>
          <button @click="logout" class="ml-1 text-slate-400 hover:text-rose-500" title="退出登录">
            <LogOut class="h-3.5 w-3.5" />
          </button>
        </div>
      </template>
      <template v-else>
        <button
          @click="goLogin"
          class="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-600 to-accent-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:shadow-md"
        >
          <LogIn class="h-3.5 w-3.5" />
          登录后评论
        </button>
      </template>
    </div>

    <!-- 输入区 -->
    <div id="comment-input" class="mb-8 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/50">
      <div v-if="replyParentId" class="mb-3 flex items-center gap-2 text-xs text-brand-600 dark:text-brand-400">
        <span>正在回复 <strong>@{{ replyTargetNickname }}</strong></span>
        <button @click="cancelReply" class="ml-auto text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">取消</button>
      </div>

      <!-- 未登录提示卡 -->
      <template v-if="!isLoggedIn">
        <div class="flex items-center justify-between rounded-xl border border-dashed border-slate-300 bg-white p-4 dark:border-slate-600 dark:bg-slate-800">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-700">
              <User class="h-5 w-5" />
            </div>
            <div>
              <p class="text-sm font-medium text-slate-700 dark:text-slate-200">请先登录后发表评论</p>
              <p class="text-xs text-slate-400">点击下方按钮，将跳转到管理后台登录页</p>
            </div>
          </div>
          <button
            @click="goLogin"
            class="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-600 to-accent-500 px-4 py-2 text-xs font-semibold text-white shadow-md transition-all hover:brightness-110"
          >
            <LogIn class="h-3.5 w-3.5" />
            立即登录
          </button>
        </div>
      </template>

      <!-- 已登录输入框 -->
      <template v-else>
        <textarea
          v-model="content" rows="3"
          :placeholder="replyParentId ? `回复 @${replyTargetNickname} 的评论…（最多 1000 字）` : '写下你的想法…（最多 1000 字）'"
          class="w-full resize-none rounded-xl border border-transparent bg-white px-4 py-3 text-sm text-slate-800 shadow-inner outline-none transition-colors placeholder:text-slate-400 focus:border-brand-400 dark:bg-slate-800 dark:text-slate-100"
          maxlength="1000"
        />
        <div class="mt-3 flex items-center justify-between">
          <p class="text-[11px] text-slate-400">提交后需管理员审核通过才会显示</p>
          <button
            :disabled="submitLoading"
            @click="submit"
            class="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-600 to-accent-500 px-5 py-2 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
          >
            <Loader2 v-if="submitLoading" class="h-4 w-4 animate-spin" />
            <Send v-else class="h-4 w-4" />
            提交
          </button>
        </div>
      </template>

      <p v-if="notice" class="mt-3 text-sm text-brand-600 dark:text-brand-400">{{ notice }}</p>
    </div>

    <!-- 加载 -->
    <div v-if="loading" class="flex items-center justify-center py-16 text-slate-400">
      <Loader2 class="h-5 w-5 animate-spin" />
      <span class="ml-2 text-sm">加载评论…</span>
    </div>

    <!-- 空 -->
    <div v-else-if="!tree.roots.length" class="rounded-2xl border border-dashed border-slate-300 bg-white/40 py-16 text-center text-slate-400">
      <MessageCircle class="mx-auto mb-3 h-10 w-10 opacity-30" />
      <p class="text-sm">还没有人评论，来做第一个吧 ✨</p>
    </div>

    <!-- 评论列表 -->
    <div v-else class="space-y-6">
      <div
        v-for="root in tree.roots" :key="root._id"
        class="rounded-2xl border border-slate-200/60 bg-white/80 p-4 transition-colors hover:border-brand-300 dark:border-slate-700/60 dark:bg-slate-800/80"
      >
        <div class="flex gap-3">
          <img
            v-if="avatarOf(root)" :src="avatarOf(root)" :alt="nameOf(root)"
            class="h-10 w-10 flex-shrink-0 rounded-full object-cover ring-2 ring-white dark:ring-slate-900"
          />
          <div
            v-else
            class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 text-white"
          >
            <User class="h-5 w-5" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span class="font-semibold text-slate-800 dark:text-slate-200">{{ nameOf(root) }}</span>
              <span>{{ timeOf(root) }}</span>
              <button
                @click="startReply(root)"
                class="ml-auto inline-flex items-center gap-1 text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400"
              >回复</button>
            </div>
            <p class="mt-1.5 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-slate-700 dark:text-slate-200">
              {{ root.content }}
            </p>
          </div>
        </div>

        <!-- 回复楼 -->
        <div
          v-if="root.replyCount && root.replyCount! > 0"
          class="mt-3 ml-[52px] space-y-3 rounded-xl bg-slate-50/70 p-3 dark:bg-slate-900/40"
        >
          <div
            v-for="rep in displayReplies(root)" :key="rep._id"
            class="flex gap-2.5 rounded-lg bg-white/80 p-2.5 dark:bg-slate-800/80"
          >
            <img
              v-if="avatarOf(rep)" :src="avatarOf(rep)" :alt="nameOf(rep)"
              class="h-7 w-7 flex-shrink-0 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700"
            />
            <div
              v-else
              class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 text-white"
            >
              <User class="h-3.5 w-3.5" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                <span class="font-medium text-slate-700 dark:text-slate-200">{{ nameOf(rep) }}</span>
                <span v-if="rep.replyToNickname" class="text-slate-400">
                  → <span class="text-brand-600 dark:text-brand-400">@{{ rep.replyToNickname }}</span>
                </span>
                <span class="ml-auto">{{ timeOf(rep) }}</span>
              </div>
              <p class="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
                {{ rep.content }}
              </p>
              <button
                @click="startReply(rep)"
                class="mt-1 text-[11px] text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400"
              >回复</button>
            </div>
          </div>

          <!-- 折叠按钮 -->
          <div v-if="(root.replyCount || 0) > 3" class="flex justify-center">
            <button
              @click="toggleExpand(root._id)"
              class="inline-flex items-center gap-1 text-xs text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400"
            >
              <template v-if="isExpanded(root._id)">
                <ChevronUp class="h-3.5 w-3.5" /> 收起 ({{ root.replyCount }} 条回复)
              </template>
              <template v-else>
                <ChevronDown class="h-3.5 w-3.5" /> 展开全部 {{ root.replyCount }} 条回复
              </template>
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
