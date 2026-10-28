<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import type { DashboardStats } from '#/api/stats';

import { computed, nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  CustomerServiceOutlined,
  EditOutlined,
  MessageOutlined,
  NotificationOutlined,
} from '@ant-design/icons-vue';
import { Card, Tag, message } from 'ant-design-vue';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';
import { useUserStore } from '@vben/stores';

import dayjs from 'dayjs';

import { getDashboardStatsApi } from '#/api/stats';

defineOptions({ name: 'Workspace' });

const router = useRouter();
const userStore = useUserStore();

const loading = ref(true);
const stats = ref<DashboardStats | null>(null);
const trendRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(trendRef);

const username = computed(() => userStore.userInfo?.realName || userStore.userInfo?.username || '管理员');

const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
});

const quickNav = [
  {
    title: '新建文章',
    desc: '撰写并发布新内容',
    icon: EditOutlined,
    color: '#5ab1ef',
    to: '/blog/create',
  },
  {
    title: '评论审核',
    desc: '处理待审核评论',
    icon: MessageOutlined,
    color: '#f59e0b',
    to: '/comment',
  },
  {
    title: '通知公告',
    desc: '发布站点通知',
    icon: NotificationOutlined,
    color: '#8b5cf6',
    to: '/notification',
  },
  {
    title: '智能客服',
    desc: '问答库与会话记录',
    icon: CustomerServiceOutlined,
    color: '#019680',
    to: '/chat',
  },
];

const todos = computed(() => {
  const o = stats.value?.overview;
  if (!o) return [];
  return [
    {
      label: '待审核评论',
      count: o.pendingComments,
      to: '/comment',
      color: 'orange',
    },
    {
      label: '待跟进客服会话',
      count: o.pendingChats,
      to: '/chat',
      color: 'red',
    },
    {
      label: '未发布草稿',
      count: o.blogs - o.publishedBlogs,
      to: '/blog',
      color: 'blue',
    },
  ];
});

async function renderChart() {
  const data = stats.value;
  if (!data) return;
  const last7 = data.trend.slice(-7);

  renderEcharts({
    color: ['#5ab1ef', '#f59e0b'],
    grid: { bottom: 0, containLabel: true, left: '1%', right: '2%', top: 28 },
    legend: { data: ['新增文章', '新增评论'], top: 0, right: 0 },
    series: [
      {
        name: '新增文章',
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.12 },
        data: last7.map((d) => d.blogs),
      },
      {
        name: '新增评论',
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.12 },
        data: last7.map((d) => d.comments),
      },
    ],
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: last7.map((d) => d.date.slice(5)),
      axisTick: { show: false },
    },
    yAxis: { type: 'value', minInterval: 1, splitNumber: 4 },
  });
}

async function load() {
  loading.value = true;
  try {
    stats.value = await getDashboardStatsApi();
  } catch (err) {
    message.error((err as Error)?.message || '加载工作台数据失败');
  } finally {
    // 先关掉骨架屏，图表容器才会真正挂载
    loading.value = false;
  }
  await nextTick();
  await renderChart();
}

function statusText(status: string) {
  if (status === 'published') return '已发布';
  if (status === 'scheduled') return '定时';
  return '草稿';
}

onMounted(load);
</script>

<template>
  <div class="p-5">
    <!-- 欢迎条 -->
    <Card :bordered="false" :loading="loading">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div class="text-xl font-semibold">
            {{ greeting }}，{{ username }} 👋
          </div>
          <div class="mt-1 text-sm text-gray-500">
            今天是 {{ dayjs().format('YYYY 年 MM 月 DD 日') }}，
            <template v-if="stats?.overview.pendingComments">
              有 {{ stats.overview.pendingComments }} 条评论待审核
            </template>
            <template v-else>暂时没有待审核评论</template>
            <template v-if="stats?.overview.pendingChats">
              ，{{ stats.overview.pendingChats }} 个客服会话待跟进
            </template>
          </div>
        </div>
        <div class="flex items-center gap-8">
          <div v-for="item in [
            { label: '文章', value: stats?.overview.blogs || 0 },
            { label: '浏览', value: stats?.overview.views || 0 },
            { label: '评论', value: stats?.overview.comments || 0 },
            { label: '会话', value: stats?.overview.chats || 0 },
          ]" :key="item.label" class="text-center">
            <div class="text-2xl font-semibold">{{ item.value }}</div>
            <div class="text-xs text-gray-400">{{ item.label }}</div>
          </div>
        </div>
      </div>
    </Card>

    <!-- 快捷入口 -->
    <div class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card
        v-for="nav in quickNav"
        :key="nav.title"
        :bordered="false"
        class="cursor-pointer transition-shadow hover:shadow-md "
        @click="router.push(nav.to)"
      >
        <div class="flex items-center gap-3">
          <div
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
            :style="{ backgroundColor: nav.color }"
          >
            <component :is="nav.icon" style="font-size: 18px" />
          </div>
          <div>
            <div class="text-sm font-medium">{{ nav.title }}</div>
            <div class="text-xs text-gray-400">{{ nav.desc }}</div>
          </div>
        </div>
      </Card>
    </div>

    <!-- 趋势 + 待办 -->
    <div class="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card
        class="xl:col-span-2"
        title="近 7 天新增"
        :bordered="false"
        :loading="loading"
      >
        <EchartsUI ref="trendRef" height="280px" />
      </Card>

      <Card title="待办事项" :bordered="false" :loading="loading">
        <div class="space-y-3">
          <div
            v-for="todo in todos"
            :key="todo.label"
            class="flex cursor-pointer items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-3 transition-colors hover:bg-gray-100"
            @click="router.push(todo.to)"
          >
            <span class="text-sm text-gray-700 dark:text-white">{{ todo.label }}</span>
            <Tag :color="todo.color" :bordered="false">{{ todo.count }}</Tag>
          </div>
        </div>
      </Card>
    </div>

    <!-- 最近文章 + 最新评论 -->
    <div class="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card
        class="xl:col-span-2"
        title="最近文章"
        :bordered="false"
        :loading="loading"
      >
        <div class="space-y-3">
          <div
            v-for="item in stats?.recentBlogs || []"
            :key="item._id"
            class="flex cursor-pointer items-center justify-between gap-3 border-b border-gray-100 pb-2 last:border-0 last:pb-0"
            @click="router.push(`/blog/${item._id}/edit`)"
          >
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm">{{ item.title }}</div>
              <div class="mt-0.5 text-xs text-gray-400">
                {{ item.category }} · {{ dayjs(item.createdAt).format('MM-DD HH:mm') }}
              </div>
            </div>
            <Tag :bordered="false" :color="item.status === 'published' ? 'green' : 'default'">
              {{ statusText(item.status) }}
            </Tag>
            <span class="w-14 shrink-0 text-right text-xs text-gray-400">
              {{ item.views }} 浏览
            </span>
          </div>
          <div
            v-if="!(stats?.recentBlogs || []).length"
            class="py-6 text-center text-sm text-gray-400"
          >
            暂无文章
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
              <Tag :bordered="false" :color="item.status === 'approved' ? 'green' : 'orange'">
                {{ item.status === 'approved' ? '已通过' : item.status === 'rejected' ? '已拒绝' : '待审核' }}
              </Tag>
            </div>
            <p class="mt-1 line-clamp-2 text-xs text-gray-500">{{ item.content }}</p>
            <div class="mt-1 truncate text-[11px] text-gray-400">
              {{ item.blogTitle }}
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
  </div>
</template>
