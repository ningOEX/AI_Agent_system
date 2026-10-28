<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import type {
  EndpointCatalogItem,
  EndpointCallItem,
  EndpointDistributionItem,
  EndpointRouteDetail,
  EndpointTrendItem,
} from '#/api/endpointMonitor';

import { computed, h, nextTick, onMounted, reactive, ref } from 'vue';

import dayjs from 'dayjs';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import {
  Button,
  Card,
  DatePicker,
  Input,
  Select,
  Table,
  Tag,
  message,
} from 'ant-design-vue';

import {
  getEndpointCatalogApi,
  getEndpointDistributionApi,
  getEndpointListApi,
  getEndpointOverviewApi,
  getEndpointRouteDetailApi,
  getEndpointTrendApi,
} from '#/api/endpointMonitor';

import RouteDetailDrawer from './components/route-detail.vue';

defineOptions({ name: 'EndpointMonitor' });

const { RangePicker } = DatePicker;

// ---------- 概览 / 图表 ----------
const loading = ref(true);
const days = ref(14);
const overview = ref<Awaited<ReturnType<typeof getEndpointOverviewApi>> | null>(null);
const trend = ref<EndpointTrendItem[]>([]);
const distributionBy = ref<'route' | 'group' | 'status'>('route');
const distribution = ref<EndpointDistributionItem[]>([]);
const catalog = ref<EndpointCatalogItem[]>([]);

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
      sub: `成功率 ${ov.successRate}% · 今日 ${t.calls} 次`,
      color: '#5ab1ef',
    },
    {
      key: 'fail',
      label: '异常调用',
      value: (ov.error4xx + ov.error5xx).toLocaleString(),
      sub: `4xx ${ov.error4xx} · 5xx ${ov.error5xx}`,
      color: ov.error4xx + ov.error5xx > 0 ? '#ef4444' : '#10b981',
    },
    {
      key: 'latency',
      label: '平均耗时',
      value: `${ov.avgMs} ms`,
      sub: `峰值 ${ov.maxMs} ms · P95 ≈ ${Math.round(ov.maxMs * 0.95)} ms`,
      color: '#f59e0b',
    },
    {
      key: 'routes',
      label: '独立路由 / 覆盖率',
      value: ov.uniqueRoutes.toString(),
      sub: `已收录 ${ov.catalogCovered} / 覆盖率 ${ov.catalogCoverage}%`,
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
  { label: '按接口', value: 'route' },
  { label: '按分组', value: 'group' },
  { label: '按状态段', value: 'status' },
];

async function renderCharts() {
  const t = trend.value;
  if (t.length) {
    renderTrend({
      color: ['#5ab1ef', '#ef4444', '#f59e0b'],
      grid: { bottom: 0, containLabel: true, left: '1%', right: '3%', top: 36 },
      legend: { top: 0, right: 0 },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: t.map((d) => d.date.slice(5)),
        axisTick: { show: false },
      },
      yAxis: [
        { type: 'value', name: '次数', minInterval: 1, splitNumber: 4 },
        { type: 'value', name: 'ms', splitNumber: 4 },
      ],
      series: [
        {
          name: '调用次数',
          type: 'line',
          smooth: true,
          yAxisIndex: 0,
          areaStyle: { opacity: 0.12 },
          data: t.map((d) => d.calls),
        },
        {
          name: '失败',
          type: 'line',
          smooth: true,
          yAxisIndex: 0,
          data: t.map((d) => d.failedCalls),
        },
        {
          name: '平均耗时',
          type: 'line',
          smooth: true,
          yAxisIndex: 1,
          data: t.map((d) => d.avgMs),
        },
      ],
    });
  }

  renderPie(sunburstOption(distribution.value));
}

/** 按成功率映射颜色：高=绿，低=红 */
function rateColor(rate: number): string {
  if (rate >= 95) return '#10b981';
  if (rate >= 80) return '#84cc16';
  if (rate >= 60) return '#f59e0b';
  return '#ef4444';
}

/**
 * 旭日图（Sunburst）：扇区角度 = 调用次数，颜色 = 成功率。
 * - by=route：内圈=分组，外圈=分组下的接口路由（层级结构）
 * - by=group / by=status：单层环形分布
 */
function sunburstOption(items: EndpointDistributionItem[]): Record<string, unknown> {
  if (!items.length) {
    return {
      title: { text: '暂无数据', left: 'center', top: 'center', textStyle: { color: '#999' } },
    };
  }

  const TOP_CHILDREN = 8; // 每个分组最多展示的子路由数，其余合并为「其他」

  // 单层分布（by=group / by=status）
  const singleLevel = distributionBy.value !== 'route' || !items.some((i) => i.group);

  if (singleLevel) {
    const sorted = [...items].sort((a, b) => b.calls - a.calls);
    const top = sorted.slice(0, 30);
    const rest = sorted.slice(30);
    const data: Array<{ name: string; value: number; itemStyle: { color: string }; _raw?: EndpointDistributionItem }> = top.map((d) => ({
      name: d.name,
      value: d.calls,
      itemStyle: { color: rateColor(d.successRate) },
      _raw: d,
    }));
    if (rest.length) {
      const sumCalls = rest.reduce((s, r) => s + r.calls, 0);
      const avgRate = Math.round(
        rest.reduce((s, r) => s + r.calls * r.successRate, 0) / Math.max(1, sumCalls),
      );
      data.push({
        name: `其他 (${rest.length}项)`,
        value: sumCalls,
        itemStyle: { color: rateColor(avgRate) },
      });
    }
    return buildSunburst(data, false);
  }

  // 两层分布（by=route）：分组 → 路由
  const groupMap = new Map<string, EndpointDistributionItem[]>();
  for (const item of items) {
    const g = item.group || '未分组';
    if (!groupMap.has(g)) groupMap.set(g, []);
    groupMap.get(g)!.push(item);
  }

  const data = Array.from(groupMap.entries()).map(([groupName, children]) => {
    const sorted = [...children].sort((a, b) => b.calls - a.calls);
    const top = sorted.slice(0, TOP_CHILDREN);
    const rest = sorted.slice(TOP_CHILDREN);
    const childNodes: Array<{ name: string; value: number; itemStyle: { color: string }; _raw?: EndpointDistributionItem }> = top.map((c) => ({
      name: c.name,
      value: c.calls,
      itemStyle: { color: rateColor(c.successRate) },
      _raw: c,
    }));
    if (rest.length) {
      const sumCalls = rest.reduce((s, r) => s + r.calls, 0);
      const avgRate = Math.round(
        rest.reduce((s, r) => s + r.calls * r.successRate, 0) / Math.max(1, sumCalls),
      );
      childNodes.push({
        name: `其他 (${rest.length}项)`,
        value: sumCalls,
        itemStyle: { color: rateColor(avgRate) },
      });
    }
    const groupCalls = children.reduce((s, c) => s + c.calls, 0);
    const groupRate = Math.round(
      children.reduce((s, c) => s + c.calls * c.successRate, 0) / Math.max(1, groupCalls),
    );
    return {
      name: groupName,
      value: groupCalls,
      itemStyle: { color: rateColor(groupRate) },
      children: childNodes,
    };
  });

  // 按分组调用量降序，让大分组从 12 点方向顺时针排列
  data.sort((a, b) => b.value - a.value);

  return buildSunburst(data, true);
}

/** 构造旭日图 option（单层 / 双层共用） */
function buildSunburst(
  data: Array<{ name: string; value: number; itemStyle: { color: string }; children?: unknown[]; _raw?: EndpointDistributionItem }>,
  hasLevels: boolean,
): Record<string, unknown> {
  const levels = hasLevels
    ? [
        { r0: 0, r: '30%', label: { show: true, fontSize: 12, fontWeight: 'bold' } },
        { r0: '30%', r: '95%', label: { show: true, fontSize: 10, rotate: 'radial' } },
      ]
    : [{ r0: '20%', r: '95%', label: { show: true, fontSize: 11, rotate: 'radial' } }];

  return {
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => {
        const raw = p.data._raw as EndpointDistributionItem | undefined;
        if (raw) {
          return [
            `<b>${raw.name}</b>`,
            `调用次数：${raw.calls}`,
            `成功率：${raw.successRate}%`,
            `平均耗时：${raw.avgMs} ms`,
            raw.method ? `方法：${raw.method}` : '',
            raw.group ? `分组：${raw.group}` : '',
          ]
            .filter(Boolean)
            .join('<br/>');
        }
        // 分组节点（无 _raw）：展示聚合信息
        const total = p.data.value || 0;
        return `<b>${p.data.name}</b><br/>调用次数：${total}`;
      },
    },
    series: [
      {
        type: 'sunburst' as const,
        data,
        radius: [0, '95%'],
        center: ['50%', '52%'],
        nodeClick: false,
        sort: undefined, // 保持传入顺序（已按调用量排序）
        levels,
        emphasis: {
          focus: 'ancestor',
          itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' },
        },
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: {
          color: '#fff',
          textBorderColor: 'rgba(0,0,0,0.3)',
          textBorderWidth: 1,
        },
      },
    ],
  };
}

async function loadOverview() {
  loading.value = true;
  try {
    const [ov, tr, di, ca] = await Promise.all([
      getEndpointOverviewApi(days.value),
      getEndpointTrendApi(days.value),
      getEndpointDistributionApi(distributionBy.value, days.value),
      getEndpointCatalogApi().catch(() => ({ groups: [], items: [] })),
    ]);
    overview.value = ov;
    trend.value = tr.trend;
    distribution.value = di.items;
    catalog.value = ca.items;
  } catch (err: any) {
    message.error(err?.message || '加载接口监控数据失败');
  } finally {
    loading.value = false;
  }
  await nextTick();
  renderCharts();
}

async function changeDistributionBy() {
  try {
    const di = await getEndpointDistributionApi(distributionBy.value, days.value);
    distribution.value = di.items;
  } catch (err: any) {
    message.error(err?.message || '加载分布失败');
    return;
  }
  renderPie(sunburstOption(distribution.value));
}

// ---------- 路由列表（从 distribution by=route 取） ----------
const routeRows = computed(() => {
  if (distributionBy.value !== 'route') return distribution.value;
  return distribution.value;
});

function openDetail(record: EndpointDistributionItem) {
  const raw = record.routeKey;
  if (!raw) return;
  drawerRouteKey.value = raw;
  drawerOpen.value = true;
  drawerLoading.value = true;
  drawerData.value = null;
  getEndpointRouteDetailApi(raw, days.value)
    .then((res) => (drawerData.value = res))
    .catch((err: any) => message.error(err?.message || '加载详情失败'))
    .finally(() => (drawerLoading.value = false));
}

// ---------- 抽屉 ----------
const drawerOpen = ref(false);
const drawerLoading = ref(false);
const drawerRouteKey = ref('');
const drawerData = ref<EndpointRouteDetail | null>(null);

// ---------- 明细表 ----------
const tableLoading = ref(false);
const data = ref<EndpointCallItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);

const searchForm = reactive({
  keyword: '',
  statusCode: undefined as number | undefined,
  success: undefined as string | undefined,
});
const rangeValue = ref<[any, any] | undefined>(undefined);

async function loadList() {
  tableLoading.value = true;
  try {
    const res = await getEndpointListApi({
      page: page.value,
      pageSize: pageSize.value,
      statusCode: searchForm.statusCode,
      success: searchForm.success,
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
    message.error(err?.message || '加载接口明细失败');
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
  searchForm.statusCode = undefined;
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

// ---------- 列定义 ----------
const statusSegColor = (code: number) => {
  if (code < 300) return 'success';
  if (code < 400) return 'blue';
  if (code < 500) return 'orange';
  return 'error';
};

const routeColumns = computed(() => [
  {
    title: '接口',
    dataIndex: 'name',
    width: 260,
    customRender: ({ record }: { record: EndpointDistributionItem }) => {
      return h('div', { class: 'flex items-center gap-1.5 min-w-0' }, [
        h(Tag, { color: record.method === 'GET' ? 'green' : record.method === 'POST' ? 'blue' : 'orange', bordered: false }, () => record.method || '-'),
        h('code', { class: 'font-mono text-xs text-gray-600 truncate' }, record.path || record.name),
      ]);
    },
  },
  { title: '分组', dataIndex: 'group', width: 110 },
  {
    title: '调用次数',
    dataIndex: 'calls',
    width: 100,
    sorter: (a: EndpointDistributionItem, b: EndpointDistributionItem) => a.calls - b.calls,
  },
  {
    title: '成功率',
    dataIndex: 'successRate',
    width: 100,
    customRender: ({ text }: { text: number }) => `${text}%`,
    sorter: (a: EndpointDistributionItem, b: EndpointDistributionItem) => a.successRate - b.successRate,
  },
  {
    title: '平均耗时',
    dataIndex: 'avgMs',
    width: 110,
    customRender: ({ text }: { text: number }) => `${text} ms`,
    sorter: (a: EndpointDistributionItem, b: EndpointDistributionItem) => a.avgMs - b.avgMs,
  },
  {
    title: '操作',
    key: 'action',
    width: 90,
    fixed: 'right' as const,
    customRender: ({ record }: { record: EndpointDistributionItem }) =>
      h(Button, { type: 'link', size: 'small', onClick: () => openDetail(record) }, () => '接口文档'),
  },
]);

const detailColumns = [
  {
    title: '时间',
    dataIndex: 'createdAt',
    width: 170,
    customRender: ({ text }: { text: string }) => dayjs(text).format('YYYY-MM-DD HH:mm:ss'),
  },
  {
    title: '接口',
    dataIndex: 'routeKey',
    width: 240,
    customRender: ({ record }: { record: EndpointCallItem }) =>
      h('div', { class: 'flex items-center gap-1.5' }, [
        h(Tag, { color: record.method === 'GET' ? 'green' : 'blue', bordered: false }, () => record.method),
        h('code', { class: 'font-mono text-xs truncate' }, record.path),
      ]),
  },
  {
    title: '状态码',
    dataIndex: 'statusCode',
    width: 90,
    customRender: ({ text }: { text: number }) => h(Tag, { color: statusSegColor(text), bordered: false }, () => text),
  },
  {
    title: '耗时',
    dataIndex: 'durationMs',
    width: 100,
    customRender: ({ text }: { text: number }) => `${text} ms`,
  },
  {
    title: '调用者',
    dataIndex: ['user', 'username'],
    width: 140,
    customRender: ({ record }: { record: EndpointCallItem }) =>
      record.user?.username || '匿名访客',
  },
  { title: 'IP', dataIndex: 'ip', width: 130 },
  { title: '路由键', dataIndex: 'routeKey', width: 240, ellipsis: true },
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
            <span>调用分布</span>
            <Select
              v-model:value="distributionBy"
              :options="byOptions"
              size="small"
              style="width: 110px"
              @change="changeDistributionBy"
            />
          </div>
        </template>
        <EchartsUI ref="pieRef" height="300px" />
      </Card>
    </div>

    <!-- 路由列表（聚合 + 点击看接口文档） -->
    <div class="mt-5">
      <Card
        title="路由聚合"
        :bordered="false"
        extra="点击「接口文档」查看该路由的完整文档 + 实时调用聚合数据"
      >
        <Table
          :columns="routeColumns"
          :data-source="routeRows"
          :loading="loading"
          :pagination="{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 个路由`,
          }"
          :scroll="{ x: 900 }"
          row-key="routeKey"
        />
      </Card>
    </div>

    <!-- 调用明细 -->
    <div class="mt-5">
      <Card title="调用明细（单请求）" :bordered="false">
        <div class="mb-4 flex flex-wrap items-center gap-3">
          <Select
            v-model:value="searchForm.statusCode"
            placeholder="状态码"
            style="width: 110px"
            allow-clear
            :options="[
              { label: '2xx 成功', value: 200 },
              { label: '3xx 重定向', value: 304 },
              { label: '4xx 客户端错误', value: 404 },
              { label: '5xx 服务端错误', value: 500 },
            ]"
          />
          <Select
            v-model:value="searchForm.success"
            placeholder="结果"
            style="width: 110px"
            allow-clear
            :options="[
              { label: '成功', value: 'true' },
              { label: '失败', value: 'false' },
            ]"
          />
          <Input
            v-model:value="searchForm.keyword"
            placeholder="搜索路径 / 调用者"
            style="width: 220px"
            allow-clear
            @press-enter="handleSearch"
          />
          <RangePicker v-model:value="rangeValue" style="width: 260px" />
          <Button type="primary" @click="handleSearch">查询</Button>
          <Button @click="handleReset">重置</Button>
        </div>

        <Table
          :columns="detailColumns"
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
          :scroll="{ x: 1100 }"
          row-key="_id"
          @change="handleTableChange"
        />
      </Card>
    </div>

    <!-- 接口文档抽屉 -->
    <RouteDetailDrawer
      v-model:open="drawerOpen"
      :route-key="drawerRouteKey"
      :data="drawerData"
      :loading="drawerLoading"
    />
  </div>
</template>
