<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  CalendarDays,
  Eye,
  FileText,
  Lock,
  LogIn,
  PenLine,
  Sparkles,
  User,
} from 'lucide-vue-next';

import {
  CMS_URL,
  getMyBlogsApi,
  getStoredUser,
  goLogin,
  type MyBlogItem,
  type StoredUser,
} from '@/api';

const router = useRouter();
const user = ref<null | StoredUser>(getStoredUser());
const loading = ref(true);
const blogs = ref<MyBlogItem[]>([]);
const total = ref(0);

const STATUS_META: Record<MyBlogItem['status'], { cls: string; label: string }> = {
  published: {
    label: '已发布',
    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  draft: {
    label: '草稿',
    cls: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  },
  scheduled: {
    label: '定时发布',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  },
};

const publishedCount = computed(() => blogs.value.filter((b) => b.status === 'published').length);
const pendingCount = computed(() => blogs.value.filter((b) => b.status !== 'published').length);
const totalViews = computed(() => blogs.value.reduce((sum, b) => sum + (b.views || 0), 0));

function formatDate(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function displayDate(b: MyBlogItem) {
  if (b.status === 'scheduled') return `${formatDate(b.scheduledAt)} 发布`;
  if (b.status === 'published') return formatDate(b.publishedAt);
  return `编辑于 ${formatDate(b.createdAt)}`;
}

function openBlog(b: MyBlogItem) {
  // 只有已发布的文章在前台可访问，草稿/定时文章不给跳
  if (b.status === 'published') {
    router.push(`/blog/${b._id}`);
  }
}

onMounted(async () => {
  if (!user.value) {
    loading.value = false;
    return;
  }
  try {
    const data = await getMyBlogsApi();
    blogs.value = data.items;
    total.value = data.total;
  } catch {
    // token 失效时拦截器已清登录态
    user.value = null;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="mx-auto max-w-5xl py-10">
    <!-- ============ 未登录态 ============ -->
    <div
      v-if="!user && !loading"
      class="flex flex-col items-center gap-4 rounded-2xl border border-slate-200/70 bg-white/70 px-6 py-20 text-center backdrop-blur dark:border-slate-700/60 dark:bg-slate-800/60"
    >
      <div class="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
        <Lock class="h-6 w-6" />
      </div>
      <p class="text-slate-600 dark:text-slate-300">登录后即可查看你发布过的文章</p>
      <button
        @click="goLogin"
        class="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-500"
      >
        <LogIn class="h-4 w-4" />
        去登录
      </button>
    </div>

    <template v-else>
      <!-- ============ 用户卡片 ============ -->
      <section
        class="flex flex-col items-start gap-5 rounded-2xl border border-slate-200/70 bg-white/70 p-6 backdrop-blur sm:flex-row sm:items-center dark:border-slate-700/60 dark:bg-slate-800/60"
      >
        <!-- 头像：有自定义头像用 OSS 图，否则渐变兜底 -->
        <img
          v-if="user?.avatar"
          :src="user.avatar"
          :alt="user.username"
          class="h-16 w-16 rounded-2xl object-cover ring-2 ring-brand-200 dark:ring-brand-800"
        />
        <div
          v-else
          class="flex h-16 w-16 items-center justify-center rounded-2xl bg-logo-gradient text-white shadow-lg shadow-brand-500/30"
        >
          <User class="h-7 w-7" />
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-xl font-bold text-slate-900 dark:text-white">{{ user?.username }}</h2>
            <span
              class="rounded-full px-2.5 py-0.5 text-xs font-medium"
              :class="user?.role === 'admin'
                ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'"
            >
              {{ user?.role === 'admin' ? '管理员' : '创作者' }}
            </span>
          </div>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
            共发布 {{ total }} 篇文章，累计 {{ totalViews }} 次阅读
          </p>
        </div>

        <a
          :href="CMS_URL"
          target="_blank"
          class="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-brand-300 hover:text-brand-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:text-brand-400"
        >
          <PenLine class="h-4 w-4" />
          去后台写文章
        </a>
      </section>

      <!-- ============ 统计 ============ -->
      <section class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div
          v-for="s in [
            { label: '文章总数', value: total },
            { label: '已发布', value: publishedCount },
            { label: '草稿 / 定时', value: pendingCount },
            { label: '累计阅读', value: totalViews },
          ]"
          :key="s.label"
          class="rounded-2xl border border-slate-200/70 bg-white/70 p-4 backdrop-blur dark:border-slate-700/60 dark:bg-slate-800/60"
        >
          <p class="text-2xl font-bold text-slate-900 dark:text-white">{{ s.value }}</p>
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{{ s.label }}</p>
        </div>
      </section>

      <!-- ============ 文章列表 ============ -->
      <section class="mt-8">
        <h3 class="mb-4 flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-100">
          <FileText class="h-4 w-4 text-brand-500" />
          我的文章
        </h3>

        <!-- 加载骨架 -->
        <div v-if="loading" class="space-y-3">
          <div
            v-for="i in 3"
            :key="i"
            class="h-24 animate-pulse rounded-2xl border border-slate-200/70 bg-white/50 dark:border-slate-700/60 dark:bg-slate-800/40"
          />
        </div>

        <!-- 空状态 -->
        <div
          v-else-if="blogs.length === 0"
          class="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/50 px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-800/40"
        >
          <Sparkles class="h-8 w-8 text-brand-400" />
          <p class="text-sm text-slate-500 dark:text-slate-400">还没有发布过文章，去后台写下第一篇吧</p>
        </div>

        <!-- 文章行 -->
        <div v-else class="space-y-3">
          <article
            v-for="b in blogs"
            :key="b._id"
            @click="openBlog(b)"
            class="group flex items-center gap-4 rounded-2xl border border-slate-200/70 bg-white/70 p-4 backdrop-blur transition dark:border-slate-700/60 dark:bg-slate-800/60"
            :class="b.status === 'published'
              ? 'cursor-pointer hover:border-brand-300 hover:shadow-lg hover:shadow-brand-500/5 dark:hover:border-brand-700'
              : 'opacity-80'"
          >
            <img
              v-if="b.coverImage"
              :src="b.coverImage"
              :alt="b.title"
              class="hidden h-20 w-32 shrink-0 rounded-xl object-cover sm:block"
            />
            <div
              v-else
              class="hidden h-20 w-32 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/15 to-brand-300/10 text-brand-400 sm:flex"
            >
              <FileText class="h-6 w-6" />
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <h4 class="truncate font-semibold text-slate-900 transition-colors group-hover:text-brand-600 dark:text-white dark:group-hover:text-brand-400">
                  {{ b.title }}
                </h4>
                <span
                  v-if="b.contentType === 'ai'"
                  class="shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                >
                  AI
                </span>
              </div>
              <p class="mt-1 line-clamp-1 text-sm text-slate-500 dark:text-slate-400">{{ b.summary }}</p>
              <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 dark:text-slate-500">
                <span
                  class="rounded-full px-2 py-0.5 font-medium"
                  :class="STATUS_META[b.status].cls"
                >
                  {{ STATUS_META[b.status].label }}
                </span>
                <span class="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-700/70">{{ b.category }}</span>
                <span class="inline-flex items-center gap-1">
                  <Eye class="h-3.5 w-3.5" />{{ b.views }}
                </span>
                <span class="inline-flex items-center gap-1">
                  <CalendarDays class="h-3.5 w-3.5" />{{ displayDate(b) }}
                </span>
              </div>
            </div>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>
