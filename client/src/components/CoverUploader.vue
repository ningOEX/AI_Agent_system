<script lang="ts" setup>
/**
 * 延迟上传封面组件：选图后只在本地预览（blob: URL），保留 File 对象，
 * 由外层（如博客编辑页）在点击「创建/保存」时才真正 POST 到 OSS。
 * 额外支持 AI 文生图：点 AI 图标 → 弹框输入 prompt → 后端调 DashScope → 返回 OSS 图自动应用。
 *
 * v-model 绑定对象结构：
 *   { file: File | null, localUrl: string, ossUrl?: string }
 *
 * 新增 emit: cover-changed
 *   当封面被替换（用户换图 / AI 生成）时触发，payload 是被替换掉的旧 OSS URL（可能是编辑模式加载的原图），
 *   外层可用来在保存成功后删除旧 OSS 对象。
 *
 * 主题适配：全部用 antd ConfigProvider 注入的 CSS 变量（--ant-*），深色/浅色模式自动切换。
 */
import { onBeforeUnmount, ref, watch } from 'vue';

import { Button, Image, Input, Modal, Upload, message, theme } from 'ant-design-vue';
import type { UploadProps } from 'ant-design-vue';

const { useToken } = theme;
const { token } = useToken();

export interface CoverState {
  file: File | null;
  localUrl: string;
  ossUrl?: string;
}

const props = withDefaults(
  defineProps<{
    modelValue?: CoverState | null;
    folder?: string;
  }>(),
  { folder: 'blog/covers' },
);

const emit = defineEmits<{
  (e: 'update:modelValue', state: CoverState | null): void;
  (e: 'cover-changed', oldOssUrl: string): void;
}>();

const MAX_SIZE = 10 * 1024 * 1024;

// 内部状态
let localBlobUrl: string | null = null;
let isInternalUpdate = false;
const currentUrl = ref('');
// 记住最后一个已知的 OSS URL——解决「移除后再选图 → oldUrl 丢了」的问题
// props.modelValue?.ossUrl 是实时值（移除后就变 undefined），这个是内部累积值
const lastKnownOssUrl = ref('');

// AI 生成弹框状态
const aiModalOpen = ref(false);
const aiPrompt = ref('');
const aiLoading = ref(false);

// ---------- 统一封面设置入口 ----------
function setCover(state: CoverState | null, oldOssUrl?: string) {
  isInternalUpdate = true;

  if (localBlobUrl) {
    URL.revokeObjectURL(localBlobUrl);
    localBlobUrl = null;
  }

  if (!state) {
    // 移除封面：oldOssUrl 是被移除的那个（移除前最后一个已知的 OSS URL）
    emit('update:modelValue', { file: null, localUrl: '' });
    if (oldOssUrl) emit('cover-changed', oldOssUrl);
    // 移除后重置已知值，直到后续再有 ossUrl 写入
    lastKnownOssUrl.value = '';
    isInternalUpdate = false;
    return;
  }

  if (state.file) {
    localBlobUrl = URL.createObjectURL(state.file);
    currentUrl.value = localBlobUrl;
    // 换了新图（还没传 OSS）：把上一个已知的 OSS URL 作为被替换的
    // 比如 原图 A → 移除 → 选新图 B，oldOssUrl=A 从 lastKnownOssUrl 取
    if (oldOssUrl) emit('cover-changed', oldOssUrl);
  } else {
    currentUrl.value = state.localUrl || '';
    // 有 ossUrl 的情况（编辑模式回显 / AI 生成 / ensureUploaded 完成后）
    if (state.ossUrl) {
      // 用新的 ossUrl 替换掉旧的 lastKnownOssUrl，旧的那个就是被替换的
      const previousOss = lastKnownOssUrl.value;
      if (oldOssUrl) emit('cover-changed', oldOssUrl);
      // 如果 oldOssUrl 没传（ensureUploaded 内部调用），但 previousOss 存在，也要 emit
      else if (previousOss && previousOss !== state.ossUrl) {
        emit('cover-changed', previousOss);
      }
      lastKnownOssUrl.value = state.ossUrl;
    } else if (oldOssUrl) {
      emit('cover-changed', oldOssUrl);
    }
  }

  emit('update:modelValue', state);
  isInternalUpdate = false;
}

// ---------- 外部值变化时同步 ----------
watch(
  () => props.modelValue,
  (val) => {
    if (isInternalUpdate) return;

    if (!val) {
      currentUrl.value = '';
      return;
    }

    // 外部写入 ossUrl（比如编辑模式加载详情）时同步到 lastKnownOssUrl
    if (val.ossUrl && val.ossUrl !== lastKnownOssUrl.value) {
      lastKnownOssUrl.value = val.ossUrl;
    }

    if (val.file) {
      if (!localBlobUrl) localBlobUrl = URL.createObjectURL(val.file);
      currentUrl.value = localBlobUrl;
    } else {
      if (localBlobUrl) {
        URL.revokeObjectURL(localBlobUrl);
        localBlobUrl = null;
      }
      currentUrl.value = val.localUrl || '';
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (localBlobUrl) URL.revokeObjectURL(localBlobUrl);
});

// ---------- Upload ----------
const beforeUpload: UploadProps['beforeUpload'] = (file) => {
  if (!file.type?.startsWith('image/')) { message.error('只能上传图片'); return false; }
  if (file.size > MAX_SIZE) { message.error('图片不能超过 10MB'); return false; }
  return true;
};

const customRequest: UploadProps['customRequest'] = ({ file }) => {
  // 用 lastKnownOssUrl 兜底，比 props.modelValue?.ossUrl 更准（覆盖移除后再选图的情况）
  const oldUrl = lastKnownOssUrl.value;
  setCover({ file: file as File, localUrl: '', ossUrl: undefined }, oldUrl);
};

function handleRemove() {
  const oldUrl = lastKnownOssUrl.value;
  setCover(null, oldUrl);
}

// ---------- AI 文生图 ----------
function openAiModal() {
  aiPrompt.value = '';
  aiModalOpen.value = true;
}

async function handleAiConfirm() {
  const prompt = aiPrompt.value.trim();
  if (!prompt) { message.warning('请输入提示词'); return; }

  aiLoading.value = true;
  try {
    const { aiGenerateImageApi } = await import('#/api/upload');
    const { url } = await aiGenerateImageApi(prompt);
    // 后端已把 AI 生成的图传到 OSS，直接用 ossUrl 绑定
    // setCover 内部会自动检测 previousOss（lastKnownOssUrl → 就是被替换掉的）
    setCover({ file: null, localUrl: url, ossUrl: url });
    message.success('AI 封面已生成');
    aiModalOpen.value = false;
  } catch (err: any) {
    message.error(err?.message || 'AI 生成失败');
  } finally {
    aiLoading.value = false;
  }
}

// ---------- 延迟上传 ----------
async function ensureUploaded(): Promise<string> {
  const state = props.modelValue;
  if (state?.ossUrl) return state.ossUrl;

  if (state?.file) {
    const { uploadImageApi } = await import('#/api/upload');
    const { url, oss } = await uploadImageApi(state.file, { folder: props.folder });
    setCover({ file: null, localUrl: url, ossUrl: url });
    message.success(oss ? '封面已上传到阿里云 OSS' : '封面已保存');
    return url;
  }

  return '';
}

/** 获取当前封面的 OSS URL（给外层 edit.vue 在保存成功后清理旧图用） */
function getCurrentOssUrl(): string {
  return props.modelValue?.ossUrl || '';
}

defineExpose({ ensureUploaded, getCurrentOssUrl });
</script>

<template>
  <div>
    <!-- 顶部操作条：选图按钮 + AI 按钮（用 antd Button 自动适配主题） -->
    <div class="flex items-center gap-2 mb-2">
      <Upload
        :custom-request="customRequest"
        :before-upload="beforeUpload"
        :show-upload-list="false"
        accept="image/*"
      >
        <Button>📷 选择图片</Button>
      </Upload>
      <Button type="primary" @click="openAiModal">✨ AI 生成</Button>
    </div>

    <!-- 无图：提示区（背景用 antd CSS 变量，明暗主题自动切换） -->
    <div
      v-if="!currentUrl"
      class="border-2 border-dashed rounded-lg p-6 text-center transition-colors"
      :style="{
        borderColor: token.colorBorderSecondary,
        background: token.colorFillAlter,
        color: token.colorTextSecondary,
      }"
    >
      <p>选择本地图片或用 AI 生成博客封面</p>
      <p class="text-xs mt-1 opacity-70">支持 JPG / PNG / WebP / GIF，最大 10MB</p>
    </div>

    <!-- 有图：预览 + 移除 -->
    <div v-else class="relative inline-block group">
      <Image
        :src="currentUrl"
        width="200"
        height="120"
        class="rounded object-cover"
      />
      <button
        type="button"
        class="absolute inset-0 text-white text-sm opacity-0 group-hover:opacity-100 transition rounded flex items-center justify-center gap-2 cursor-pointer border-none"
        :style="{ background: 'rgba(0,0,0,0.6)' }"
        @click="handleRemove"
      >
        移除图片
      </button>
    </div>

    <!-- AI 生成弹框 -->
    <Modal
      v-model:open="aiModalOpen"
      title="✨ AI 生成封面"
      :confirm-loading="aiLoading"
      ok-text="生成"
      cancel-text="取消"
      @ok="handleAiConfirm"
    >
      <div class="space-y-3 py-2">
        <p class="text-sm opacity-80">
          输入提示词，AI 将为你生成一张博客封面图。
        </p>
        <Input.TextArea
          v-model:value="aiPrompt"
          placeholder="例如: a tech blog cover, minimalist, blue gradient background, modern style"
          :rows="4"
          :maxlength="500"
          show-count 
        />
        <p class="text-xs opacity-60">
          模型：wan2.2-t2i-flash · 1024×1024 
        </p>
      </div>
    </Modal>
  </div>
</template>
