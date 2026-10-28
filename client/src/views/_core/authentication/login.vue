<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';

import { computed, markRaw, onActivated, onMounted } from 'vue';

import { AuthenticationLogin, z } from '@vben/common-ui';
import { $t } from '@vben/locales';

import { useAuthStore } from '#/store';

import CaptchaField from './captcha-field.vue';
import { captchaId, loadCaptcha } from './use-captcha';

defineOptions({ name: 'Login' });

const authStore = useAuthStore();

const formSchema = computed((): VbenFormSchema[] => {
  return [
    {
      component: 'VbenInput',
      componentProps: {
        placeholder: $t('authentication.usernameTip'),
      },
      fieldName: 'username',
      label: $t('authentication.username'),
      rules: z.string().min(1, { message: $t('authentication.usernameTip') }),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        placeholder: $t('authentication.password'),
      },
      fieldName: 'password',
      label: $t('authentication.password'),
      rules: z.string().min(1, { message: $t('authentication.passwordTip') }),
    },
    {
      component: markRaw(CaptchaField),
      fieldName: 'captchaCode',
      rules: z.string().min(1, { message: '请输入验证码' }),
    },
  ];
});

// 进入登录页时拉取一次图形验证码（组件内不再重复拉取，避免 id 与图片不一致）
onMounted(() => {
  void loadCaptcha();
});

// 登录页会被 auth 布局的 KeepAlive 缓存：从注册页返回时 onMounted 不会再次执行，
// 若不刷新，页面上仍是上一次生成的验证码（可能已过期），提交就会提示"验证码已过期"。
// 首次挂载交给 onMounted，这里只处理后续再次激活的情况。
let firstActivation = true;
onActivated(() => {
  if (firstActivation) {
    firstActivation = false;
    return;
  }
  void loadCaptcha();
});

/**
 * 提交登录：把验证码 id 一并带上；失败时刷新验证码（后端验证码为一次性）
 */
async function handleLogin(values: Record<string, any>) {
  try {
    await authStore.authLogin({
      ...values,
      captchaId: captchaId.value,
    });
  } catch {
    await loadCaptcha();
  }
}
</script>

<template>
  <AuthenticationLogin
    :form-schema="formSchema"
    :loading="authStore.loginLoading"
    :show-register="true"
    @submit="handleLogin"
  />
</template>
