<script lang="ts" setup>
import { Input } from 'ant-design-vue';

import { captchaSvg, loadCaptcha } from './use-captcha';

defineOptions({ name: 'CaptchaField' });

const modelValue = defineModel<string>({ default: '' });
</script>

<template>
  <div class="flex w-full items-center gap-2">
    <Input
      v-model:value="modelValue"
      :maxlength="4"
      autocomplete="off"
      placeholder="请输入右侧验证码"
    />
    <button
      type="button"
      class="captcha-img h-8 w-[120px] shrink-0 cursor-pointer overflow-hidden rounded-md border border-border bg-accent p-0"
      title="看不清？点击刷新"
      @click="loadCaptcha"
      v-html="captchaSvg"
    ></button>
  </div>
</template>

<style scoped>
.captcha-img :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
