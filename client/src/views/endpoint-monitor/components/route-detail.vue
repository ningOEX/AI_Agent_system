<script lang="ts" setup>
import type { EndpointCatalogItem, EndpointRouteDetail } from '#/api/endpointMonitor';

import { computed } from 'vue';

import dayjs from 'dayjs';

import { Descriptions, Drawer, Tag, Typography } from 'ant-design-vue';

defineOptions({ name: 'RouteDetailDrawer' });

const props = defineProps<{
  open: boolean;
  routeKey: string;
  data: EndpointRouteDetail | null;
  loading: boolean;
}>();

const emit = defineEmits<{ (e: 'update:open', val: boolean): void }>();

function close() {
  emit('update:open', false);
}

const catalog = computed<EndpointCatalogItem | null>(() => props.data?.catalog || null);
const stats = computed(() => props.data?.stats || null);
const recent = computed(() => props.data?.recent || []);

function fmtDate(iso: string | undefined) {
  if (!iso) return '-';
  return dayjs(iso).format('YYYY-MM-DD HH:mm:ss');
}

const authLabel: Record<string, { color: string; label: string }> = {
  public: { color: 'green', label: '无需登录' },
  login: { color: 'blue', label: '登录可用' },
  admin: { color: 'red', label: '仅管理员' },
};

const methodColors: Record<string, string> = {
  GET: 'green',
  POST: 'blue',
  PUT: 'orange',
  PATCH: 'cyan',
  DELETE: 'red',
  OPTIONS: 'gray',
};
</script>

<template>
  <Drawer
    :open="open"
    :width="780"
    :title="false"
    :body-style="{ paddingBottom: '24px' }"
    @close="close"
  >
    <div v-if="loading" class="py-10 text-center text-gray-400">加载中…</div>
    <template v-else-if="catalog || stats">
      <!-- 路由标题 -->
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <Tag :color="methodColors[(catalog?.method || routeKey.split(' ')[0]) as string] || 'default'">
          {{ catalog?.method || routeKey.split(' ')[0] }}
        </Tag>
        <Typography.Text copyable class="font-mono text-sm">
          {{ catalog?.path || routeKey.slice(routeKey.indexOf(' ') + 1) }}
        </Typography.Text>
        <Tag v-if="catalog?.auth" :color="authLabel[catalog.auth]?.color">
          {{ authLabel[catalog.auth]?.label || catalog.auth }}
        </Tag>
      </div>

      <div v-if="catalog" class="mb-6">
        <div class="mb-1 text-base font-semibold">{{ catalog.name }}</div>
        <div class="text-sm text-gray-500">{{ catalog.description }}</div>
        <div v-if="catalog.notes" class="mt-2 rounded bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-800">
          {{ catalog.notes }}
        </div>
      </div>

      <!-- 实时聚合统计 -->
      <div v-if="stats" class="mb-6">
        <div class="mb-2 text-sm font-semibold">实时聚合（近 {{ data?.days }} 天）</div>
        <div class="grid grid-cols-4 gap-3">
          <div class="rounded border border-solid p-3 text-center">
            <div class="text-xs text-gray-500">总调用</div>
            <div class="text-lg font-semibold">{{ stats.calls }}</div>
          </div>
          <div class="rounded border border-solid p-3 text-center">
            <div class="text-xs text-gray-500">成功率</div>
            <div class="text-lg font-semibold text-green-600">{{ stats.successRate }}%</div>
          </div>
          <div class="rounded border border-solid p-3 text-center">
            <div class="text-xs text-gray-500">平均耗时</div>
            <div class="text-lg font-semibold">{{ stats.avgMs }} ms</div>
          </div>
          <div class="rounded border border-solid p-3 text-center">
            <div class="text-xs text-gray-500">峰值耗时</div>
            <div class="text-lg font-semibold">{{ stats.maxMs }} ms</div>
          </div>
          <div class="rounded border border-solid p-3 text-center">
            <div class="text-xs text-gray-500">失败数</div>
            <div class="text-lg font-semibold text-red-500">{{ stats.failedCalls }}</div>
          </div>
          <div class="rounded border border-solid p-3 text-center">
            <div class="text-xs text-gray-500">4xx</div>
            <div class="text-lg font-semibold text-orange-500">{{ stats.error4xx }}</div>
          </div>
          <div class="rounded border border-solid p-3 text-center">
            <div class="text-xs text-gray-500">5xx</div>
            <div class="text-lg font-semibold text-red-600">{{ stats.error5xx }}</div>
          </div>
          <div class="rounded border border-solid p-3 text-center">
            <div class="text-xs text-gray-500">最快</div>
            <div class="text-lg font-semibold">{{ stats.minMs }} ms</div>
          </div>
        </div>
      </div>
      <div v-else class="mb-6 rounded bg-gray-50 p-4 text-center text-sm text-gray-500 dark:bg-gray-800">
        暂无调用记录（可能是 catalog 未收录或该路由尚未被观测到）
      </div>

      <!-- 接口文档 -->
      <div v-if="catalog" class="mb-6">
        <div class="mb-2 text-sm font-semibold">接口文档</div>
        <Descriptions :column="1" size="small" bordered>
          <Descriptions.Item label="请求方式">
            <Tag :color="methodColors[catalog.method] || 'default'">{{ catalog.method }}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="路径">
            <code class="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-800">
              {{ catalog.path }}
            </code>
          </Descriptions.Item>
          <Descriptions.Item label="所属分组">{{ catalog.group }}</Descriptions.Item>
          <Descriptions.Item label="鉴权要求">
            <Tag :color="authLabel[catalog.auth]?.color">{{ authLabel[catalog.auth]?.label || catalog.auth }}</Tag>
          </Descriptions.Item>
        </Descriptions>

        <!-- Path params -->
        <template v-if="catalog.params?.path?.length">
          <div class="mt-3 text-xs font-semibold">路径参数</div>
          <table class="mt-1 w-full border-collapse border border-solid text-xs">
            <thead>
              <tr class="bg-gray-50 text-left dark:bg-gray-800">
                <th class="border border-solid px-2 py-1">参数</th>
                <th class="border border-solid px-2 py-1">类型</th>
                <th class="border border-solid px-2 py-1">必填</th>
                <th class="border border-solid px-2 py-1">说明</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in catalog.params.path" :key="p.name">
                <td class="border border-solid px-2 py-1 font-mono">{{ p.name }}</td>
                <td class="border border-solid px-2 py-1">{{ p.type }}</td>
                <td class="border border-solid px-2 py-1">
                  <Tag v-if="p.required" color="red">必填</Tag>
                  <span v-else class="text-gray-400">可选</span>
                </td>
                <td class="border border-solid px-2 py-1 text-gray-600">{{ p.desc || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </template>

        <!-- Query params -->
        <template v-if="catalog.params?.query?.length">
          <div class="mt-3 text-xs font-semibold">查询参数</div>
          <table class="mt-1 w-full border-collapse border border-solid text-xs">
            <thead>
              <tr class="bg-gray-50 text-left dark:bg-gray-800">
                <th class="border border-solid px-2 py-1">参数</th>
                <th class="border border-solid px-2 py-1">类型</th>
                <th class="border border-solid px-2 py-1">必填</th>
                <th class="border border-solid px-2 py-1">说明</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in catalog.params.query" :key="p.name">
                <td class="border border-solid px-2 py-1 font-mono">{{ p.name }}</td>
                <td class="border border-solid px-2 py-1">{{ p.type }}</td>
                <td class="border border-solid px-2 py-1">
                  <Tag v-if="p.required" color="red">必填</Tag>
                  <span v-else class="text-gray-400">可选</span>
                </td>
                <td class="border border-solid px-2 py-1 text-gray-600">{{ p.desc || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </template>

        <!-- Body params -->
        <template v-if="catalog.params?.body?.length">
          <div class="mt-3 text-xs font-semibold">请求体（JSON）</div>
          <table class="mt-1 w-full border-collapse border border-solid text-xs">
            <thead>
              <tr class="bg-gray-50 text-left dark:bg-gray-800">
                <th class="border border-solid px-2 py-1">字段</th>
                <th class="border border-solid px-2 py-1">类型</th>
                <th class="border border-solid px-2 py-1">必填</th>
                <th class="border border-solid px-2 py-1">说明</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in catalog.params.body" :key="p.name">
                <td class="border border-solid px-2 py-1 font-mono">{{ p.name }}</td>
                <td class="border border-solid px-2 py-1">{{ p.type }}</td>
                <td class="border border-solid px-2 py-1">
                  <Tag v-if="p.required" color="red">必填</Tag>
                  <span v-else class="text-gray-400">可选</span>
                </td>
                <td class="border border-solid px-2 py-1 text-gray-600">{{ p.desc || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </template>

        <!-- Response example -->
        <template v-if="catalog.response">
          <div class="mt-3 text-xs font-semibold">响应示例</div>
          <pre class="mt-1 max-h-60 overflow-auto rounded bg-gray-900 p-3 text-xs leading-5 text-gray-100">{{ catalog.response }}</pre>
        </template>
      </div>

      <!-- 最近调用样例 -->
      <div v-if="recent.length" class="mt-6">
        <div class="mb-2 text-sm font-semibold">最近调用样例（共 {{ recent.length }} 条）</div>
        <div class="space-y-2">
          <div
            v-for="item in recent"
            :key="item._id"
            class="rounded border border-solid px-3 py-2 text-xs"
          >
            <div class="flex items-center gap-2">
              <Tag
                :color="item.success ? 'success' : 'error'"
                :bordered="false"
              >
                {{ item.statusCode }}
              </Tag>
              <span class="font-mono">{{ item.method }}</span>
              <span class="truncate flex-1">{{ item.path }}</span>
              <span class="text-gray-400">{{ item.durationMs }} ms</span>
            </div>
            <div class="mt-1 text-gray-400">
              {{ fmtDate(item.createdAt) }} · {{ item.user?.username || '匿名访客' }} ·
              {{ item.ip || '-' }}
            </div>
          </div>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="py-10 text-center text-gray-400">未找到该路由</div>
    </template>
  </Drawer>
</template>
