<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import type {
  AiPricingItem,
  AiUsageDistribution,
  AiUsageItem,
  AiUsageOverview,
  AiUsageQuery,
  AiUsageTrend,
} from '#/api/aiUsage';

import { computed, h, nextTick, onMounted, reactive, ref } from 'vue';

import dayjs from 'dayjs';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import {
  Button,
  Card,
  DatePicker,
  Input,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'ant-design-vue';

import {
  AI_SCENE_OPTIONS,
  getAiUsageDistributionApi,
  getAiUsageListApi,
  getAiUsageOverviewApi,
  getAiUsagePricingApi,
  getAiUsageTrendApi,
} from '#/api/aiUsage';

import AiCostCalculator from './components/cost-calculator.vue';

defineOptions({ name: 'AiUsage' });

const { RangePicker } = DatePicker;

const sceneMeta: Record<string, { color: string; label: string }> = Object.fromEntries(
  AI_SCENE_OPTIONS.map((s) => [s.value, { color: s.color, label: s.label }]),
);

// ---------- 概览 / 图表 ----------
const loading = ref(true);
const days = ref(14);
const overview = ref<AiUsageOverview | null>(null);
const trend = ref<AiUsageTrend | null>(null);
const distribution = ref<AiUsageDistribution | null>(null);
const distributionBy = ref<'model' | 'scene'>('model');
const pricing = ref<AiPricingItem[]>([]);

const trendRef = ref<EchartsUIType>();
const pieRef = ref<EchartsUIType>();
const { renderEcharts: renderTrend } = useEcharts(trendRef);
const { renderEcharts: renderPie } = useEcharts(pieRef);

const o = computed(() => overview.value?.overview);
const today = computed(() => overview.value?.today);

const kpis = computed(() => {
  const ov = o.value;
  const t = today.value;
  if (!ov || !t) return [];
  return [
    {
      key: 'calls',
      label: '总调用次数',
      value: ov.calls.toLocaleString(),
      sub: `成功 ${ov.successCalls} · 失败 ${ov.failedCalls}`,
      color: '#5ab1ef',
    },
    {
      key: 'tokens',
      label: '总 Token',
      value: ov.totalTokens.toLocaleString(),
      sub: `输入 ${ov.promptTokens.toLocaleString()} · 输出 ${ov.completionTokens.toLocaleString()}`,
      color: '#8b5cf6',
    },
    {
      key: 'cost',
      label: '总费用（元）',
      value: ov.cost.toFixed(4),
      sub: `其中估算 ${ov.estimatedCalls} 次`,
      color: '#f59e0b',
    },
    {
      key: 'avg',
      label: '平均单次费用',
      value: ov.avgCostPerCall.toFixed(6),
      sub: `今日 ¥${t.cost.toFixed(4)} / ${t.calls} 次`,
      color: '#019680',
    },
  ];
});

const daysOptions = [
  { label: '近 7 天', value: 7 },
  { label: '近 14 天', value: 14 },
  { label: '近 30 天', value: 30 },
  { label: '近 90 天', value: 90 },
];

const byOptions = [
  { label: '按模型', value: 'model' },
  { label: '按场景', value: 'scene' },
];

function renderCharts() {
  const t = trend.value;
  if (t) {
    renderTrend({
      color: ['#5ab1ef', '#f59e0b'],
      grid: { bottom: 0, containLabel: true, left: '1%', right: '3%', top: 36 },
      legend: { data: ['调用次数', '费用（元）'], top: 0, right: 0 },
      series: [
        {
          name: '调用次数',
          type: 'line',
          smooth: true,
          yAxisIndex: 0,
          areaStyle: { opacity: 0.12 },
          data: t.trend.map((d) => d.calls),
        },
        {
          name: '费用（元）',
          type: 'line',
          smooth: true,
          yAxisIndex: 1,
          data: t.trend.map((d) => d.cost),
        },
      ],
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: t.trend.map((d) => d.date.slice(5)),
        axisTick: { show: false },
      },
      yAxis: [
        { type: 'value', name: '次数', minInterval: 1, splitNumber: 4 },
        { type: 'value', name: '元', splitNumber: 4 },
      ],
    });
  }

  const d = distribution.value;
  renderPie({
    color: ['#5ab1ef', '#019680', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6'],
    tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
    legend: { bottom: 0, left: 'center' },
    series: [
      {
        name: '费用',
        type: 'pie',
        radius: ['45%', '68%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        data:
          d && d.items.length
            ? d.items.map((item) => ({ name: item.label, value: item.cost }))
            : [{ name: '暂无数据', value: 1 }],
      },
    ],
  });
}

async function loadOverview() {
  loading.value = true;
  try {
    const [ov, tr, di, pr] = await Promise.all([
      getAiUsageOverviewApi(days.value),
      getAiUsageTrendApi(days.value),
      getAiUsageDistributionApi(distributionBy.value, days.value),
      getAiUsagePricingApi(),
    ]);
    overview.value = ov;
    trend.value = tr;
    distribution.value = di;
    pricing.value = pr.items;
  } catch (err: any) {
    message.error(err?.message || '加载用量统计失败');
  } finally {
    // 先关掉骨架屏，图表容器才会真正挂载
    loading.value = false;
  }
  await nextTick();
  renderCharts();
}

/** 切换分布维度：容器已挂载，直接重渲染即可 */
async function changeDistributionBy() {
  try {
    distribution.value = await getAiUsageDistributionApi(distributionBy.value, days.value);
  } catch (err: any) {
    message.error(err?.message || '加载费用分布失败');
    return;
  }
  renderPie({
    tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
    legend: { bottom: 0, left: 'center' },
    series: [
      {
        name: '费用',
        type: 'pie',
        radius: ['45%', '68%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        data: distribution.value.items.length
          ? distribution.value.items.map((item) => ({ name: item.label, value: item.cost }))
          : [{ name: '暂无数据', value: 1 }],
      },
    ],
  });
}

// ---------- 明细表 ----------
const tableLoading = ref(false);
const data = ref<AiUsageItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);

const searchForm = reactive<AiUsageQuery>({
  keyword: '',
  scene: undefined,
  model: undefined,
  success: undefined,
});
const rangeValue = ref<[any, any] | undefined>(undefined);

const sceneOptions = AI_SCENE_OPTIONS.map((s) => ({ label: s.label, value: s.value }));
const modelOptions = computed(() => pricing.value.map((p) => ({ label: p.label, value: p.model })));
const successOptions = [
  { label: '成功', value: 'true' },
  { label: '失败', value: 'false' },
];

async function loadList() {
  tableLoading.value = true;
  try {
    const res = await getAiUsageListApi({
      page: page.value,
      pageSize: pageSize.value,
      scene: searchForm.scene || undefined,
      model: searchForm.model || undefined,
      success: searchForm.success || undefined,
      keyword: searchForm.keyword?.trim() || undefined,
      startTime: rangeValue.value?.[0]
        ? dayjs(rangeValue.value[0]).startOf('day').toISOString()
        : undefined,
      endTime: rangeValue.value?.[1]
        ? dayjs(rangeValue.value[1]).endOf('day').toISOString()
        : undefined,
    });
    data.value = res.list;
    total.value = res.total;
  } catch (err: any) {
    message.error(err?.message || '加载调用明细失败');
  } finally {
    tableLoading.value = false;
  }
}

function handleSearch() {
  page.value = 1;
  loadList();
}

function handleReset() {
  searchForm.keyword = '';
  searchForm.scene = undefined;
  searchForm.model = undefined;
  searchForm.success = undefined;
  rangeValue.value = undefined;
  page.value = 1;
  loadList();
}

function handleTableChange(pag: any) {
  page.value = pag.current;
  pageSize.value = pag.pageSize;
  loadList();
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  return dayjs(iso).format('YYYY-MM-DD HH:mm:ss');
}

const columns = [
  {
    title: '时间',
    dataIndex: 'createdAt',
    width: 170,
    customRender: ({ text }: { text: string }) => fmtDate(text),
  },
  {
    title: '场景',
    dataIndex: 'scene',
    width: 100,
    customRender: ({ text }: { text: string }) => {
      const meta = sceneMeta[text] || { color: 'default', label: text };
      return h(Tag, { color: meta.color }, () => meta.label);
    },
  },
  {
    title: '模型',
    dataIndex: 'model',
    width: 150,
    customRender: ({ text }: { text: string }) => text,
  },
  {
    title: '输入 / 输出 / 合计',
    dataIndex: 'totalTokens',
    width: 200,
    customRender: ({ record }: { record: AiUsageItem }) =>
      record.unit === 'image'
        ? `${record.units} 张`
        : `${record.promptTokens} / ${record.completionTokens} / ${record.totalTokens}`,
  },
  {
    title: '费用（元）',
    dataIndex: 'cost',
    width: 120,
    customRender: ({ text }: { text: number }) => text.toFixed(6),
  },
  {
    title: '来源',
    dataIndex: 'estimated',
    width: 100,
    customRender: ({ record }: { record: AiUsageItem }) =>
      record.unknownModel
        ? h(Tag, { color: 'warning' }, () => '未收录')
        : record.estimated
          ? h(Tag, { color: 'orange' }, () => '估算')
          : h(Tag, { color: 'green' }, () => '真实'),
  },
  {
    title: '调用者',
    dataIndex: ['user', 'username'],
    width: 160,
    customRender: ({ record }: { record: AiUsageItem }) =>
      h(Space, { size: 4 }, () => [
        h('span', {}, record.user?.username || '匿名访客'),
        record.sessionId
          ? h('span', { class: 'font-mono text-xs text-gray-400' }, `${record.sessionId.slice(0, 12)}`)
          : null,
      ]),
  },
  {
    title: '耗时',
    dataIndex: 'durationMs',
    width: 90,
    customRender: ({ text }: { text: number }) => `${text || 0} ms`,
  },
  {
    title: '状态',
    dataIndex: 'success',
    width: 110,
    customRender: ({ record }: { record: AiUsageItem }) =>
      record.success
        ? h(Tag, { color: 'success' }, () => '成功')
        : h(Tag, { color: 'error' }, () => `${record.statusCode || '失败'}`),
  },
  {
    title: '失败原因',
    dataIndex: 'errorMessage',
    ellipsis: true,
    customRender: ({ text }: { text: string }) => text || '-',
  },
];

onMounted(async () => {
  await loadOverview();
  await loadList();
});
</script>

<template>
  <div class="p-5">
    <!-- KPI 卡片 -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card v-for="item in kpis" :key="item.key" :bordered="false" class="shadow-sm" :loading="loading">
        <div class="min-w-0">
          <div class="text-xs text-gray-500">{{ item.label }}</div>
          <div class="text-2xl font-semibold leading-tight" :style="{ color: item.color }">
            {{ item.value }}
          </div>
          <div class="truncate text-xs text-gray-400">{{ item.sub }}</div>
        </div>
      </Card>
    </div>

    <!-- 图表 -->
    <div class="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card class="xl:col-span-2" :bordered="false" :loading="loading">
        <template #title>
          <div class="flex items-center gap-3">
            <span>近 {{ days }} 天调用趋势</span>
            <Select
              v-model:value="days"
              :options="daysOptions"
              size="small"
              style="width: 110px"
              @change="loadOverview"
            />
          </div>
        </template>
        <EchartsUI ref="trendRef" height="300px" />
      </Card>
      <Card :bordered="false" :loading="loading">
        <template #title>
          <div class="flex items-center gap-3">
            <span>费用分布</span>
            <Select
              v-model:value="distributionBy"
              :options="byOptions"
              size="small"
              style="width: 100px"
              @change="changeDistributionBy"
            />
          </div>
        </template>
        <EchartsUI ref="pieRef" height="300px" />
      </Card>
    </div>

    <!-- 明细表 -->
    <div class="mt-5">
      <Card title="调用明细" :bordered="false">
        <div class="mb-4 flex flex-wrap items-center gap-3">
          <Select
            v-model:value="searchForm.scene"
            placeholder="场景"
            style="width: 140px"
            allow-clear
            :options="sceneOptions"
          />
          <Select
            v-model:value="searchForm.model"
            placeholder="模型"
            style="width: 180px"
            allow-clear
            :options="modelOptions"
          />
          <Select
            v-model:value="searchForm.success"
            placeholder="状态"
            style="width: 120px"
            allow-clear
            :options="successOptions"
          />
          <Input
            v-model:value="searchForm.keyword"
            placeholder="搜索模型 / 调用者 / 会话 ID"
            style="width: 240px"
            allow-clear
            @press-enter="handleSearch"
          />
          <RangePicker v-model:value="rangeValue" style="width: 260px" />
          <Button type="primary" @click="handleSearch">查询</Button>
          <Button @click="handleReset">重置</Button>
        </div>

        <Table
          :columns="columns"
          :data-source="data"
          :loading="tableLoading"
          :pagination="{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (t: number) => `共 ${t} 条`,
          }"
          :scroll="{ x: 1400 }"
          row-key="_id"
          @change="handleTableChange"
        />
      </Card>
    </div>

    <!-- 成本计算器 -->
    <div class="mt-5">
      <AiCostCalculator :pricing="pricing" />
    </div>
  </div>
</template>
