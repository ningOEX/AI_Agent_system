<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';
import type { Recordable } from '@vben/types';

import { computed, h, markRaw, onMounted, ref } from 'vue';

import { AuthenticationRegister, z } from '@vben/common-ui';
import { $t } from '@vben/locales';

import { useAuthStore } from '#/store';

import CaptchaField from './captcha-field.vue';
import { captchaId, loadCaptcha } from './use-captcha';

defineOptions({ name: 'Register' });

const loading = ref(false);
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
      rules: z
        .string()
        .min(3, { message: '用户名长度需为 3-20 个字符' })
        .max(20, { message: '用户名长度需为 3-20 个字符' })
        .regex(/^[a-zA-Z0-9_]+$/, { message: '用户名只能包含字母、数字和下划线' }),
    },
    {
      component: 'VbenInput',
      componentProps: {
        placeholder: '请输入邮箱',
        type: 'email',
      },
      fieldName: 'email',
      label: '邮箱',
      rules: z.string().email({ message: '邮箱格式不正确' }),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        passwordStrength: true,
        placeholder: $t('authentication.password'),
      },
      fieldName: 'password',
      label: $t('authentication.password'),
      renderComponentContent() {
        return {
          strengthText: () => $t('authentication.passwordStrength'),
        };
      },
      rules: z
        .string()
        .min(6, { message: '密码长度需为 6-32 个字符' })
        .max(32, { message: '密码长度需为 6-32 个字符' }),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        placeholder: $t('authentication.confirmPassword'),
      },
      dependencies: {
        rules(values) {
          const { password } = values;
          return z
            .string({ error: $t('authentication.passwordTip') })
            .min(1, { message: $t('authentication.passwordTip') })
            .refine((value) => value === password, {
              message: $t('authentication.confirmPasswordTip'),
            });
        },
        triggerFields: ['password'],
      },
      fieldName: 'confirmPassword',
      label: $t('authentication.confirmPassword'),
    },
    {
      component: markRaw(CaptchaField),
      fieldName: 'captchaCode',
      rules: z.string().min(1, { message: '请输入验证码' }),
    },
    {
      component: 'VbenCheckbox',
      fieldName: 'agreePolicy',
      // VbenCheckbox 使用 defineModel()（即 modelValue）作为双向绑定，
      // 而表单底层默认按 antd 的 v-model:checked 解析，会删除 modelValue 绑定，
      // 导致勾选状态永远写不回表单、z.boolean() 校验始终不通过。此处显式指定 modelValue。
      modelPropName: 'modelValue',
      renderComponentContent: () => ({
        default: () =>
          h('span', [
            $t('authentication.agree'),
            h(
              'a',
              {
                class: 'vben-link ml-1 ',
                href: '',
              },
              `${$t('authentication.privacyPolicy')} & ${$t('authentication.terms')}`,
            ),
          ]),
      }),
      rules: z.boolean().refine((value) => !!value, {
        message: $t('authentication.agreeTip'),
      }),
    },
  ];
});

// 进入注册页时拉取一次图形验证码（组件内不再重复拉取，避免 id 与图片不一致）
onMounted(() => {
  void loadCaptcha();
});

/**
 * 提交注册：调后端 registerApi，成功后后端已签发 token，
 * authLogin 复用后续 store 初始化 + 跳转首页的全链路，实现注册即登录。
 * 失败时刷新验证码（后端验证码为一次性）。
 */
async function handleSubmit(values: Recordable<any>) {
  loading.value = true;
  try {
    await authStore.authLogin(
      { ...values, captchaId: captchaId.value },
      { isRegister: true },
    );
  } catch {
    await loadCaptcha();
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthenticationRegister
    :form-schema="formSchema"
    :loading="loading"
    @submit="handleSubmit"
  />
</template>
