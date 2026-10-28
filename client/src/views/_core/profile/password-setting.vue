<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';

import { Button, Card, Form, Input, Segmented, Space, Tag, message } from 'ant-design-vue';

import {
  changePasswordApi,
  changePasswordBySmsApi,
  sendSmsApi,
} from '#/api/core/auth';
import { requestClient } from '#/api/request';

// 当前用户绑定的手机号（脱敏显示）
const boundPhone = ref('');
const hasBoundPhone = computed(() => !!boundPhone.value);

onMounted(async () => {
  try {
    const { user } = await requestClient.get<{ user: any }>('/auth/me');
    boundPhone.value = user.phone || '';
  } catch { /* noop */ }
});

function maskPhone(p: string) {
  return p.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
}

// Tab：old（旧密码）/ sms（手机验证码）
const mode = ref<'old' | 'sms'>('old');

// ---------- 旧密码模式 ----------
const oldPwdForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
});
const oldPwdSubmitting = ref(false);

async function submitOldPwd() {
  if (!oldPwdForm.oldPassword) return message.warning('请输入旧密码');
  if (!oldPwdForm.newPassword) return message.warning('请输入新密码');
  if (oldPwdForm.newPassword.length < 6) return message.warning('新密码至少 6 位');
  if (oldPwdForm.newPassword !== oldPwdForm.confirmPassword) return message.warning('两次密码不一致');

  oldPwdSubmitting.value = true;
  try {
    await changePasswordApi({ ...oldPwdForm });
    message.success('密码修改成功，请重新登录');
    Object.assign(oldPwdForm, { oldPassword: '', newPassword: '', confirmPassword: '' });
  } catch (e: any) {
    message.error(e?.message || '修改失败');
  } finally {
    oldPwdSubmitting.value = false;
  }
}

// ---------- 手机验证码模式 ----------
const smsForm = reactive({
  smsCode: '',
  newPassword: '',
  confirmPassword: '',
});
const smsSubmitting = ref(false);

// 验证码倒计时
const smsCountdown = ref(0);
let countdownTimer: ReturnType<typeof setInterval> | null = null;
const smsCodeLoading = ref(false);
const lastDevCode = ref(''); // 开发环境显示真实验证码（省掉短信费）

async function sendSms() {
  if (!hasBoundPhone.value) return message.warning('请先在"安全设置"绑定手机号');
  if (smsCountdown.value > 0) return;
  smsCodeLoading.value = true;
  try {
    const res = await sendSmsApi({ phone: boundPhone.value, scene: 'change' });
    message.success('验证码已发送');
    // 开发环境把后端返回的明文 code 显示出来（省掉真实 SMS 服务）
    if (res.devCode) {
      lastDevCode.value = res.devCode;
      message.info(`开发环境验证码：${res.devCode}`);
    }
    smsCountdown.value = 60;
    countdownTimer = setInterval(() => {
      smsCountdown.value--;
      if (smsCountdown.value <= 0 && countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
    }, 1000);
  } catch (e: any) {
    message.error(e?.message || '发送失败');
  } finally {
    smsCodeLoading.value = false;
  }
}

async function submitSmsPwd() {
  if (!smsForm.smsCode) return message.warning('请输入验证码');
  if (!smsForm.newPassword) return message.warning('请输入新密码');
  if (smsForm.newPassword.length < 6) return message.warning('新密码至少 6 位');
  if (smsForm.newPassword !== smsForm.confirmPassword) return message.warning('两次密码不一致');

  smsSubmitting.value = true;
  try {
    await changePasswordBySmsApi({
      phone: boundPhone.value,
      smsCode: smsForm.smsCode,
      newPassword: smsForm.newPassword,
      confirmPassword: smsForm.confirmPassword,
    });
    message.success('密码修改成功，请重新登录');
    Object.assign(smsForm, { smsCode: '', newPassword: '', confirmPassword: '' });
    lastDevCode.value = '';
  } catch (e: any) {
    message.error(e?.message || '修改失败');
  } finally {
    smsSubmitting.value = false;
  }
}
</script>

<template>
  <div class="max-w-xl space-y-4">
    <Card title="修改密码">
      <!-- 手机号绑定状态提示 -->
      <div class="mb-4 flex items-center gap-2 text-sm">
        <span class="text-gray-500">绑定手机号：</span>
        <Tag v-if="hasBoundPhone" color="green">{{ maskPhone(boundPhone) }}</Tag>
        <Tag v-else color="red">未绑定</Tag>
        <span v-if="!hasBoundPhone" class="text-gray-400 text-xs ml-2">
          → 前往"安全设置"绑定后，可用手机验证码改密码
        </span>
      </div>

      <!-- 模式切换 -->
      <div class="mb-4">
        <Segmented
          v-model:value="mode"
          :options="[
            { label: '旧密码验证', value: 'old' },
            { label: '手机验证码', value: 'sms', disabled: !hasBoundPhone },
          ]"
        />
      </div>

      <!-- ======== 旧密码模式 ======== -->
      <Form v-if="mode === 'old'" layout="vertical" class="max-w-sm">
        <Form.Item label="当前密码" required>
          <Input.Password v-model:value="oldPwdForm.oldPassword" placeholder="请输入当前密码" />
        </Form.Item>
        <Form.Item label="新密码" required>
          <Input.Password
            v-model:value="oldPwdForm.newPassword"
            placeholder="至少 6 位"
            :maxlength="100"
          />
        </Form.Item>
        <Form.Item label="确认新密码" required>
          <Input.Password
            v-model:value="oldPwdForm.confirmPassword"
            placeholder="再次输入新密码"
            :maxlength="100"
          />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" :loading="oldPwdSubmitting" @click="submitOldPwd">
              确认修改
            </Button>
          </Space>
        </Form.Item>
      </Form>

      <!-- ======== 手机验证码模式 ======== -->
      <Form v-else layout="vertical" class="max-w-sm">
        <Form.Item label="验证码" required>
          <div class="flex gap-2">
            <Input
              v-model:value="smsForm.smsCode"
              placeholder="6 位数字验证码"
              :maxlength="6"
              @input="smsForm.smsCode = smsForm.smsCode.replace(/\D/g, '')"
            />
            <Button
              :loading="smsCodeLoading"
              :disabled="smsCountdown > 0"
              @click="sendSms"
            >
              {{ smsCountdown > 0 ? `${smsCountdown}s 后重发` : '获取验证码' }}
            </Button>
          </div>
          <!-- 开发环境提示真实验证码（省掉 SMS 费用） -->
          <div v-if="lastDevCode" class="mt-1 text-xs text-orange-500">
            开发环境验证码：{{ lastDevCode }}
          </div>
        </Form.Item>
        <Form.Item label="新密码" required>
          <Input.Password
            v-model:value="smsForm.newPassword"
            placeholder="至少 6 位"
            :maxlength="100"
          />
        </Form.Item>
        <Form.Item label="确认新密码" required>
          <Input.Password
            v-model:value="smsForm.confirmPassword"
            placeholder="再次输入新密码"
            :maxlength="100"
          />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" :loading="smsSubmitting" @click="submitSmsPwd">
              确认修改
            </Button>
          </Space>
        </Form.Item>
      </Form>

      <div class="pt-2 text-xs text-gray-400 border-t">
        修改成功后，所有已登录的设备都需要重新登录（现有 token 会失效）。
      </div>
    </Card>
  </div>
</template>
