<script lang="ts" setup>
/**
 * 大模型成本计算器
 *
 * 公式与 server/config/modelPricing.js 的 calcCost 保持一致，任一侧改动需同步：
 * - token 类：cost = promptTokens/1000 * 输入单价 + completionTokens/1000 * 输出单价
 * - image 类：cost = 张数 * 元/张
 * - 按字符数估算时：tokens = Math.ceil(字符数 / 1.6)
 * 前端不 import server 目录代码（跨包会导致构建失败），故此处独立实现。
 */
import type { AiPricingItem } from '#/api/aiUsage';

import { computed, ref, watch } from 'vue';

import { Button, Card, InputNumber, Select, Switch, Tooltip } from 'ant-design-vue';

defineOptions({ name: 'AiCostCalculator' });

const props = defineProps<{ pricing: AiPricingItem[] }>();

/** 与后端 CHARS_PER_TOKEN 保持一致 */
const CHARS_PER_TOKEN = 1.6;

const model = ref('');

watch(
  () => props.pricing,
  (list) => {
    if (list?.length && !model.value) model.value = list[0]!.model;
  },
  { immediate: true },
);

const current = computed<AiPricingItem | null>(
  () => props.pricing.find((p) => p.model === model.value) || null,
);

const isImage = computed(() => current.value?.unit === 'image');

// ---- 可编辑参数 ----
const promptTokens = ref(1000);
const completionTokens = ref(2000);
const inputPrice = ref(0);
const outputPrice = ref(0);
const units = ref(1);
const pricePerImage = ref(0);

// 按字符数估算（拿不到 usage 时的兜底口径）
const byChars = ref(false);
const promptChars = ref(1600);
const completionChars = ref(3200);

/** 切换模型时把单价重置为该模型的价目表值 */
function syncPrices() {
  const p = current.value;
  if (!p) return;
  inputPrice.value = p.inputPricePerK ?? 0;
  outputPrice.value = p.outputPricePerK ?? 0;
  pricePerImage.value = p.pricePerImage ?? 0;
}

watch(current, syncPrices, { immediate: true });

function resetPrices() {
  syncPrices();
}

// ---- 计算 ----
const effectiveTokens = computed(() => {
  if (!byChars.value) {
    return { prompt: promptTokens.value || 0, completion: completionTokens.value || 0 };
  }
  return {
    prompt: Math.ceil((promptChars.value || 0) / CHARS_PER_TOKEN),
    completion: Math.ceil((completionChars.value || 0) / CHARS_PER_TOKEN),
  };
});

const cost = computed(() => {
  const p = current.value;
  if (!p) return 0;
  if (p.unit === 'image') {
    return Number(((pricePerImage.value || 0) * (units.value || 0)).toFixed(6));
  }
  const { prompt, completion } = effectiveTokens.value;
  const value =
    (prompt / 1000) * (inputPrice.value || 0) + (completion / 1000) * (outputPrice.value || 0);
  return Number(value.toFixed(6));
});

const costPerThousand = computed(() => Number((cost.value * 1000).toFixed(6)));

const ioRatio = computed(() => {
  if (isImage.value) return null;
  const { prompt, completion } = effectiveTokens.value;
  const total = prompt + completion;
  if (!total) return null;
  return {
    input: Number(((prompt / total) * 100).toFixed(1)),
    output: Number(((completion / total) * 100).toFixed(1)),
  };
});

const modelOptions = computed(() =>
  props.pricing.map((p) => ({
    value: p.model,
    label: `${p.label}（${p.model}）· ${p.unit === 'image' ? `${p.pricePerImage} 元/张` : `${p.inputPricePerK}/${p.outputPricePerK} 元/千token`}`,
  })),
);
</script>

<template>
  <Card title="成本计算器" :bordered="false">
    <div class="mb-3 text-xs text-gray-400 dark:text-gray-500">
      输入用量即可实时试算，可临时改单价做假设测算；结果仅用于估算，不代表真实账单
    </div>

    <div class="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <!-- 参数区 -->
      <div class="lg:col-span-2">
        <div class="mb-3">
          <div class="mb-1 text-xs text-gray-500">模型</div>
          <Select
            v-model:value="model"
            style="width: 100%"
            :options="modelOptions"
            placeholder="选择模型"
          />
        </div>

        <!-- token 类 -->
        <template v-if="!isImage">
          <div class="mb-3 flex items-center gap-2">
            <span class="text-xs text-gray-500">按字符数估算</span>
            <Switch v-model:checked="byChars" size="small" />
            <Tooltip title="拿不到上游 usage 时的兜底口径：tokens = 字符数 / 1.6">
              <span class="cursor-help text-xs text-gray-400">?</span>
            </Tooltip>
          </div>

          <div v-if="byChars" class="grid grid-cols-2 gap-3">
            <div>
              <div class="mb-1 text-xs text-gray-500">输入字符数</div>
              <InputNumber v-model:value="promptChars" :min="0" style="width: 100%" />
            </div>
            <div>
              <div class="mb-1 text-xs text-gray-500">输出字符数</div>
              <InputNumber v-model:value="completionChars" :min="0" style="width: 100%" />
            </div>
          </div>
          <div v-else class="grid grid-cols-2 gap-3">
            <div>
              <div class="mb-1 text-xs text-gray-500">输入 Tokens</div>
              <InputNumber v-model:value="promptTokens" :min="0" style="width: 100%" />
            </div>
            <div>
              <div class="mb-1 text-xs text-gray-500">输出 Tokens</div>
              <InputNumber v-model:value="completionTokens" :min="0" style="width: 100%" />
            </div>
          </div>

          <div class="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div class="mb-1 text-xs text-gray-500">输入单价（元 / 千 token）</div>
              <InputNumber
                v-model:value="inputPrice"
                :min="0"
                :step="0.0001"
                :precision="6"
                style="width: 100%"
              />
            </div>
            <div>
              <div class="mb-1 text-xs text-gray-500">输出单价（元 / 千 token）</div>
              <InputNumber
                v-model:value="outputPrice"
                :min="0"
                :step="0.0001"
                :precision="6"
                style="width: 100%"
              />
            </div>
          </div>
        </template>

        <!-- 图像类 -->
        <template v-else>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <div class="mb-1 text-xs text-gray-500">生成张数</div>
              <InputNumber v-model:value="units" :min="0" style="width: 100%" />
            </div>
            <div>
              <div class="mb-1 text-xs text-gray-500">单价（元 / 张）</div>
              <InputNumber
                v-model:value="pricePerImage"
                :min="0"
                :step="0.01"
                :precision="4"
                style="width: 100%"
              />
            </div>
          </div>
        </template>

        <div class="mt-4">
          <Button size="small" @click="resetPrices">重置为价目表单价</Button>
        </div>
      </div>

      <!-- 结果区 -->
      <div class="rounded-lg border border-solid p-4">
        <div class="text-xs text-gray-500">预估费用</div>
        <div class="mt-1 text-3xl font-semibold text-blue-600">
          ¥ {{ cost.toFixed(6) }}
        </div>

        <template v-if="!isImage">
          <div class="mt-3 text-xs text-gray-500">
            折算 Tokens：{{ effectiveTokens.prompt }} 输入 / {{ effectiveTokens.completion }} 输出
          </div>
          <div v-if="ioRatio" class="mt-1 text-xs text-gray-500">
            占比：输入 {{ ioRatio.input }}% · 输出 {{ ioRatio.output }}%
          </div>
        </template>

        <div class="mt-3 border-t border-solid pt-3">
          <div class="text-xs text-gray-500">每千次调用费用</div>
          <div class="text-lg font-semibold">¥ {{ costPerThousand.toFixed(6) }}</div>
        </div>

        <div class="mt-3 text-[11px] text-amber-500">假设测算，不代表真实账单</div>
      </div>
    </div>
  </Card>
</template>
