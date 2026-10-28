<script setup lang="ts">
import type { PublicBlogDetail } from '@/api';

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import dayjs from 'dayjs';
import MarkdownIt from 'markdown-it';

import CommentSection from '@/components/CommentSection.vue';

import {
  ArrowLeft,
  Calendar,
  Eye,
  FolderOpen,
  Hash,
  List,
  Loader2,
  MessageCircle,
  Sparkles,
  User,
} from 'lucide-vue-next';

import { getPublicBlogDetailApi } from '@/api';

defineOptions({ name: 'BlogDetail' });

const route = useRoute();
const router = useRouter();

const id = computed(() => route.params.id as string);
const loading = ref(true);
const notFound = ref(false);
const blog = ref<PublicBlogDetail | null>(null);

// ---------- Markdown 渲染：自动给 heading 加 id ----------
const md = new MarkdownIt({ html: true, linkify: true, breaks: false });
const slugify = (s: string) =>
  s.toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');

md.renderer.rules.heading_open = (tokens, idx, options, _env, self) => {
  const token = tokens[idx];
  const title = tokens[idx + 1]?.content || '';
  const slug = slugify(title) || `section-${idx}`;
  token.attrSet('id', slug);
  token.attrSet('class', `heading-${token.tag}`);
  return self.renderToken(tokens, idx, options);
};

const htmlContent = computed(() =>
  blog.value?.content ? md.render(blog.value.content) : '',
);

// ---------- TOC 目录 ----------
interface TocItem { id: string; text: string; level: number; }
const toc = ref<TocItem[]>([]);
const activeId = ref<string>('');
const activeBar = ref<{ top: number; height: number }>({ top: 0, height: 20 });

function updateActiveBar() {
  const nav = document.querySelector<HTMLElement>('[data-toc-nav]');
  if (!nav || !activeId.value) return;
  const btn = nav.querySelector<HTMLElement>(`button[data-toc-id="${activeId.value}"]`);
  if (!btn) return;
  const navRect = nav.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  activeBar.value = {
    top: btnRect.top - navRect.top + nav.scrollTop,
    height: btnRect.height,
  };
}

function buildToc() {
  const article = document.querySelector<HTMLElement>('[data-article-body]');
  if (!article) { toc.value = []; return; }
  const headings = article.querySelectorAll<HTMLElement>('h1, h2, h3');
  toc.value = Array.from(headings).map((h) => ({
    id: h.id,
    text: h.textContent || '',
    level: Number(h.tagName.slice(1)),
  }));
}

// IntersectionObserver 高亮当前节
let tocObserver: IntersectionObserver | null = null;
function setupTocObserver() {
  if (tocObserver) tocObserver.disconnect();
  const article = document.querySelector<HTMLElement>('[data-article-body]');
  if (!article) return;
  const headings = article.querySelectorAll<HTMLElement>('h1, h2, h3');
  if (!headings.length) return;

  activeId.value = headings[0].id;

  tocObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) {
        activeId.value = visible[0].target.id;
        requestAnimationFrame(updateActiveBar);
      }
    },
    { rootMargin: '-80px 0px -70% 0px', threshold: 0 },
  );
  headings.forEach((h) => tocObserver!.observe(h));
}

onBeforeUnmount(() => { tocObserver?.disconnect(); });

function scrollTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  activeId.value = id;
  updateActiveBar();
  const y = el.getBoundingClientRect().top + window.scrollY - 72;
  window.scrollTo({ top: y, behavior: 'smooth' });
}

// ---------- 加载 ----------
async function load() {
  loading.value = true; notFound.value = false;
  try { blog.value = await getPublicBlogDetailApi(id.value); }
  catch { notFound.value = true; }
  finally { loading.value = false; }
}

function goBack() {
  if (window.history.length > 1) router.back();
  else router.push('/');
}

onMounted(load);

watch(blog, (b) => {
  if (!b) return;
  nextTick(() => { buildToc(); setupTocObserver(); nextTick(updateActiveBar); });
});

// ---------- 字数估算 ----------
const wordCount = computed(() => {
  if (!blog.value?.content) return 0;
  return blog.value.content.replace(/[#*`\-\s>]/g, '').length;
});
const readTime = computed(() => Math.max(1, Math.ceil(wordCount.value / 400)));
</script>

<template>
  <div class="mx-auto mt-8 max-w-6xl">
    <!-- 返回条 -->
    <button
      @click="goBack"
      class="mb-6 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-white/60 hover:text-brand-600 dark:text-brand-400"
    >
      <ArrowLeft class="h-4 w-4" />
      返回列表
    </button>

    <!-- 加载 -->
    <div v-if="loading" class="flex items-center justify-center py-32 text-slate-400">
      <Loader2 class="h-6 w-6 animate-spin" />
      <span class="ml-2 text-sm">加载中…</span>
    </div>

    <!-- 404 -->
    <div v-else-if="notFound" class="rounded-3xl border border-dashed border-slate-300 bg-white/60 py-32 text-center">
      <Sparkles class="mx-auto mb-4 h-12 w-12 text-slate-300" />
      <p class="text-slate-500">文章不存在或尚未发布</p>
      <button
        @click="router.push('/')"
        class="mt-4 rounded-lg bg-gradient-to-r from-brand-600 to-accent-500 px-5 py-2 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg"
      >回到大厅</button>
    </div>

    <template v-else-if="blog">
      <!-- ============ 封面（含叠层标题+元信息） ============ -->
      <div class="relative mb-10 overflow-hidden rounded-2xl shadow-xl shadow-slate-900/10 dark:shadow-black/40">
        <div v-if="blog.coverImage" class="relative aspect-[21/9] w-full">
          <img :src="blog.coverImage" :alt="blog.title" class="absolute inset-0 h-full w-full object-cover" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
        </div>
        <div v-else class="relative flex aspect-[16/9] w-full items-center justify-center bg-gradient-to-br from-brand-600 via-brand-500 to-accent-500">
          <Sparkles class="h-20 w-20 text-white/60" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        </div>

        <!-- 叠层：分类 + 标题 + 元信息 -->
        <div class="absolute inset-x-0 bottom-0 p-6 text-white sm:p-10 md:p-12">
          <span class="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-medium uppercase tracking-wider backdrop-blur">
            <FolderOpen class="h-3 w-3" /> {{ blog.category }}
          </span>
          <h1 class="max-w-4xl text-2xl font-bold leading-tight tracking-tight drop-shadow-md sm:text-3xl md:text-[40px]">
            {{ blog.title }}
          </h1>
          <div class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-white/85">
            <span class="inline-flex items-center gap-2">
              <img
                v-if="blog.userId?.avatar"
                :src="blog.userId.avatar"
                class="h-7 w-7 rounded-full object-cover ring-2 ring-white/60"
              />
              <div v-else class="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 backdrop-blur">
                <User class="h-3.5 w-3.5" />
              </div>
              <span class="font-medium text-white">{{ blog.author || blog.userId?.username || '匿名' }}</span>
            </span>
            <span
              v-if="blog.contentType === 'ai'"
              class="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium backdrop-blur"
            >
              <Sparkles class="h-3 w-3" /> AI 生成内容
            </span>
            <span class="inline-flex items-center gap-1"><Calendar class="h-3.5 w-3.5" /> {{ dayjs(blog.publishedAt).format('YYYY-MM-DD') }}</span>
            <span class="inline-flex items-center gap-1"><Eye class="h-3.5 w-3.5" /> {{ blog.views }}</span>
            <span class="inline-flex items-center gap-1"><MessageCircle class="h-3.5 w-3.5" /> {{ blog.commentCount || 0 }}</span>
            <span class="text-white/60">· {{ wordCount }} 字 · {{ readTime }} 分钟阅读</span>
          </div>
        </div>
      </div>

      <!-- ============ 主区：正文 + 侧边 TOC ============ -->
      <div class="relative grid gap-8 lg:grid-cols-[1fr_220px] xl:grid-cols-[1fr_240px]">
        <!-- 正文 -->
        <div class="min-w-0">
          <article
            data-article
            class="rounded-2xl border border-slate-200/60 bg-white/80 p-6 shadow-sm backdrop-blur sm:p-10 dark:border-slate-700/60 dark:bg-slate-800/80"
          >
            <div v-if="blog.summary" class="mb-8 border-l-2 border-brand-400 pl-4 text-[15px] italic leading-relaxed text-slate-600 dark:text-slate-300">
              {{ blog.summary }}
            </div>
            <div data-article-body class="prose-blog" v-html="htmlContent" />
          </article>

          <!-- 标签 -->
          <div v-if="blog.tags?.length" class="mt-6 flex flex-wrap items-center gap-1.5">
            <span v-for="t in blog.tags" :key="t" class="inline-flex items-center gap-0.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              <Hash class="h-3 w-3" /> {{ t }}
            </span>
          </div>

          <!-- 评论 -->
          <CommentSection :blog-id="blog._id" />

          <!-- 底部 -->
          <div class="mt-10 flex justify-center">
            <button
              @click="goBack"
              class="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 transition-all hover:border-brand-300 hover:text-brand-600 dark:text-brand-400"
            >
              <ArrowLeft class="h-4 w-4" />
              回到博客大厅
            </button>
          </div>
        </div>

        <!-- 侧边 TOC -->
        <aside
          v-if="toc.length > 1"
          class="hidden lg:block"
        >
          <div class="sticky top-24">
            <div class="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <List class="h-3 w-3" />
              目录
            </div>
            <nav data-toc-nav class="relative border-l border-slate-200 pl-3 dark:border-slate-700">
              <div
                v-if="activeId"
                class="absolute -left-px w-[2px] rounded-full bg-gradient-to-b from-brand-500 to-accent-500 transition-all duration-200"
                :style="{ top: activeBar.top + 'px', height: activeBar.height + 'px' }"
              />
              <button
                v-for="t in toc" :key="t.id"
                :data-toc-id="t.id"
                @click="scrollTo(t.id)"
                class="block w-full rounded-md py-1.5 pr-2 text-left text-[13px] leading-tight transition-colors"
                :class="[
                  activeId === t.id
                    ? 'font-medium text-brand-600 dark:text-brand-400'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
                  t.level === 1 ? 'pl-0' : t.level === 2 ? 'pl-3' : 'pl-6',
                ]"
              >
                <span class="line-clamp-2">{{ t.text }}</span>
              </button>
            </nav>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>
