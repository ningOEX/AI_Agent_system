<script lang="ts" setup>
import type { ArticleLength, ArticleModel, ArticleTone } from '#/api/ai-writer';
import type { BlogCreateParams, BlogUpdateParams } from '#/api/blog';

import { computed, h, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { RobotOutlined, ThunderboltOutlined } from '@ant-design/icons-vue';
import { Button, Card, DatePicker, Input, Select, Switch, Tag, message, theme } from 'ant-design-vue';
import dayjs from 'dayjs';
import { MdEditor } from 'md-editor-v3';
import 'md-editor-v3/lib/style.css';

import CoverUploader, { type CoverState } from '#/components/CoverUploader.vue';

import { useTabs } from '@vben/hooks';
import { useUserStore } from '@vben/stores';

import { generateArticleStream } from '#/api/ai-writer';
import { createBlogApi, getBlogByIdApi, updateBlogApi } from '#/api/blog';
import { getCategoriesApi, getTagsApi } from '#/api/taxonomy';

import type { CategoryItem, TagItem } from '#/api/taxonomy';

defineOptions({ name: 'BlogEdit' });

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const { useToken } = theme;
const { token } = useToken();
const isAdmin = computed(() => userStore.userInfo?.roles?.includes('admin') ?? false);
const { closeCurrentTab } = useTabs();
const isEdit = computed(() => !!route.params.id);
const blogId = computed(() => route.params.id as string);

const submitting = ref(false);
const content = ref('');
// DatePicker 直接用 dayjs ref 绑定，ISO 字符串只在提交时转换
// antd v4 DatePicker value 类型是 Dayjs | string | undefined，不能是 null
const scheduledAtDayjs = ref<dayjs.Dayjs | undefined>(undefined);

// DatePicker 回调收窄类型：antd 可能 emit null | string | undefined，统一转成 Dayjs | undefined
function onScheduledAtChange(v: dayjs.Dayjs | null | undefined | string) {
  if (!v) {
    scheduledAtDayjs.value = undefined;
    return;
  }
  scheduledAtDayjs.value = v instanceof dayjs ? v : dayjs(v);
}

const formState = reactive({
  title: '',
  category: '',
  summary: '',
  // 封面图：选图后先存 File + 本地 blob 预览；点击提交时由 CoverUploader.ensureUploaded() 真正传 OSS
  cover: null as CoverState | null,
  status: 'draft' as 'draft' | 'scheduled' | 'published',
  author: '',
  // 内容声明：original 原创内容 / ai AI 生成内容
  contentType: 'original' as 'ai' | 'original',
  tags: [] as string[],
  featured: false,
});

// 分类与标签下拉缓存
const categoryOptions = ref<CategoryItem[]>([]);
const tagOptions = ref<TagItem[]>([]);

async function loadTaxonomy() {
  try {
    const [cats, tags] = await Promise.all([getCategoriesApi(), getTagsApi()]);
    categoryOptions.value = cats || [];
    tagOptions.value = tags || [];
  } catch {
    // 拉不到就空着，不阻塞表单
  }
}

// 标签选中值：有登记颜色就用上，没有用 grey
function renderTag(props: { value: string; closable?: boolean; onClose?: (e?: any) => void }) {
  const match = tagOptions.value.find((t) => t.name === props.value);
  const color = match?.color || 'default';
  return h(
    Tag,
    {
      color,
      closable: props.closable !== false,
      onClose: props.onClose,
      style: { marginInlineEnd: '4px' },
    },
    { default: () => props.value },
  );
}

const statusOptions = [
  { value: 'draft', label: '草稿（保存不发布）' },
  { value: 'scheduled', label: '定时发布（指定时间自动发布）' },
  { value: 'published', label: '立即发布' },
];

const contentTypeOptions = [
  { value: 'original', label: '原创内容' },
  { value: 'ai', label: 'AI 生成内容' },
];

// ---------- AI 写作助手 ----------
const aiPrompt = ref('');
const aiGenerating = ref(false);
const aiModel = ref<ArticleModel>('qwen3.7-plus');
const aiTone = ref<ArticleTone>('technical');
const aiLength = ref<ArticleLength>('medium');
const aiMode = ref<'append' | 'overwrite'>('overwrite');
// 用于「停止生成」：中断后端的流式请求
let aiAbort: AbortController | null = null;

const aiModelOptions = [
  { value: 'qwen3.7-plus', label: 'Qwen3.7 Plus · 均衡推荐' },
  { value: 'qwen3.8-max', label: 'Qwen3.8 Max · 高质量长文' },
  { value: 'qwen3.8-flash', label: 'Qwen3.8 Flash · 快速初稿' },
];
const aiToneOptions = [
  { value: 'technical', label: '技术严谨' },
  { value: 'popular', label: '通俗易懂' },
  { value: 'deep', label: '深度解析' },
  { value: 'casual', label: '轻松活泼' },
];
const aiLengthOptions = [
  { value: 'short', label: '短篇 ≈800 字' },
  { value: 'medium', label: '中篇 ≈1500 字' },
  { value: 'long', label: '长篇 ≈2600 字' },
];
const aiModeOptions = [
  { value: 'overwrite', label: '覆盖现有正文' },
  { value: 'append', label: '追加到正文末尾' },
];

async function generateArticle() {
  const prompt = aiPrompt.value.trim();
  if (!prompt) {
    message.warning('请先描述想写的内容');
    return;
  }

  aiGenerating.value = true;
  aiAbort = new AbortController();

  const append = aiMode.value === 'append';
  if (append && content.value && !content.value.endsWith('\n')) {
    content.value += '\n\n';
  }
  if (!append) content.value = '';

  // 流式 token 很碎，按 60ms 节流写入编辑器，避免 Markdown 预览频繁整篇重渲染
  let pending = '';
  let lastFlush = 0;
  // 一旦真正收到 AI 内容，自动把内容声明切到「AI 生成内容」
  let marked = false;
  const flush = () => {
    if (!pending) return;
    content.value += pending;
    pending = '';
    lastFlush = Date.now();
  };

  try {
    await generateArticleStream(
      {
        prompt,
        title: formState.title.trim(),
        category: formState.category.trim(),
        tone: aiTone.value,
        length: aiLength.value,
        model: aiModel.value,
      },
      (chunk) => {
        if (!marked) {
          marked = true;
          formState.contentType = 'ai';
        }
        pending += chunk;
        if (Date.now() - lastFlush > 60) flush();
      },
      aiAbort.signal,
    );
    flush();
    message.success('AI 正文已生成，可直接编辑润色');
  } catch (err: any) {
    flush();
    if (err?.name === 'AbortError') {
      message.info('已停止生成');
    } else {
      message.error(err?.message || 'AI 生成失败');
    }
  } finally {
    aiGenerating.value = false;
    aiAbort = null;
  }
}

function stopGenerate() {
  aiAbort?.abort();
}

// ---------- 加载详情（编辑模式） ----------
async function loadDetail() {
  if (!isEdit.value) return;
  try {
    const blog = await getBlogByIdApi(blogId.value);
    formState.title = blog.title;
    formState.category = blog.category;
    formState.summary = blog.summary;
    // 编辑模式：已有 OSS 图 → CoverState.file=null, localUrl=ossUrl
    formState.cover = blog.coverImage
      ? { file: null, localUrl: blog.coverImage, ossUrl: blog.coverImage }
      : null;
    formState.status = blog.status;
    scheduledAtDayjs.value = blog.scheduledAt ? dayjs(blog.scheduledAt) : undefined;
    formState.author = blog.author || '';
    formState.contentType = blog.contentType || 'original';
    formState.tags = blog.tags || [];
    formState.featured = !!blog.featured;
    content.value = blog.content;
  } catch (err: any) {
    message.error(err?.message || '加载文章失败');
    router.push('/blog');
  }
}

onMounted(() => {
  loadDetail();
  loadTaxonomy();
});

// ---------- 表单校验 ----------
const titleValid = computed(() => formState.title.trim().length >= 3);
const categoryValid = computed(() => formState.category.trim().length > 0);
const summaryValid = computed(() => formState.summary.trim().length > 0);
const contentValid = computed(() => content.value.trim().length > 0);
const canSubmit = computed(
  () => titleValid.value && categoryValid.value && summaryValid.value && contentValid.value,
);

// CoverUploader 的 ref，用来在提交前真正上传封面到 OSS
const coverRef = ref<InstanceType<typeof CoverUploader> | null>(null);
// CoverUploader 每次替换封面都会 emit cover-changed，把旧 OSS URL 加进集合
// 支持多次换图（原图 A → B1 → B2），确保 A、B1 都被收集到，保存后批量清理
const pendingOldCoverUrls = ref<Set<string>>(new Set());

function handleCoverChanged(oldUrl: string) {
  if (oldUrl) pendingOldCoverUrls.value.add(oldUrl);
}

// ---------- 提交 ----------
async function handleSubmit() {
  if (!canSubmit.value) {
    if (!titleValid.value) message.error('标题至少 3 个字符');
    else if (!categoryValid.value) message.error('分类不能为空');
    else if (!summaryValid.value) message.error('摘要不能为空');
    else if (!contentValid.value) message.error('详情内容不能为空');
    return;
  }

  if (formState.status === 'scheduled' && !scheduledAtDayjs.value) {
    message.error('定时发布需要指定发布时间');
    return;
  }

  submitting.value = true;
  try {
    // 封面处理：三种情况
    //   1. formState.cover === null → 没选封面 → coverImageUrl = ''
    //   2. formState.cover.file 存在 → 新选的图 → ensureUploaded() 真正传 OSS
    //   3. formState.cover.ossUrl 存在 → 编辑模式没换图 → 直接复用
    let coverImageUrl = '';
    const cover = formState.cover;
    if (cover) {
      if (cover.file) {
        coverImageUrl = (await coverRef.value?.ensureUploaded()) || '';
        // ensureUploaded 抛异常会被 catch 捕获到
      } else if (cover.ossUrl) {
        coverImageUrl = cover.ossUrl;
      }
    }

    if (cover && cover.file && !coverImageUrl) {
      message.error('封面图上传失败，请重试');
      submitting.value = false;
      return;
    }

    const payload: BlogCreateParams | BlogUpdateParams = {
      title: formState.title.trim(),
      category: formState.category.trim(),
      summary: formState.summary.trim(),
      content: content.value,
      tags: formState.tags,
      coverImage: coverImageUrl,
      status: formState.status,
      author: formState.author.trim(),
      contentType: formState.contentType,
      featured: formState.featured,
      scheduledAt:
        formState.status === 'scheduled' && scheduledAtDayjs.value
          ? scheduledAtDayjs.value.toISOString()
          : null,
    };

    if (isEdit.value) {
      await updateBlogApi(blogId.value, payload);
      message.success('更新成功');
    } else {
      await createBlogApi(payload as BlogCreateParams);
      message.success('创建成功');
    }

    // 保存成功后：批量清理所有被替换掉的旧 OSS 封面图（异步，不阻塞跳转）
    // 过滤掉当前最终用的 coverImageUrl（万一用户又换回了原图）
    const urlsToDelete = [...pendingOldCoverUrls.value].filter((u) => u && u !== coverImageUrl);
    if (urlsToDelete.length > 0) {
      pendingOldCoverUrls.value = new Set();
      import('#/api/upload').then(({ deleteImageApi }) => {
        urlsToDelete.forEach((url) => {
          deleteImageApi(url).catch((e) => console.warn('[cover] 删旧图失败', url, e));
        });
      });
    }

    // 提交成功后关闭当前 tab（Vben Admin tab 栏），自动回到上一个 tab
    await closeCurrentTab();
  } catch (err: any) {
    message.error(err?.message || '保存失败');
  } finally {
    submitting.value = false;
  }
}

function handleCancel() {
  closeCurrentTab();
}
</script>

<template>
  <div class="p-4 max-w-5xl mx-auto">
    <Card :title="isEdit ? '编辑文章' : '新建文章'">
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block mb-1 font-medium">标题 *</label>
            <Input
              v-model:value="formState.title"
              placeholder="文章标题"
              :maxlength="200"
              show-count
            />
          </div>

          <div>
            <label class="block mb-1 font-medium">分类 *</label>
            <Select
              v-model:value="formState.category"
              show-search
              allow-create
              :filter-option="false"
              placeholder="选择或输入分类，如：技术分享、产品设计"
              class="w-full"
              :max-length="50"
            >
              <Select.Option
                v-for="item in categoryOptions"
                :key="item.name"
                :value="item.name"
              >
                <Tag
                  v-if="item.color"
                  :color="item.color"
                  class="w-full text-center"
                >
                  {{ item.name }}
                </Tag>
                <span v-else>{{ item.name }}</span>
              </Select.Option>
              <!-- 当前选中的自定义值（后端还没登记）也要能看到 -->
              <Select.Option
                v-if="formState.category && !categoryOptions.some((c) => c.name === formState.category)"
                :key="formState.category"
                :value="formState.category"
              >
                {{ formState.category }}（新分类）
              </Select.Option>
            </Select>
          </div>
        </div>

        <div>
          <label class="block mb-1 font-medium">摘要 *</label>
          <Input.TextArea
            v-model:value="formState.summary"
            placeholder="文章摘要，用于列表展示"
            :rows="3"
            :maxlength="500"
            show-count
          />
        </div>

        <div>
          <label class="block mb-1 font-medium">详情内容（Markdown）*</label>

          <!-- AI 写作助手：提示词生成正文，流式渲染进下方编辑器（背景/边框跟随 antd 主题 token） -->
          <div
            class="mb-3 rounded-lg border border-dashed p-3 transition-colors"
            :style="{
              borderColor: token.colorBorderSecondary,
              background: token.colorFillAlter,
            }"
          >
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2 text-sm font-medium">
                <RobotOutlined :style="{ color: token.colorPrimary }" />
                AI 写作助手
                <span
                  class="text-xs font-normal"
                  :style="{ color: token.colorTextTertiary }"
                >
                  描述想写的内容，边生成边渲染到编辑器
                </span>
              </div>
              <Button
                v-if="aiGenerating"
                size="small"
                danger
                @click="stopGenerate"
              >
                停止生成
              </Button>
            </div>

            <Input.TextArea
              v-model:value="aiPrompt"
              placeholder="例如：写一篇 1500 字左右的文章，介绍 Vue3 中 ref 与 reactive 的区别、使用场景和常见坑，面向有 Vue2 基础的开发者。"
              :rows="2"
              :maxlength="2000"
              show-count
              :disabled="aiGenerating"
            />

            <div class="flex flex-wrap items-center gap-2 mt-2">
              <Select
                v-model:value="aiModel"
                :options="aiModelOptions"
                size="small"
                style="width: 200px"
                :disabled="aiGenerating"
              />
              <Select
                v-model:value="aiTone"
                :options="aiToneOptions"
                size="small"
                style="width: 120px"
                :disabled="aiGenerating"
              />
              <Select
                v-model:value="aiLength"
                :options="aiLengthOptions"
                size="small"
                style="width: 130px"
                :disabled="aiGenerating"
              />
              <Select
                v-model:value="aiMode"
                :options="aiModeOptions"
                size="small"
                style="width: 150px"
                :disabled="aiGenerating"
              />
              <Button
                type="primary"
                size="small"
                :loading="aiGenerating"
                :disabled="!aiPrompt.trim()"
                @click="generateArticle"
              >
                <ThunderboltOutlined />
                AI 生成正文
              </Button>
            </div>
          </div>

          <MdEditor
            v-model="content"
            placeholder="在这里写文章内容，支持 Markdown 语法..."
            :preview="true"
            :editor-min-height="400"
          />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block mb-1 font-medium">标签</label>
            <Select
              v-model:value="formState.tags"
              mode="tags"
              show-search
              :filter-option="false"
              placeholder="选择或输入标签，回车/逗号分隔"
              class="w-full"
              :max-length="30"
              :tag-render="renderTag"
            >
              <Select.Option
                v-for="item in tagOptions"
                :key="item.name"
                :value="item.name"
              >
                <Tag
                  v-if="item.color"
                  :color="item.color"
                  class="w-full text-center"
                >
                  {{ item.name }}
                </Tag>
                <span v-else>{{ item.name }}</span>
              </Select.Option>
            </Select>
          </div>

          <div>
            <label class="block mb-1 font-medium">封面图</label>
            <CoverUploader
              v-model="formState.cover"
              ref="coverRef"
              @cover-changed="handleCoverChanged"
            />
          </div>
        </div>

        <div class="grid grid-cols-3 gap-4">
          <div>
            <label class="block mb-1 font-medium">发布方式 *</label>
            <Select v-model:value="formState.status" :options="statusOptions" style="width: 100%" />
          </div>

          <div v-if="formState.status === 'scheduled'">
            <label class="block mb-1 font-medium">定时发布时间 *</label>
            <DatePicker
              :value="scheduledAtDayjs"
              @update:value="onScheduledAtChange"
              show-time
              placeholder="选择发布时间"
              format="YYYY-MM-DD HH:mm:ss"
              style="width: 100%"
            />
          </div>

          <div>
            <label class="block mb-1 font-medium">作者</label>
            <Input v-model:value="formState.author" placeholder="作者名（可选）" :maxlength="50" />
          </div>

          <div>
            <label class="block mb-1 font-medium">内容声明</label>
            <Select
              v-model:value="formState.contentType"
              :options="contentTypeOptions"
              style="width: 100%"
            />
          </div>

          <div v-if="isAdmin">
            <label class="block mb-1 font-medium">精选文章</label>
            <div class="flex items-center gap-2 h-8">
              <Switch
                v-model:checked="formState.featured"
                checked-children="★ 已精选"
                un-checked-children="☆ 普通"
              />
              <span class="text-xs text-slate-400">精选文章将排在首页最前</span>
            </div>
          </div>
          <div v-else class="h-8" />
        </div>

        <div class="pt-4 border-t flex gap-2">
          <Button type="primary" :loading="submitting" @click="handleSubmit">
            {{ isEdit ? '保存修改' : '创建文章' }}
          </Button>
          <Button @click="handleCancel">取消</Button>
        </div>
      </div>
    </Card>
  </div>
</template>
