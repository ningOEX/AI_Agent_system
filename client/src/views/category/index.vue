<script lang="ts" setup>
import { computed, h, onMounted, ref } from 'vue';

import { Button, Card, Input, Modal, Select, Space, Table, Tag, message } from 'ant-design-vue';

import {
  createCategoryApi,
  deleteCategoryApi,
  getCategoriesApi,
  updateCategoryApi,
  type CategoryItem,
} from '#/api/taxonomy';

defineOptions({ name: 'CategoryManage' });

// 8 个 AntDV Tag 语义色名（ConfigProvider dark 下自动切暗版）
const PRESET_NAMES = ['blue', 'green', 'orange', 'purple', 'cyan', 'magenta', 'red', 'gold'] as const;

const currentColor = computed(() => form.value.color || '');

const list = ref<CategoryItem[]>([]);
const loading = ref(false);

const modalOpen = ref(false);
const editing = ref<CategoryItem | null>(null);
const form = ref({ name: '', color: '' });

async function load() {
  loading.value = true;
  try {
    list.value = await getCategoriesApi();
  } catch (err: any) {
    message.error(err?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = null;
  form.value = { name: '', color: '' };
  modalOpen.value = true;
}
function openEdit(row: CategoryItem) {
  editing.value = row;
  form.value = { name: row.name, color: row.color || '' };
  modalOpen.value = true;
}

async function submit() {
  const name = form.value.name.trim();
  if (!name) {
    message.warning('请输入分类名称');
    return;
  }
  try {
    if (editing.value) {
      await updateCategoryApi(editing.value._id, { name, color: form.value.color });
      message.success('已更新');
    } else {
      await createCategoryApi({ name, color: form.value.color });
      message.success('已创建');
    }
    modalOpen.value = false;
    await load();
  } catch (err: any) {
    message.error(err?.message || '保存失败');
  }
}

async function handleDelete(row: CategoryItem) {
  Modal.confirm({
    title: `删除分类「${row.name}」？`,
    content: `所有文章的分类字段包含「${row.name}」的将被清空，共 ${row.useCount} 篇会受影响`,
    okType: 'danger',
    async onOk() {
      try {
        await deleteCategoryApi(row._id);
        message.success('已删除');
        await load();
      } catch (err: any) {
        message.error(err?.message || '删除失败');
      }
    },
  });
}

const columns = computed(() => [
  { title: '名称', dataIndex: 'name', key: 'name' },
  {
    title: '颜色',
    dataIndex: 'color',
    key: 'color',
    customRender: ({ record }: { record: CategoryItem }) =>
      record.color
        ? h(Tag, { color: record.color }, { default: () => record.color })
        : h('span', { class: 'text-gray-400 dark:text-gray-500' }, '—'),
  },
  {
    title: '使用次数',
    dataIndex: 'useCount',
    key: 'useCount',
    customRender: ({ record }: { record: CategoryItem }) =>
      h(
        Tag,
        { color: record.useCount > 0 ? 'blue' : 'default', bordered: false },
        { default: () => String(record.useCount) },
      ),
  },
  {
    title: '创建人',
    dataIndex: 'createdBy',
    key: 'createdBy',
    customRender: ({ record }: { record: CategoryItem }) =>
      record.createdBy
        ? record.createdBy
        : h('span', { class: 'text-gray-400 dark:text-gray-500' }, '系统'),
  },
  {
    title: '操作',
    key: 'actions',
    customRender: ({ record }: { record: CategoryItem }) =>
      h(Space, {}, () => [
        h(
          Button,
          { type: 'link', size: 'small', onClick: () => openEdit(record) },
          { default: () => '编辑' },
        ),
        h(
          Button,
          { type: 'link', danger: true, size: 'small', onClick: () => handleDelete(record) },
          { default: () => '删除' },
        ),
      ]),
  },
]);

onMounted(load);
</script>

<template>
  <div class="p-5">
    <Card :bordered="false" :loading="loading">
      <div class="mb-3 flex items-center justify-between">
        <div>
          <div class="text-base font-semibold">分类管理</div>
          <div class="text-xs text-gray-400 dark:text-gray-500">
            系统按分类名称自动登记，写文章时输入新分类即自动入库
          </div>
        </div>
        <Button type="primary" @click="openCreate">
          + 新建分类
        </Button>
      </div>

      <Table
        :columns="columns"
        :data-source="list"
        row-key="_id"
        size="middle"
        :pagination="{ pageSize: 10, showSizeChanger: false }"
      />
    </Card>

    <!-- 新建/编辑 -->
    <Modal
      v-model:open="modalOpen"
      :title="editing ? '编辑分类' : '新建分类'"
      ok-text="保存"
      cancel-text="取消"
      @ok="submit"
    >
      <div class="space-y-4 pt-2">
        <div>
          <div class="mb-1 text-sm">名称 *</div>
          <Input
            v-model:value="form.name"
            placeholder="如：技术分享、产品设计"
            :maxlength="50"
          />
        </div>
        <div>
          <div class="mb-1 text-sm">颜色标记（可选）</div>
          <Select
            v-model:value="form.color"
            placeholder="不设置颜色"
            allow-clear
            class="w-full"
          >
            <Select.Option
              v-for="c in PRESET_NAMES"
              :key="c"
              :value="c"
            >
              <Tag :color="c" class="w-full text-center">{{ c }}</Tag>
            </Select.Option>
          </Select>
        </div>

        <!-- 实时预览：Tag 完全跟随 ConfigProvider 主题 -->
        <div
          class="rounded-lg border border-dashed px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800/50 border-gray-300 dark:border-gray-600 transition-colors"
        >
          <div class="mb-1 text-xs text-gray-400 dark:text-gray-500">预览</div>
          <Tag
            v-if="currentColor"
            :color="currentColor"
            class="!px-2 !py-1"
          >
            {{ form.name || '分类名称' }}
          </Tag>
          <span
            v-else
            class="inline-flex items-center rounded px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
          >
            {{ form.name || '分类名称' }}
          </span>
        </div>
      </div>
    </Modal>
  </div>
</template>
