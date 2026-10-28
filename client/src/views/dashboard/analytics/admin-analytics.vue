<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import type { DashboardStats } from '#/api/stats';

import { computed, nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  CustomerServiceOutlined,
  EyeOutlined,
  FileTextOutlined,
  MessageOutlined,
  StarFilled,
} from '@ant-design/icons-vue';
import { Card, Tag, message } from 'ant-design-vue';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import dayjs from 'dayjs';

import { getDashboardStatsApi } from '#/api/stats';

defineOptions({ name: 'AdminAnalytics' });

const router = useRouter();

const loading = ref(true);
const stats = ref<DashboardStats | null>(null);

const trendRef = ref<EchartsUIType>();
const pieRef = ref<EchartsUIType>();
const { renderEcharts: renderTrend } = useEcharts(trendRef);
const { renderEcharts: renderPie } = useEcharts(pieRef);

const overview = computed(() => stats.value?.overview);
const today = computed(() => stats.value?.today);

const kpis = computed(() => {
  const o = overview.value;
  const t = today.value;
  if (!o || !t) return [];
  return [
    {
      key: 'blogs',
      label: '文章总数',
      value: o.blogs,
      sub: `已发布 ${o.publishedBlogs} · 今日 +${t.blogs}`,
      color: '#5ab1ef',
      icon: FileTextOutlined,
      to: '/blog',
    },
    {
      key: 'views',
      label: '总浏览量',
      value: o.views,
      sub: `平均每篇 ${o.blogs ? Math.round(o.views / o.blogs) : 0} 次`,
      color: '#8b5cf6',
      icon: EyeOutlined,
      to: '/blog',
    },
    {
      key: 'comments',
      label: '评论总数',
      value: o.comments,
      sub: `待审核 ${o.pendingComments} · 今日 +${t.comments}`,
      color: '#f59e0b',
      icon: MessageOutlined,
      to: '/comment',
    },
    {
      key: 'chats',
      label: '客服会话',
      value: o.chats,
      sub: `待跟进 ${o.pendingChats} · 今日 +${t.chats}`,
      color: '#019680',
      icon: CustomerServiceOutlined,
      to: '/chat',
    },
  ];
});

function statusTag(status: string) {
  if (status === 'approved') return { color: 'green', text: '已通过' };
  if (status === 'rejected') return { color: 'red', text: '已拒绝' };
  return { color: 'orange', text: '待审核' };
}

async function renderCharts() {
  const data = stats.value;
  if (!data) return;

  renderTrend({
    color: ['#5ab1ef', '#f59e0b', '#019680'],
    grid: { bottom: 0, containLabel: true, left: '1%', right: '2%', top: 30 },
    legend: { data: ['新增文章', '新增评论', '客服会话'], top: 0, right: 0 },
    series: [
      {
        name: '新增文章',
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.12 },
        data: data.trend.map((d) => d.blogs),
      },
      {
        name: '新增评论',
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.12 },
        data: data.trend.map((d) => d.comments),
      },
      {
        name: '客服会话',
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.12 },
        data: data.trend.map((d) => d.chats),
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
    color: ['#5ab1ef', '#019680', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6'],
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
    stats.value = await getDashboardStatsApi();
  } catch (err) {
    message.error((err as Error)?.message || '加载统计数据失败');
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
    <!-- KPI 卡片 -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
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

    <!-- 图表 -->
    <div class="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card
        class="xl:col-span-2"
        title="近 14 天新增趋势"
        :bordered="false"
        :loading="loading"
      >
        <EchartsUI ref="trendRef" height="300px" />
      </Card>
      <Card title="文章分类分布" :bordered="false" :loading="loading">
        <EchartsUI ref="pieRef" height="300px" />
      </Card>
    </div>

    <!-- 列表 -->
    <div class="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
      <!-- 热门文章 -->
      <Card title="热门文章" :bordered="false" :loading="loading">
        <div class="space-y-3">
          <div
            v-for="(item, index) in stats?.topBlogs || []"
            :key="item._id"
            class="flex items-start gap-3"
          >
            <span
              class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-semibold"
              :class="
                index < 3
                  ? 'bg-blue-50 text-blue-600'
                  : 'bg-gray-100 text-gray-500'
              "
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
            暂无文章
          </div>
        </div>
      </Card>

      <!-- 最新评论 -->
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

      <!-- 客服会话 -->
      <Card title="最近客服会话" :bordered="false" :loading="loading">
        <div class="space-y-3">
          <div
            v-for="item in stats?.recentSessions || []"
            :key="item.sessionId"
            class="border-b border-gray-100 pb-2 last:border-0 last:pb-0"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="truncate font-mono text-xs text-gray-500">
                {{ item.sessionId.slice(0, 12) }}
              </span>
              <Tag
                :color="item.unhandled ? 'red' : 'green'"
                :bordered="false"
                class="shrink-0"
              >
                {{ item.unhandled ? '待跟进' : '已处理' }}
              </Tag>
            </div>
            <p class="mt-1 line-clamp-2 text-xs text-gray-600">
              {{ item.lastMessage || '（无消息）' }}
            </p>
            <div class="mt-1 text-[11px] text-gray-400">
              {{ item.messageCount }} 条消息 ·
              {{ dayjs(item.lastMessageAt).format('MM-DD HH:mm') }}
            </div>
          </div>
          <div
            v-if="!(stats?.recentSessions || []).length"
            class="py-6 text-center text-sm text-gray-400"
          >
            暂无会话
          </div>
        </div>
      </Card>
    </div>
  </div>
</template>
