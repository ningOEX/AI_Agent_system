<script lang="ts" setup>
import type { BlogItem, BlogListQuery } from '#/api/blog';
import type { CategoryItem } from '#/api/taxonomy';

import { computed, h, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import dayjs from 'dayjs';

import {
  AutoComplete,
  Button,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  message,
} from 'ant-design-vue';

import {
  batchUpdateBlogCategoryApi,
  batchUpdateBlogStatusApi,
  deleteBlogApi,
  getBlogListApi,
  toggleBlogFeaturedApi,
} from '#/api/blog';
import { getCategoriesApi } from '#/api/taxonomy';
import { useUserStore } from '@vben/stores';

defineOptions({ name: 'BlogList' });

const router = useRouter();
const userStore = useUserStore();
const isAdmin = computed(() => userStore.userInfo?.roles?.includes('admin') ?? false);

// ---------- 表格状态 ----------
const loading = ref(false);
const data = ref<BlogItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);

// ---------- 搜索条件 ----------
const searchForm = reactive<BlogListQuery>({
  keyword: '',
  status: undefined,
  category: '',
});

const statusOptions = [
  { value: 'draft', label: '草稿' },
  { value: 'scheduled', label: '定时发布' },
  { value: 'published', label: '已发布' },
];

const statusColor: Record<string, string> = {
  draft: 'default',
  scheduled: 'processing',
  published: 'success',
};

// ---------- 批量操作（批量修改分类所有用户可用；批量上下架仅 admin） ----------
const selectedRowKeys = ref<string[]>([]);
const batchLoading = ref(false);
const categoryModalOpen = ref(false);
const batchCategory = ref<string | undefined>(undefined);
const categoryOptions = ref<{ label: string; value: string }[]>([]);

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: (number | string)[]) => {
    selectedRowKeys.value = keys.map((k) => String(k));
  },
}));

// ---------- 加载数据 ----------
async function loadList() {
  loading.value = true;
  try {
    const res = await getBlogListApi({
      page: page.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword?.trim() || undefined,
      status: searchForm.status || undefined,
      category: searchForm.category?.trim() || undefined,
    });
    data.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

// 分类候选：检索下拉与批量修改分类共用（接口无需登录即可访问）
async function loadCategories() {
  try {
    const list = await getCategoriesApi();
    categoryOptions.value = list.map((c: CategoryItem) => ({ label: c.name, value: c.name }));
  } catch {
    // 分类加载失败不阻塞列表使用
  }
}

// AutoComplete 默认不做过滤，这里按输入内容匹配分类名
function filterCategoryOption(input: string, option: any) {
  return String(option?.value ?? '')
    .toLowerCase()
    .includes(input.toLowerCase());
}

function handleSearch() {
  selectedRowKeys.value = [];
  page.value = 1;
  loadList();
}

function handleReset() {
  searchForm.keyword = '';
  searchForm.status = undefined;
  searchForm.category = '';
  selectedRowKeys.value = [];
  page.value = 1;
  loadList();
}

function handleTableChange(pag: any) {
  selectedRowKeys.value = [];
  page.value = pag.current;
  pageSize.value = pag.pageSize;
  loadList();
}

// ---------- 操作 ----------
function handleCreate() {
  router.push('/blog/create');
}

function handleEdit(id: string) {
  router.push(`/blog/${id}/edit`);
}

async function handleToggleFeatured(record: BlogItem, checked: boolean | string | number) {
  const on = !!checked;
  try {
    const res = await toggleBlogFeaturedApi(record._id, on);
    record.featured = res.featured;
    message.success(res.featured ? '已设为精选' : '已取消精选');
  } catch (err: any) {
    message.error(err?.message || '操作失败');
  }
}

function handleDelete(id: string) {
  Modal.confirm({
    title: '确认删除',
    content: '删除后不可恢复，确定要删除这篇文章吗？',
    okText: '确定删除',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      await deleteBlogApi(id);
      message.success('删除成功');
      loadList();
    },
  });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  return dayjs(iso).format('YYYY-MM-DD HH:mm:ss');
}

// ---------- 批量操作 ----------
function handleBatchStatus(status: 'draft' | 'published') {
  const count = selectedRowKeys.value.length;
  if (count === 0) return;
  const label = status === 'published' ? '上架' : '下架';
  Modal.confirm({
    title: `确认批量${label}`,
    content: `确定要${label}选中的 ${count} 篇文章吗？`,
    okText: `确定${label}`,
    cancelText: '取消',
    async onOk() {
      batchLoading.value = true;
      try {
        const res = await batchUpdateBlogStatusApi(selectedRowKeys.value, status);
        message.success(`已${label} ${res.modified} 篇文章`);
        selectedRowKeys.value = [];
        await loadList();
      } finally {
        batchLoading.value = false;
      }
    },
  });
}

function openCategoryModal() {
  if (selectedRowKeys.value.length === 0) return;
  batchCategory.value = undefined;
  categoryModalOpen.value = true;
}

async function handleBatchCategory() {
  if (!batchCategory.value) {
    message.warning('请选择目标分类');
    return;
  }
  batchLoading.value = true;
  try {
    const res = await batchUpdateBlogCategoryApi(selectedRowKeys.value, batchCategory.value);
    message.success(`已修改 ${res.modified} 篇文章的分类`);
    categoryModalOpen.value = false;
    selectedRowKeys.value = [];
    await loadList();
  } finally {
    batchLoading.value = false;
  }
}

// ---------- 列定义 ----------
const columns = computed(() => [
  {
    title: 'ID',
    dataIndex: '_id',
    width: 120,
    ellipsis: true,
    customRender: ({ text }: { text: string }) => text.slice(-8),
  },
  {
    title: '标题',
    dataIndex: 'title',
    width: 200,
    ellipsis: true,
  },
  {
    title: '分类',
    dataIndex: 'category',
    width: 120,
  },
  {
    title: '声明',
    dataIndex: 'contentType',
    width: 100,
    customRender: ({ text }: { text: 'ai' | 'original' | undefined }) =>
      text === 'ai'
        ? h(Tag, { color: 'purple' }, () => 'AI 内容')
        : h(Tag, { color: 'green' }, () => '原创'),
  },
  {
    title: '标签',
    dataIndex: 'tags',
    width: 180,
    customRender: ({ text }: { text: string[] }) =>
      text?.length
        ? text.map((t) => h(Tag, { color: 'blue' }, () => t))
        : '-',
  },
  {
    title: '精选',
    dataIndex: 'featured',
    width: 100,
    customRender: ({ record }: { record: BlogItem }) => {
      if (!isAdmin.value) {
        return record.featured ? '★' : '—';
      }
      return h(Switch, {
        checked: !!record.featured,
        checkedChildren: '★',
        unCheckedChildren: '☆',
        onChange: (checked: boolean | string | number) => {
          handleToggleFeatured(record, checked).catch(() => {});
        },
      });
    },
  },
  {
    title: '浏览量',
    dataIndex: 'views',
    width: 90,
    customRender: ({ text }: { text: number }) => text ?? 0,
  },
  {
    title: '状态',
    dataIndex: 'status',
    width: 110,
    customRender: ({ text }: { text: keyof typeof statusColor }) =>
      h(Tag, { color: statusColor[text] || 'default' }, () => {
        const map: Record<string, string> = {
          draft: '草稿',
          scheduled: '定时',
          published: '已发布',
        };
        return map[text] || text;
      }),
  },
  {
    title: '发布时间',
    dataIndex: 'publishedAt',
    width: 180,
    customRender: ({ text }: { text: string | null }) => fmtDate(text),
  },
  {
    title: '创建时间',
    dataIndex: 'createdAt',
    width: 180,
    customRender: ({ text }: { text: string }) => fmtDate(text),
  },
  {
    title: '操作',
    key: 'action',
    width: 160,
    fixed: 'right' as const,
    customRender: ({ record }: { record: BlogItem }) =>
      h(Space, {}, () => [
        h(
          Button,
          { type: 'link', size: 'small', onClick: () => handleEdit(record._id) },
          () => '编辑',
        ),
        h(
          Button,
          {
            type: 'link',
            size: 'small',
            danger: true,
            onClick: () => handleDelete(record._id),
          },
          () => '删除',
        ),
      ]),
  },
]);

onMounted(() => {
  loadList();
  loadCategories();
});
</script>

<template>
  <div class="p-4">
    <!-- 搜索区 -->
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <Input
        v-model:value="searchForm.keyword"
        placeholder="搜索标题 / 摘要 / 标签"
        style="width: 260px"
        allow-clear
        @press-enter="handleSearch"
      />
      <Select
        v-model:value="searchForm.status"
        placeholder="发布状态"
        style="width: 140px"
        allow-clear
        :options="statusOptions"
      />
      <AutoComplete
        v-model:value="searchForm.category"
        placeholder="选择或输入分类"
        style="width: 180px"
        allow-clear
        :options="categoryOptions"
        :filter-option="filterCategoryOption"
        @keydown.enter="handleSearch"
      />
      <Button type="primary" @click="handleSearch">搜索</Button>
      <Button @click="handleReset">重置</Button>

      <div class="ml-auto">
        <Button type="primary" @click="handleCreate">+ 新建文章</Button>
      </div>
    </div>

    <!-- 批量操作栏（有选中项时显示；批量上下架仅 admin，批量修改分类所有用户可用） -->
    <div
      v-if="selectedRowKeys.length > 0"
      class="mb-4 flex flex-wrap items-center gap-3 rounded border border-solid p-3"
    >
      <span class="text-sm">已选择 {{ selectedRowKeys.length }} 项</span>
      <Button
        v-if="isAdmin"
        :loading="batchLoading"
        @click="handleBatchStatus('published')"
      >
        批量上架
      </Button>
      <Button
        v-if="isAdmin"
        :loading="batchLoading"
        @click="handleBatchStatus('draft')"
      >
        批量下架
      </Button>
      <Button :loading="batchLoading" @click="openCategoryModal">批量修改分类</Button>
      <Button type="link" @click="selectedRowKeys = []">取消选择</Button>
    </div>

    <!-- 表格 -->
    <Table
      :columns="columns"
      :data-source="data"
      :loading="loading"
      :row-selection="rowSelection"
      :pagination="{
        current: page,
        pageSize,
        total,
        showSizeChanger: true,
        showQuickJumper: true,
        showTotal: (t: number) => `共 ${t} 条`,
      }"
      :scroll="{ x: 1450 }"
      row-key="_id"
      @change="handleTableChange"
    />

    <!-- 批量修改分类 -->
    <Modal
      v-model:open="categoryModalOpen"
      title="批量修改分类"
      :confirm-loading="batchLoading"
      ok-text="确定"
      cancel-text="取消"
      @ok="handleBatchCategory"
    >
      <div class="mb-3 text-sm">
        已选择 {{ selectedRowKeys.length }} 篇文章，请选择目标分类：
      </div>
      <Select
        v-model:value="batchCategory"
        placeholder="请选择目标分类"
        style="width: 100%"
        show-search
        allow-clear
        :options="categoryOptions"
      />
    </Modal>
  </div>
</template>
