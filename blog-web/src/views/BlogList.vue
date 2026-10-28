<script setup lang="ts">
import type { ArchiveItem, CategoryCount, PublicBlogItem, TagCount } from '@/api';

import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import dayjs from 'dayjs';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import ParticleCanvas from '@/components/ParticleCanvas.vue';

import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  FolderOpen,
  Loader2,
  MessageCircle,
  Pin,
  Search,
  Sparkles,
  Tag as TagIcon,
  X,
} from 'lucide-vue-next';

import {
  getPublicArchiveApi,
  getPublicBlogListApi,
  getPublicCategoriesApi,
  getPublicTagsApi,
} from '@/api';

defineOptions({ name: 'BlogList' });

const route = useRoute();
const router = useRouter();

const loading = ref(false);
const list = ref<PublicBlogItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(9);
const keyword = ref((route.query.keyword as string) || '');
const activeCategory = ref((route.query.category as string) || '');
const activeTag = ref((route.query.tag as string) || '');

const categories = ref<CategoryCount[]>([]);
const tags = ref<TagCount[]>([]);
const archive = ref<ArchiveItem[]>([]);
const firstFeatured = ref<PublicBlogItem | null>(null);

async function loadList() {
  loading.value = true;
  try {
    const res = await getPublicBlogListApi({
      page: page.value, pageSize: pageSize.value,
      keyword: keyword.value.trim() || undefined,
      category: activeCategory.value || undefined,
      tag: activeTag.value || undefined,
    });
    list.value = res.list;
    total.value = res.total;
    if (!activeCategory.value && !activeTag.value && !keyword.value && page.value === 1) {
      firstFeatured.value = res.list.find((b) => b.featured) ?? null;
    } else {
      firstFeatured.value = null;
    }
  } finally { loading.value = false; }
}

async function loadSidebar() {
  const [cats, tgs, arc] = await Promise.all([
    getPublicCategoriesApi(), getPublicTagsApi(), getPublicArchiveApi(),
  ]);
  categories.value = cats; tags.value = tgs; archive.value = arc;
}

function goDetail(id: string) { router.push(`/blog/${id}`); }
function handleSearch() { page.value = 1; activeCategory.value = ''; activeTag.value = ''; updateQuery(); loadList(); }
function selectCategory(name: string) {
  activeCategory.value = activeCategory.value === name ? '' : name;
  activeTag.value = ''; page.value = 1; updateQuery(); loadList();
}
function selectTag(name: string) {
  activeTag.value = activeTag.value === name ? '' : name;
  activeCategory.value = ''; page.value = 1; updateQuery(); loadList();
}
function handlePageChange(p: number) {
  page.value = p; updateQuery(); loadList();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function updateQuery() {
  const q: Record<string, string> = {};
  if (keyword.value) q.keyword = keyword.value;
  if (activeCategory.value) q.category = activeCategory.value;
  if (activeTag.value) q.tag = activeTag.value;
  router.replace({ query: q });
}

const listTitle = computed(() => {
  if (activeCategory.value) return `分类：${activeCategory.value}`;
  if (activeTag.value) return `标签：#${activeTag.value}`;
  if (keyword.value) return `搜索："${keyword.value}"`;
  return '最新发布';
});
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
const gridItems = computed(() => firstFeatured.value ? list.value.slice(1) : list.value);

watch(() => route.query, (q) => {
  keyword.value = (q.keyword as string) || '';
  activeCategory.value = (q.category as string) || '';
  activeTag.value = (q.tag as string) || '';
  page.value = 1; loadList();
});

onMounted(() => {
  gsap.registerPlugin(ScrollTrigger);
  loadList(); loadSidebar();
});

watch(() => list.value, () => {
  nextTick(() => runAnimations());
}, { once: true });

function runAnimations() {
  gsap.fromTo('[data-hero-item]',
    { opacity: 0, y: 18 },
    { opacity: 1, y: 0, duration: 0.6, stagger: 0.12, delay: 0.1, ease: 'power2.out' },
  );
  gsap.fromTo('[data-featured]',
    { opacity: 0, y: 24 },
    {
      opacity: 1, y: 0, duration: 0.7, delay: 0.3, ease: 'power2.out',
      scrollTrigger: { trigger: '[data-featured]', start: 'top 88%', once: true },
    },
  );
  gsap.fromTo('[data-card]',
    { opacity: 0, y: 28 },
    {
      opacity: 1, y: 0, duration: 0.6, stagger: 0.08, ease: 'power2.out',
      scrollTrigger: { trigger: '[data-cards]', start: 'top 85%', once: true },
    },
  );
  gsap.fromTo('[data-side-panel]',
    { opacity: 0, x: 24 },
    {
      opacity: 1, x: 0, duration: 0.6, stagger: 0.12, delay: 0.3, ease: 'power2.out',
      scrollTrigger: { trigger: '[data-sidebar]', start: 'top 85%', once: true },
    },
  );
}
</script>

<template>
  <div class="min-h-screen">
    <!-- ============ Hero（负 margin 撑满全屏 + 粒子画布） ============ -->
    <section
      data-hero
      class="relative -mx-4 mb-8 overflow-hidden sm:-mx-6 lg:-mx-8"
    >
      <div class="hero-bg px-4 py-14 text-white sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <!-- Canvas 粒子科技网（主题自适应） -->
        <ParticleCanvas />
        <!-- 光晕 -->
        <div class="pointer-events-none absolute -right-20 -top-16 h-72 w-72 rounded-full blur-3xl bg-[rgb(var(--tw-brand-500)/0.40)]" />
        <div class="pointer-events-none absolute -bottom-20 -left-10 h-60 w-60 rounded-full blur-3xl bg-[rgb(var(--tw-accent-500)/0.30)]" />

        <div class="relative mx-auto max-w-4xl">
          <span data-hero-item class="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
            <Sparkles class="h-3.5 w-3.5" />
            让思想流动起来
          </span>
          <h1 data-hero-item class="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            在 AI 的浪潮中<br/>留下一行清晰的脚印
          </h1>
          <p data-hero-item class="mt-4 max-w-xl text-white/80 text-[15px] leading-relaxed">
            精选最前沿的大模型实践、工程架构思考与产品设计洞察。
            每一篇都值得你停下来，认真读完。
          </p>

          <!-- Hero 搜索 -->
          <div data-hero-item class="mt-7 flex max-w-lg items-center rounded-2xl bg-white/95 p-1.5 shadow-lg shadow-black/10 backdrop-blur dark:bg-slate-800/95">
            <Search class="ml-3 h-4 w-4 text-slate-400" />
            <input
              v-model="keyword" type="text" placeholder="搜索标题、摘要或标签…"
              class="flex-1 bg-transparent px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none"
              @keyup.enter="handleSearch"
            />
            <button
              @click="handleSearch"
              class="rounded-xl bg-brand-600 hover:bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg hover:brightness-110 active:scale-[0.98]"
            >探索</button>
          </div>

          <div class="mt-5 flex items-center gap-5 text-sm text-white/75">
            <span class="inline-flex items-center gap-1.5"><FileText class="h-3.5 w-3.5" /> {{ total }} 篇文章</span>
            <span class="h-3 w-px bg-white/30" />
            <span class="inline-flex items-center gap-1.5"><FolderOpen class="h-3.5 w-3.5" /> {{ categories.length }} 个分类</span>
            <span class="h-3 w-px bg-white/30" />
            <span class="inline-flex items-center gap-1.5"><TagIcon class="h-3.5 w-3.5" /> {{ tags.length }} 个标签</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ 筛选 + 卡片 + 侧栏（居中容器） ============ -->
    <div class="mx-auto mt-8 max-w-7xl">
    <!-- ============ 筛选条 ============ -->
    <div class="mb-6 flex flex-wrap items-center gap-3">
      <h2 class="text-xl font-bold text-slate-900 dark:text-white">{{ listTitle }}</h2>
      <div class="ml-auto flex items-center gap-1.5">
        <span
          v-if="activeCategory"
          class="inline-flex cursor-pointer items-center gap-1 rounded-full bg-brand-100 dark:bg-brand-900/40 px-3 py-1 text-xs font-medium text-brand-700 dark:text-brand-300 transition-colors hover:bg-brand-200"
          @click="selectCategory(activeCategory)"
        >{{ activeCategory }} <X class="h-3 w-3" /></span>
        <span
          v-if="activeTag"
          class="inline-flex cursor-pointer items-center gap-1 rounded-full bg-accent-500/10 dark:bg-accent-500/20 px-3 py-1 text-xs font-medium text-accent-600 transition-colors hover:bg-accent-500"
          @click="selectTag(activeTag)"
        >#{{ activeTag }} <X class="h-3 w-3" /></span>
      </div>
    </div>

    <!-- ============ 主区域 ============ -->
    <div class="grid gap-8 lg:grid-cols-[1fr_280px]">
      <!-- ======= 左：文章区 ======= -->
      <div>
        <div v-if="loading" class="flex items-center justify-center py-24 text-slate-400">
          <Loader2 class="h-6 w-6 animate-spin" />
          <span class="ml-2 text-sm">加载中…</span>
        </div>

        <template v-else>
          <!-- 精选头条 -->
          <article
            data-featured
            v-if="firstFeatured"
            class="group mb-8 grid cursor-pointer overflow-hidden rounded-2xl border border-slate-200/70 bg-white dark:border-slate-700 dark:bg-slate-800 shadow-sm transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-brand-500/10 dark:hover:shadow-brand-500/5 md:grid-cols-5"
            @click="goDetail(firstFeatured._id)"
          >
            <div class="relative md:col-span-2">
              <div class="aspect-[4/3] w-full overflow-hidden md:h-full">
                <img
                  v-if="firstFeatured.coverImage"
                  :src="firstFeatured.coverImage" :alt="firstFeatured.title"
                  class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div v-else class="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-100 to-accent-500 text-6xl text-brand-300">✦</div>
              </div>
              <span class="absolute left-3 top-3 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow">
                精选头条
              </span>
            </div>
            <div class="flex flex-col justify-center gap-3 p-6 md:col-span-3">
              <span class="inline-flex w-fit items-center gap-1 rounded-full bg-brand-50 dark:bg-brand-900/30 px-3 py-1 text-xs font-medium text-brand-600 dark:text-brand-400">
                {{ firstFeatured.category }}
              </span>
              <h3 class="text-xl font-bold leading-snug text-slate-900 transition-colors group-hover:text-brand-600 dark:text-brand-400 md:text-2xl">
                {{ firstFeatured.title }}
              </h3>
              <p class="line-clamp-2 text-sm text-slate-500">{{ firstFeatured.summary }}</p>
              <div class="mt-2 flex items-center gap-4 text-xs text-slate-400">
                <span class="inline-flex items-center gap-1"><Calendar class="h-3 w-3" /> {{ dayjs(firstFeatured.publishedAt).format('YYYY-MM-DD') }}</span>
                <span class="inline-flex items-center gap-1"><Eye class="h-3 w-3" /> {{ firstFeatured.views }}</span>
                <span class="inline-flex items-center gap-1 text-accent-500"><MessageCircle class="h-3 w-3" /> {{ firstFeatured.commentCount || 0 }}</span>
                <span class="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 opacity-0 transition-opacity group-hover:opacity-100">
                  阅读全文 <ArrowRight class="h-3 w-3" />
                </span>
              </div>
            </div>
          </article>

          <!-- 卡片网格 -->
          <div data-cards v-if="gridItems.length > 0" class="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            <article
              data-card v-for="item in gridItems" :key="item._id"
              class="group cursor-pointer overflow-hidden rounded-2xl border border-slate-200/70 bg-white dark:border-slate-700 dark:bg-slate-800 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-500/5 dark:hover:shadow-brand-500/5"
              @click="goDetail(item._id)"
            >
              <div class="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
                <img
                  v-if="item.coverImage"
                  :src="item.coverImage" :alt="item.title"
                  class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div v-else class="flex h-full w-full items-center justify-center text-5xl text-slate-200">✦</div>
                <!-- 置顶角标 -->
                <span
                  v-if="item.featured"
                  class="absolute left-3 top-3 inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-brand-500 to-accent-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-md"
                >
                  <Pin class="h-3 w-3" /> 精选
                </span>
              </div>
              <div class="p-4">
                <div class="mb-2 flex flex-wrap gap-1.5">
                  <span class="rounded-md bg-brand-50 dark:bg-brand-900/30 px-2 py-0.5 text-[11px] font-medium text-brand-600 dark:text-brand-400">
                    {{ item.category }}
                  </span>
                  <span
                    v-for="t in item.tags.slice(0, 2)" :key="t"
                    class="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500"
                  >#{{ t }}</span>
                </div>
                <h3 class="line-clamp-2 text-[15px] font-semibold leading-snug text-slate-900 transition-colors group-hover:text-brand-600 dark:text-brand-400">
                  {{ item.title }}
                </h3>
                <p class="mt-1.5 line-clamp-2 text-xs text-slate-500">{{ item.summary }}</p>
                <div class="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                  <span>{{ dayjs(item.publishedAt).format('YYYY-MM-DD') }}</span>
                  <span class="inline-flex items-center gap-1"><Eye class="h-3 w-3" /> {{ item.views || 0 }}</span>
                  <span class="inline-flex items-center gap-1 text-accent-500"><MessageCircle class="h-3 w-3" /> {{ item.commentCount || 0 }}</span>
                </div>
              </div>
            </article>
          </div>

          <!-- 空 -->
          <div v-else-if="list.length === 0" class="rounded-2xl border border-dashed border-slate-300 bg-white/50 py-24 text-center text-slate-400">
            <FileText class="mx-auto mb-3 h-10 w-10 opacity-30" />
            没有找到相关文章
          </div>

          <!-- 分页 -->
          <div v-if="total > pageSize && list.length > 0" class="mt-10 flex items-center justify-center gap-2">
            <button
              :disabled="page <= 1"
              class="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-brand-300 hover:text-brand-600 dark:text-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
              @click="handlePageChange(page - 1)"
            ><ChevronLeft class="h-4 w-4 inline -mt-0.5" /> 上一页</button>
            <span class="px-3 text-sm text-slate-500">
              第 <strong class="text-brand-600 dark:text-brand-400">{{ page }}</strong> / {{ totalPages }} 页
            </span>
            <button
              :disabled="page >= totalPages"
              class="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-brand-300 hover:text-brand-600 dark:text-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
              @click="handlePageChange(page + 1)"
            >下一页 <ChevronRight class="h-4 w-4 inline -mt-0.5" /></button>
          </div>
        </template>
      </div>

      <!-- ======= 右侧栏 ======= -->
      <aside data-sidebar class="space-y-5">
        <div data-side-panel class="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-800/80">
          <h3 class="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-300/80">
            <span class="inline-block h-4 w-1 rounded-full bg-gradient-to-b from-brand-500 to-accent-500" />
            分类
          </h3>
          <div class="space-y-1">
            <div
              class="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-slate-50"
              :class="{ 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 font-medium': !activeCategory }"
              @click="selectCategory('')"
            ><span>全部</span><span class="text-xs text-slate-400">{{ total }}</span></div>
            <div
              v-for="c in categories" :key="c.name"
              class="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-slate-50"
              :class="{ 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 font-medium': activeCategory === c.name }"
              @click="selectCategory(c.name)"
            ><span>{{ c.name }}</span><span class="text-xs text-slate-400">{{ c.count }}</span></div>
          </div>
        </div>

        <div data-side-panel class="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-800/80">
          <h3 class="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-300/80">
            <span class="inline-block h-4 w-1 rounded-full bg-gradient-to-b from-accent-500 to-brand-500" />
            热门标签
          </h3>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="t in tags" :key="t.name"
              class="rounded-full border px-3 py-1 text-xs transition-all"
              :class="activeTag === t.name
                ? 'border-accent-500 bg-accent-500/10 dark:bg-accent-500/20 text-accent-500 shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:border-accent-500 hover:text-accent-600 dark:text-brand-400'"
              @click="selectTag(t.name)"
            >{{ t.name }} <span class="opacity-50">({{ t.count }})</span></button>
            <div v-if="tags.length === 0" class="text-sm text-slate-400">暂无标签</div>
          </div>
        </div>

        <div data-side-panel class="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-800/80">
          <h3 class="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-300/80">
            <span class="inline-block h-4 w-1 rounded-full bg-gradient-to-b from-amber-400 to-orange-500" />
            归档
          </h3>
          <div class="space-y-1">
            <div
              v-for="arc in archive" :key="arc.label"
              class="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
            ><span>{{ arc.label }}</span><span class="text-xs text-slate-400">{{ arc.count }} 篇</span></div>
            <div v-if="archive.length === 0" class="text-sm text-slate-400">暂无归档</div>
          </div>
        </div>
      </aside>
    </div>
    </div><!-- /max-w-7xl -->
  </div>
</template>
