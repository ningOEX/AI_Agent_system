<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import type { PersonalStats } from '#/api/stats';

import { computed, nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  MessageOutlined,
  StarFilled,
} from '@ant-design/icons-vue';
import { Avatar, Card, Tag, message } from 'ant-design-vue';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';
import { useUserStore } from '@vben/stores';

import dayjs from 'dayjs';

import { getPersonalStatsApi } from '#/api/stats';

defineOptions({ name: 'UserAnalytics' });

const router = useRouter();
const userStore = useUserStore();

const loading = ref(true);
const stats = ref<PersonalStats | null>(null);

const trendRef = ref<EchartsUIType>();
const pieRef = ref<EchartsUIType>();
const { renderEcharts: renderTrend } = useEcharts(trendRef);
const { renderEcharts: renderPie } = useEcharts(pieRef);

const username = computed(
  () => userStore.userInfo?.realName || userStore.userInfo?.username || '创作者',
);
const avatar = computed(() => userStore.userInfo?.avatar || '');

const overview = computed(() => stats.value?.overview);
const today = computed(() => stats.value?.today);

const kpis = computed(() => {
  const o = overview.value;
  const t = today.value;
  if (!o || !t) return [];
  return [
    {
      key: 'blogs',
      label: '我的文章',
      value: o.blogs,
      sub: `已发布 ${o.publishedBlogs} · 今日 +${t.blogs}`,
      color: '#5ab1ef',
      icon: FileTextOutlined,
      to: '/blog',
    },
    {
      key: 'views',
      label: '累计浏览',
      value: o.views,
      sub: `平均每篇 ${o.blogs ? Math.round(o.views / o.blogs) : 0} 次`,
      color: '#8b5cf6',
      icon: EyeOutlined,
      to: '/blog',
    },
    {
      key: 'comments',
      label: '收到评论',
      value: o.comments,
      sub: `已通过 ${o.approvedComments} · 今日 +${t.comments}`,
      color: '#f59e0b',
      icon: MessageOutlined,
      to: '/blog',
    },
    {
      key: 'drafts',
      label: '待完善草稿',
      value: o.drafts + o.scheduled,
      sub: `草稿 ${o.drafts} · 定时 ${o.scheduled}`,
      color: '#019680',
      icon: EditOutlined,
      to: '/blog',
    },
  ];
});

function statusTag(status: string) {
  if (status === 'approved') return { color: 'green', text: '已通过' };
  if (status === 'rejected') return { color: 'red', text: '已拒绝' };
  return { color: 'orange', text: '待审核' };
}

function blogStatusText(status: string) {
  if (status === 'published') return '已发布';
  if (status === 'scheduled') return '定时';
  return '草稿';
}

async function renderCharts() {
  const data = stats.value;
  if (!data) return;

  renderTrend({
    color: ['#5ab1ef', '#f59e0b'],
    grid: { bottom: 0, containLabel: true, left: '1%', right: '2%', top: 28 },
    legend: { data: ['我的新增文章', '收到的评论'], top: 0, right: 0 },
    series: [
      {
        name: '我的新增文章',
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.12 },
        data: data.trend.map((d) => d.blogs),
      },
      {
        name: '收到的评论',
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.12 },
        data: data.trend.map((d) => d.comments),
      },
    ],
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.trend.map((d) => d.date.slice(5)),
      axisTick: { show: false },
    },
    yAxis: { type: 'value', minInterval: 1, splitNumber: 4 },
  });

  renderPie({
    color: ['#5ab1ef', '#f59e0b', '#8b5cf6', '#019680', '#ef4444', '#14b8a6'],
    tooltip: { trigger: 'item', formatter: '{b}: {c} 篇 ({d}%)' },
    legend: { bottom: 0, left: 'center' },
    series: [
      {
        name: '分类',
        type: 'pie',
        radius: ['45%', '68%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        data: data.categories.length ? data.categories : [{ name: '暂无数据', value: 1 }],
      },
    ],
  });
}

async function load() {
  loading.value = true;
  try {
    stats.value = await getPersonalStatsApi();
  } catch (err) {
    message.error((err as Error)?.message || '加载个人数据失败');
  } finally {
    // 先关掉骨架屏，图表容器才会真正挂载
    loading.value = false;
  }
  await nextTick();
  await renderCharts();
}

onMounted(load);
</script>

<template>
  <div class="p-5">
    <!-- 个人创作概览 -->
    <Card :bordered="false" :loading="loading">
      <div class="flex flex-wrap items-center justify-between gap-5">
        <div class="flex items-center gap-4">
          <Avatar
            :size="52"
            :src="avatar || undefined"
            class="bg-blue-500 text-lg font-medium"
          >
            {{ username.slice(0, 1).toUpperCase() }}
          </Avatar>
          <div>
            <div class="text-lg font-semibold">{{ username }} 的创作空间</div>
            <div class="mt-1 text-sm text-gray-500">
              <template v-if="stats?.overview.blogs">
                已创作 {{ stats.overview.blogs }} 篇文章，
                <template v-if="stats.overview.pendingComments">
                  还有 {{ stats.overview.pendingComments }} 条评论待审核
                </template>
                <template v-else>所有评论均已处理</template>
              </template>
              <template v-else>还没有文章，点击下方「写新文章」开始创作吧</template>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-8">
          <div class="text-center">
            <div class="text-2xl font-semibold">{{ stats?.overview.blogs || 0 }}</div>
            <div class="text-xs text-gray-400">我的文章</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-semibold">{{ stats?.overview.views || 0 }}</div>
            <div class="text-xs text-gray-400">累计浏览</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-semibold">{{ stats?.overview.comments || 0 }}</div>
            <div class="text-xs text-gray-400">收到评论</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-semibold">
              {{ (stats?.today.blogs || 0) + (stats?.today.comments || 0) }}
            </div>
            <div class="text-xs text-gray-400">今日新增</div>
          </div>
        </div>
      </div>
    </Card>

    <!-- 个人 KPI -->
    <div class="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card
        v-for="item in kpis"
        :key="item.key"
        :bordered="false"
        class="cursor-pointer shadow-sm transition-shadow hover:shadow-md"
        :loading="loading"
        @click="router.push(item.to)"
      >
        <div class="flex items-center gap-3">
          <div
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
            :style="{ backgroundColor: item.color }"
          >
            <component :is="item.icon" style="font-size: 19px" />
          </div>
          <div class="min-w-0">
            <div class="text-xs text-gray-500">{{ item.label }}</div>
            <div class="text-2xl font-semibold leading-tight">
              {{ item.value.toLocaleString() }}
            </div>
            <div class="truncate text-xs text-gray-400">{{ item.sub }}</div>
          </div>
        </div>
      </Card>
    </div>

    <!-- 我的趋势 + 分类 -->
    <div class="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card
        class="xl:col-span-2"
        title="近 14 天我的创作与评论"
        :bordered="false"
        :loading="loading"
      >
        <EchartsUI ref="trendRef" height="300px" />
      </Card>
      <Card title="我的文章分类" :bordered="false" :loading="loading">
        <EchartsUI ref="pieRef" height="300px" />
      </Card>
    </div>

    <!-- 我的热门 + 最新评论 -->
    <div class="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card
        class="xl:col-span-2"
        title="我的热门文章"
        :bordered="false"
        :loading="loading"
      >
        <div class="space-y-3">
          <div
            v-for="(item, index) in stats?.topBlogs || []"
            :key="item._id"
            class="flex cursor-pointer items-start gap-3"
            @click="router.push(`/blog/${item._id}/edit`)"
          >
            <span
              class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-semibold"
              :class="index < 3 ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'"
            >
              {{ index + 1 }}
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span class="truncate text-sm">{{ item.title }}</span>
                <StarFilled
                  v-if="item.featured"
                  class="shrink-0 text-xs text-amber-400"
                />
              </div>
              <div class="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
                <Tag :bordered="false">{{ item.category }}</Tag>
                <span class="inline-flex items-center gap-1">
                  <EyeOutlined /> {{ item.views }}
                </span>
              </div>
            </div>
          </div>
          <div
            v-if="!(stats?.topBlogs || []).length"
            class="py-6 text-center text-sm text-gray-400"
          >
            还没有文章
          </div>
        </div>
      </Card>

      <Card title="最新评论" :bordered="false" :loading="loading">
        <div class="space-y-3">
          <div
            v-for="item in stats?.recentComments || []"
            :key="item._id"
            class="border-b border-gray-100 pb-2 last:border-0 last:pb-0"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="truncate text-sm font-medium">{{ item.nickname }}</span>
              <Tag
                :color="statusTag(item.status).color"
                :bordered="false"
                class="shrink-0"
              >
                {{ statusTag(item.status).text }}
              </Tag>
            </div>
            <p class="mt-1 line-clamp-2 text-xs text-gray-500">
              {{ item.content }}
            </p>
            <div class="mt-1 truncate text-[11px] text-gray-400">
              {{ item.blogTitle }} · {{ dayjs(item.createdAt).format('MM-DD HH:mm') }}
            </div>
          </div>
          <div
            v-if="!(stats?.recentComments || []).length"
            class="py-6 text-center text-sm text-gray-400"
          >
            暂无评论
          </div>
        </div>
      </Card>
    </div>

    <!-- 我的最近文章 -->
    <Card class="mt-5" title="我的最近文章" :bordered="false" :loading="loading">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div
          v-for="item in stats?.recentBlogs || []"
          :key="item._id"
          class="cursor-pointer rounded-lg border border-gray-100 p-3 transition-colors hover:border-blue-200 hover:bg-blue-50/40"
          @click="router.push(`/blog/${item._id}/edit`)"
        >
          <div class="truncate text-sm font-medium">{{ item.title }}</div>
          <div class="mt-1 text-xs text-gray-400">
            {{ item.category }} · {{ dayjs(item.createdAt).format('MM-DD HH:mm') }}
          </div>
          <div class="mt-2 flex items-center justify-between">
            <Tag
              :bordered="false"
              :color="item.status === 'published' ? 'green' : 'default'"
            >
              {{ blogStatusText(item.status) }}
            </Tag>
            <span class="text-xs text-gray-400">{{ item.views }} 浏览</span>
          </div>
        </div>
        <div
          v-if="!(stats?.recentBlogs || []).length"
          class="col-span-full py-6 text-center text-sm text-gray-400"
        >
          还没有文章，去写一篇吧
        </div>
      </div>
    </Card>
  </div>
</template>
