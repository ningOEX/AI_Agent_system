<script lang="ts" setup>
import { computed, h, onMounted, ref } from 'vue';

import { Button, Card, Input, Modal, Select, Space, Table, Tag, message } from 'ant-design-vue';

import {
  createTagApi,
  deleteTagApi,
  getTagsApi,
  updateTagApi,
  type TagItem,
} from '#/api/taxonomy';

defineOptions({ name: 'TagManage' });

// 8 个 AntDV Tag 语义色名（ConfigProvider dark 下自动切暗版）
const PRESET_NAMES = ['blue', 'green', 'orange', 'purple', 'cyan', 'magenta', 'red', 'gold'] as const;

const currentColor = computed(() => form.value.color || '');

const list = ref<TagItem[]>([]);
const loading = ref(false);

const modalOpen = ref(false);
const editing = ref<TagItem | null>(null);
const form = ref({ name: '', color: '' });

async function load() {
  loading.value = true;
  try {
    list.value = await getTagsApi();
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
function openEdit(row: TagItem) {
  editing.value = row;
  form.value = { name: row.name, color: row.color || '' };
  modalOpen.value = true;
}

async function submit() {
  const name = form.value.name.trim();
  if (!name) {
    message.warning('请输入标签名称');
    return;
  }
  try {
    if (editing.value) {
      await updateTagApi(editing.value._id, { name, color: form.value.color });
      message.success('已更新（文章标签已同步）');
    } else {
      await createTagApi({ name, color: form.value.color });
      message.success('已创建');
    }
    modalOpen.value = false;
    await load();
  } catch (err: any) {
    message.error(err?.message || '保存失败');
  }
}

async function handleDelete(row: TagItem) {
  Modal.confirm({
    title: `删除标签「${row.name}」？`,
    content: `所有文章的 tags 数组中包含「${row.name}」的将自动移除，共 ${row.useCount} 篇会受影响`,
    okType: 'danger',
    async onOk() {
      try {
        await deleteTagApi(row._id);
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
    customRender: ({ record }: { record: TagItem }) =>
      record.color
        ? h(Tag, { color: record.color }, { default: () => record.color })
        : h('span', { class: 'text-gray-400 dark:text-gray-500' }, '—'),
  },
  {
    title: '使用次数',
    dataIndex: 'useCount',
    key: 'useCount',
    customRender: ({ record }: { record: TagItem }) =>
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
    customRender: ({ record }: { record: TagItem }) =>
      record.createdBy
        ? record.createdBy
        : h('span', { class: 'text-gray-400 dark:text-gray-500' }, '系统'),
  },
  {
    title: '操作',
    key: 'actions',
    customRender: ({ record }: { record: TagItem }) =>
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
          <div class="text-base font-semibold">标签管理</div>
          <div class="text-xs text-gray-400 dark:text-gray-500">
            系统按标签名称自动登记，写文章时输入新标签即自动入库
          </div>
        </div>
        <Button type="primary" @click="openCreate">
          + 新建标签
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
      :title="editing ? '编辑标签' : '新建标签'"
      ok-text="保存"
      cancel-text="取消"
      @ok="submit"
    >
      <div class="space-y-4 pt-2">
        <div>
          <div class="mb-1 text-sm">名称 *</div>
          <Input
            v-model:value="form.name"
            placeholder="简短描述，如：Vue、AI、设计"
            :maxlength="30"
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
            {{ form.name || '标签名' }}
          </Tag>
          <span
            v-else
            class="inline-flex items-center rounded px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
          >
            {{ form.name || '标签名' }}
          </span>
        </div>
      </div>
    </Modal>
  </div>
</template>
