<script lang="ts" setup>
import type { AuditLogDetail, AuditLogItem, AuditLogQuery } from '#/api/audit';

import { computed, h, onMounted, reactive, ref } from 'vue';

import dayjs from 'dayjs';

import {
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Timeline,
  message,
} from 'ant-design-vue';

import {
  AUDIT_ACTIONS,
  AUDIT_MODULES,
  getAuditLogDetailApi,
  getAuditLogHistoryApi,
  getAuditLogListApi,
  restoreAuditLogApi,
} from '#/api/audit';

defineOptions({ name: 'AuditLog' });

const { RangePicker } = DatePicker;

// 不支持一键还原的模块（上传文件无文档、客服会话主键非 ObjectId）
const NON_RESTORABLE = new Set(['upload', 'chatSession']);

const actionMeta: Record<string, { color: string; label: string }> = {
  create: { color: 'green', label: '新增' },
  update: { color: 'blue', label: '修改' },
  delete: { color: 'red', label: '删除' },
};

// ---------- 列表 ----------
const loading = ref(false);
const data = ref<AuditLogItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);

const searchForm = reactive<AuditLogQuery>({
  keyword: '',
  module: undefined,
  action: undefined,
});

const rangeValue = ref<[any, any] | undefined>(undefined);

async function loadList() {
  loading.value = true;
  try {
    const res = await getAuditLogListApi({
      page: page.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword?.trim() || undefined,
      module: searchForm.module || undefined,
      action: searchForm.action || undefined,
      startTime: rangeValue.value?.[0]
        ? dayjs(rangeValue.value[0]).startOf('day').toISOString()
        : undefined,
      endTime: rangeValue.value?.[1]
        ? dayjs(rangeValue.value[1]).endOf('day').toISOString()
        : undefined,
    });
    data.value = res.items;
    total.value = res.total;
  } catch (err: any) {
    message.error(err?.message || '加载留痕记录失败');
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  page.value = 1;
  loadList();
}

function handleReset() {
  searchForm.keyword = '';
  searchForm.module = undefined;
  searchForm.action = undefined;
  rangeValue.value = undefined;
  page.value = 1;
  loadList();
}

function handleTableChange(pag: any) {
  page.value = pag.current;
  pageSize.value = pag.pageSize;
  loadList();
}

// ---------- 详情 ----------
const drawerOpen = ref(false);
const detailLoading = ref(false);
const detail = ref<AuditLogDetail | null>(null);
// 同一操作对象的全部改动记录（列表只展示最新一条，完整历史在这里看）
const history = ref<AuditLogItem[]>([]);

/** 打开详情：同时拉取当前记录详情与同一对象的完整改动历史 */
async function openDetail(record: AuditLogItem) {
  drawerOpen.value = true;
  detailLoading.value = true;
  detail.value = null;
  history.value = [];
  try {
    const [detailRes, historyRes] = await Promise.all([
      getAuditLogDetailApi(record._id),
      getAuditLogHistoryApi(record._id).catch(() => [] as AuditLogItem[]),
    ]);
    detail.value = detailRes;
    history.value = historyRes;
  } catch (err: any) {
    message.error(err?.message || '加载详情失败');
  } finally {
    detailLoading.value = false;
  }
}

/** 详情里切换到历史中的某一条改动记录 */
async function switchHistory(item: AuditLogItem) {
  if (item._id === detail.value?._id) return;
  detailLoading.value = true;
  try {
    detail.value = await getAuditLogDetailApi(item._id);
  } catch (err: any) {
    message.error(err?.message || '加载详情失败');
  } finally {
    detailLoading.value = false;
  }
}

// ---------- 一键恢复 ----------
const restoring = ref(false);

function canRestore(row: AuditLogItem | AuditLogDetail | null) {
  if (!row) return false;
  return (
    row.success &&
    !row.restored &&
    row.action !== undefined &&
    !NON_RESTORABLE.has(row.module)
  );
}

function restoreHint(action: string) {
  if (action === 'delete') return '将把被删除的数据重新还原入库（保留原 ID）';
  if (action === 'update') return '将把数据回滚到本次修改之前的内容';
  return '将撤销本次新增，删除当时创建的记录';
}

function handleRestore() {
  const row = detail.value;
  if (!row) return;
  Modal.confirm({
    title: '确认恢复到变更前？',
    content: restoreHint(row.action),
    okText: '确定恢复',
    cancelText: '取消',
    async onOk() {
      restoring.value = true;
      try {
        await restoreAuditLogApi(row._id);
        message.success('已恢复到变更前的状态');
        detail.value = { ...row, restored: true };
        history.value = history.value.map((h) =>
          h._id === row._id ? { ...h, restored: true } : h,
        );
        await loadList();
      } catch (err: any) {
        message.error(err?.message || '恢复失败');
      } finally {
        restoring.value = false;
      }
    },
  });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  return dayjs(iso).format('YYYY-MM-DD HH:mm:ss');
}

function pretty(value: unknown): string {
  if (value === null || value === undefined) return '无';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** 变更前后的差异字段（仅展示真正变化的 key） */
const changedFields = computed(() => {
  const row = detail.value;
  if (!row?.before || !row?.after) return [];
  const before = Array.isArray(row.before) ? row.before[0] : (row.before as any);
  const after = Array.isArray(row.after) ? row.after[0] : (row.after as any);
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const list: { field: string; from: string; to: string }[] = [];
  for (const key of keys) {
    if (['updatedAt', 'createdAt'].includes(key)) continue;
    const a = JSON.stringify(before[key] ?? null);
    const b = JSON.stringify(after[key] ?? null);
    if (a !== b) {
      list.push({ field: key, from: String(a).slice(0, 200), to: String(b).slice(0, 200) });
    }
  }
  return list;
});

// ---------- 列定义 ----------
const columns = computed(() => [
  {
    title: '操作时间',
    dataIndex: 'createdAt',
    width: 180,
    customRender: ({ text }: { text: string }) => fmtDate(text),
  },
  {
    title: '操作人',
    dataIndex: ['operator', 'username'],
    width: 140,
    customRender: ({ record }: { record: AuditLogItem }) =>
      h(Space, { size: 4 }, () => [
        h('span', {}, record.operator?.username || '访客'),
        record.operator?.role === 'admin'
          ? h(Tag, { color: 'gold' }, () => '管理员')
          : null,
      ]),
  },
  {
    title: '模块',
    dataIndex: 'moduleLabel',
    width: 120,
    customRender: ({ text }: { text: string }) => text || '-',
  },
  {
    title: '动作',
    dataIndex: 'action',
    width: 90,
    customRender: ({ text }: { text: string }) => {
      const meta = actionMeta[text] || { color: 'default', label: text };
      return h(Tag, { color: meta.color }, () => meta.label);
    },
  },
  {
    title: '操作对象',
    dataIndex: 'targetLabel',
    ellipsis: true,
    customRender: ({ record }: { record: AuditLogItem }) =>
      record.targetLabel || record.targetId || record.path,
  },
  {
    title: '改动次数',
    dataIndex: 'changeCount',
    width: 110,
    customRender: ({ record }: { record: AuditLogItem }) => {
      const count = record.changeCount ?? 1;
      return count > 1
        ? h(Tag, { color: 'processing' }, () => `共 ${count} 次`)
        : h('span', { class: 'text-gray-400 dark:text-gray-500' }, '1 次');
    },
  },
  {
    title: '结果',
    dataIndex: 'success',
    width: 110,
    customRender: ({ record }: { record: AuditLogItem }) =>
      record.success
        ? h(Tag, { color: 'success' }, () => '成功')
        : h(Tag, { color: 'error' }, () => `${record.statusCode || '失败'}`),
  },
  {
    title: '恢复状态',
    dataIndex: 'restored',
    width: 120,
    customRender: ({ record }: { record: AuditLogItem }) =>
      record.restored
        ? h(Tag, { color: 'purple' }, () => '已恢复')
        : h('span', { class: 'text-gray-400 dark:text-gray-500' }, '—'),
  },
  {
    title: '操作',
    key: 'action',
    width: 100,
    fixed: 'right' as const,
    customRender: ({ record }: { record: AuditLogItem }) =>
      h(
        Button,
        { type: 'link', size: 'small', onClick: () => openDetail(record) },
        () => '查看详情',
      ),
  },
]);

onMounted(loadList);
</script>

<template>
  <div class="p-4">
    <!-- 搜索区 -->
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <Input
        v-model:value="searchForm.keyword"
        placeholder="搜索对象名称 / 接口路径 / 操作人"
        style="width: 260px"
        allow-clear
        @press-enter="handleSearch"
      />
      <Select
        v-model:value="searchForm.module"
        placeholder="模块"
        style="width: 150px"
        allow-clear
        :options="AUDIT_MODULES"
      />
      <Select
        v-model:value="searchForm.action"
        placeholder="操作类型"
        style="width: 140px"
        allow-clear
        :options="AUDIT_ACTIONS"
      />
      <RangePicker v-model:value="rangeValue" style="width: 260px" />
      <Button type="primary" @click="handleSearch">搜索</Button>
      <Button @click="handleReset">重置</Button>
    </div>

    <!-- 说明 -->
    <div class="mb-3 text-xs text-gray-400 dark:text-gray-500">
      系统自动记录所有新增 / 修改 / 删除操作（含变更前后完整数据），可在详情中一键恢复到变更前状态；
      列表按操作对象聚合，只显示最新一次改动，完整改动历史见详情
    </div>

    <Table
      :columns="columns"
      :data-source="data"
      :loading="loading"
      :pagination="{
        current: page,
        pageSize,
        total,
        showSizeChanger: true,
        showQuickJumper: true,
        showTotal: (t: number) => `共 ${t} 条`,
      }"
      :scroll="{ x: 1320 }"
      row-key="_id"
      @change="handleTableChange"
    />

    <!-- 详情抽屉 -->
    <Drawer
      v-model:open="drawerOpen"
      title="留痕详情"
      :width="720"
      :body-style="{ paddingBottom: '24px' }"
    >
      <div v-if="detailLoading && !detail" class="py-10 text-center text-gray-400">加载中…</div>
      <template v-else-if="detail">
        <Descriptions :column="2" size="small" bordered>
          <Descriptions.Item label="操作时间">
            {{ fmtDate(detail.createdAt) }}
          </Descriptions.Item>
          <Descriptions.Item label="动作">
            <Tag :color="actionMeta[detail.action]?.color">
              {{ actionMeta[detail.action]?.label || detail.action }}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="模块">{{ detail.moduleLabel }}</Descriptions.Item>
          <Descriptions.Item label="操作人">
            {{ detail.operator?.username || '访客' }}
            <Tag v-if="detail.operator?.role === 'admin'" color="gold">管理员</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="对象" :span="2">
            {{ detail.targetLabel || detail.targetId || '-' }}
          </Descriptions.Item>
          <Descriptions.Item label="接口" :span="2">
            {{ detail.method }} {{ detail.path }}
          </Descriptions.Item>
          <Descriptions.Item label="结果">
            <Tag :color="detail.success ? 'success' : 'error'">
              {{ detail.success ? '成功' : `失败 ${detail.statusCode}` }}
            </Tag>
            <span v-if="detail.errorMessage" class="ml-2 text-xs text-red-500">
              {{ detail.errorMessage }}
            </span>
          </Descriptions.Item>
          <Descriptions.Item label="恢复状态">
            <Tag v-if="detail.restored" color="purple">
              已恢复（{{ detail.restoredBy || '-' }} · {{ fmtDate(detail.restoredAt) }}）
            </Tag>
            <span v-else class="text-gray-400">未恢复</span>
          </Descriptions.Item>
        </Descriptions>

        <!-- 该操作对象的完整改动历史（列表只展示最新一条，全部记录在这里看） -->
        <div v-if="history.length > 0" class="mt-5">
          <div class="mb-2 text-sm font-semibold">
            改动历史（共 {{ history.length }} 次）
            <span v-if="history.length > 1" class="ml-2 text-xs font-normal text-gray-400">
              点击可切换查看每一次的变更内容
            </span>
          </div>
          <Timeline class="mt-2">
            <Timeline.Item
              v-for="item in history"
              :key="item._id"
              :color="item._id === detail._id ? 'blue' : 'gray'"
            >
              <div
                class="cursor-pointer rounded px-2 py-1 text-xs transition-colors"
                :class="
                  item._id === detail._id
                    ? 'bg-gray-100 dark:bg-gray-800'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                "
                @click="switchHistory(item)"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-gray-500">{{ fmtDate(item.createdAt) }}</span>
                  <Tag :color="actionMeta[item.action]?.color">
                    {{ actionMeta[item.action]?.label || item.action }}
                  </Tag>
                  <span>{{ item.operator?.username || '访客' }}</span>
                  <Tag v-if="item.restored" color="purple">已恢复</Tag>
                  <Tag v-if="!item.success" color="error">
                    失败 {{ item.statusCode }}
                  </Tag>
                </div>
                <div class="mt-0.5 break-all text-gray-400">
                  {{ item.method }} {{ item.path }}
                </div>
              </div>
            </Timeline.Item>
          </Timeline>
        </div>

        <!-- 字段级差异 -->
        <div v-if="changedFields.length" class="mt-5">
          <div class="mb-2 text-sm font-semibold">变更字段</div>
          <div class="rounded border border-solid">
            <div
              v-for="item in changedFields"
              :key="item.field"
              class="flex gap-2 border-b border-solid px-3 py-2 text-xs last:border-b-0"
            >
              <span class="w-28 shrink-0 font-medium">{{ item.field }}</span>
              <span class="flex-1 break-all text-red-500">- {{ item.from }}</span>
              <span class="flex-1 break-all text-green-600">+ {{ item.to }}</span>
            </div>
          </div>
        </div>

        <!-- 变更前 / 变更后完整快照 -->
        <div class="mt-5 grid grid-cols-2 gap-3">
          <div>
            <div class="mb-2 text-sm font-semibold">变更前</div>
            <pre
              class="max-h-80 overflow-auto rounded border border-solid p-3 text-xs leading-5"
              >{{ pretty(detail.before) }}</pre
            >
          </div>
          <div>
            <div class="mb-2 text-sm font-semibold">变更后</div>
            <pre
              class="max-h-80 overflow-auto rounded border border-solid p-3 text-xs leading-5"
              >{{ pretty(detail.after) }}</pre
            >
          </div>
        </div>

        <div v-if="canRestore(detail)" class="mt-6">
          <Button type="primary" danger :loading="restoring" @click="handleRestore">
            一键恢复到变更前
          </Button>
          <span class="ml-3 text-xs text-gray-400">{{ restoreHint(detail.action) }}</span>
        </div>
      </template>
    </Drawer>
  </div>
</template>
