<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';

import { Button, Card, Form, Input, Modal, Select, Space, Tag, message } from 'ant-design-vue';

import { updateProfileApi } from '#/api/core/user';

interface SecurityState {
  phone: string;
  secretQuestion: string;
  backupEmail: string;
}

const state = reactive<SecurityState>({
  phone: '',
  secretQuestion: '',
  backupEmail: '',
});

const PHONE_REGEX = /^1[3-9]\d{9}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SECRET_QUESTION_OPTIONS = [
  '您的母校是哪所学校？',
  '您的第一份工作是在哪里？',
  '您的母亲的姓名是？',
  '您最喜欢的一部电影是？',
  '您的宠物叫什么名字？',
  '您童年居住的城市是？',
];

// 加载当前用户的安全绑定字段（后端 GET /auth/me 返回完整字段）
async function reloadBindings() {
  const { requestClient } = await import('#/api/request');
  const { user } = await requestClient.get<{ user: any }>('/auth/me');
  state.phone = user.phone || '';
  state.secretQuestion = user.secretQuestion || '';
  state.backupEmail = user.backupEmail || '';
}
onMounted(reloadBindings);

// ---------- 密保手机 ----------
const phoneModalOpen = ref(false);
const phoneForm = reactive({ phone: '' });
const phoneSubmitting = ref(false);
async function openPhoneModal() {
  phoneForm.phone = state.phone;
  phoneModalOpen.value = true;
}
async function submitPhone() {
  if (!phoneForm.phone) { message.warning('请输入手机号'); return; }
  if (!PHONE_REGEX.test(phoneForm.phone)) { message.error('手机号格式不正确'); return; }
  phoneSubmitting.value = true;
  try {
    await updateProfileApi({ phone: phoneForm.phone });
    state.phone = phoneForm.phone;
    message.success('手机号绑定成功');
    phoneModalOpen.value = false;
  } catch (e: any) {
    message.error(e?.message || '绑定失败');
  } finally {
    phoneSubmitting.value = false;
  }
}
async function unbindPhone() {
  if (!confirm('确定解绑手机号？解绑后账号安全等级会降低。')) return;
  try {
    await updateProfileApi({ phone: '' });
    state.phone = '';
    message.success('已解绑');
  } catch (e: any) {
    message.error(e?.message || '解绑失败');
  }
}

// ---------- 密保问题 ----------
const questionModalOpen = ref(false);
const questionForm = reactive({ secretQuestion: '', secretAnswer: '' });
const questionSubmitting = ref(false);
function openQuestionModal() {
  // 如果已有绑定，带当前值进去；答案不回填（安全考虑）
  questionForm.secretQuestion = state.secretQuestion;
  questionForm.secretAnswer = '';
  questionModalOpen.value = true;
}
async function submitQuestion() {
  if (!questionForm.secretQuestion) { message.warning('请选择或填写密保问题'); return; }
  if (!questionForm.secretAnswer) { message.warning('请填写答案'); return; }
  questionSubmitting.value = true;
  try {
    await updateProfileApi({
      secretQuestion: questionForm.secretQuestion,
      secretAnswer: questionForm.secretAnswer,
    });
    state.secretQuestion = questionForm.secretQuestion;
    message.success('密保问题设置成功');
    questionModalOpen.value = false;
  } catch (e: any) {
    message.error(e?.message || '设置失败');
  } finally {
    questionSubmitting.value = false;
  }
}
async function unbindQuestion() {
  if (!confirm('确定清除密保问题？清除后账号安全等级会降低。')) return;
  try {
    await updateProfileApi({ secretQuestion: '', secretAnswer: '' });
    state.secretQuestion = '';
    message.success('已清除');
  } catch (e: any) {
    message.error(e?.message || '清除失败');
  }
}

// ---------- 备用邮箱 ----------
const emailModalOpen = ref(false);
const emailForm = reactive({ backupEmail: '' });
const emailSubmitting = ref(false);
function openEmailModal() {
  emailForm.backupEmail = state.backupEmail;
  emailModalOpen.value = true;
}
async function submitEmail() {
  if (!emailForm.backupEmail) { message.warning('请输入邮箱'); return; }
  if (!EMAIL_REGEX.test(emailForm.backupEmail)) { message.error('邮箱格式不正确'); return; }
  emailSubmitting.value = true;
  try {
    await updateProfileApi({ backupEmail: emailForm.backupEmail });
    state.backupEmail = emailForm.backupEmail;
    message.success('备用邮箱绑定成功');
    emailModalOpen.value = false;
  } catch (e: any) {
    message.error(e?.message || '绑定失败');
  } finally {
    emailSubmitting.value = false;
  }
}
async function unbindEmail() {
  if (!confirm('确定解绑备用邮箱？')) return;
  try {
    await updateProfileApi({ backupEmail: '' });
    state.backupEmail = '';
    message.success('已解绑');
  } catch (e: any) {
    message.error(e?.message || '解绑失败');
  }
}

// ---------- MFA（预留占位） ----------
const mfaEnabled = ref(false);

function maskPhone(p: string) {
  if (!p) return '';
  return p.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
}
</script>

<template>
  <div class="max-w-2xl space-y-4">
    <!-- 密保手机 -->
    <Card :title="'密保手机'" :bordered="true">
      <div class="flex items-center justify-between">
        <div class="space-y-1">
          <div v-if="state.phone" class="flex items-center gap-2">
            <span class="text-gray-700 font-medium">{{ maskPhone(state.phone) }}</span>
            <Tag color="green">已绑定</Tag>
          </div>
          <div v-else class="text-gray-400">未绑定</div>
          <div class="text-xs text-gray-400">用于找回密码、接收安全通知</div>
        </div>
        <Space>
          <Button v-if="state.phone" @click="openPhoneModal">换绑</Button>
          <Button v-else type="primary" @click="openPhoneModal">绑定</Button>
          <Button v-if="state.phone" danger @click="unbindPhone">解绑</Button>
        </Space>
      </div>
    </Card>

    <!-- 密保问题 -->
    <Card title="密保问题" :bordered="true">
      <div class="flex items-center justify-between">
        <div class="space-y-1">
          <div v-if="state.secretQuestion" class="flex items-center gap-2">
            <span class="text-gray-700 font-medium">{{ state.secretQuestion }}</span>
            <Tag color="green">已设置</Tag>
          </div>
          <div v-else class="text-gray-400">未设置密保问题</div>
          <div class="text-xs text-gray-400">用于密码找回、身份二次验证</div>
        </div>
        <Space>
          <Button v-if="state.secretQuestion" @click="openQuestionModal">修改</Button>
          <Button v-else type="primary" @click="openQuestionModal">设置</Button>
          <Button v-if="state.secretQuestion" danger @click="unbindQuestion">清除</Button>
        </Space>
      </div>
    </Card>

    <!-- 备用邮箱 -->
    <Card title="备用邮箱" :bordered="true">
      <div class="flex items-center justify-between">
        <div class="space-y-1">
          <div v-if="state.backupEmail" class="flex items-center gap-2">
            <span class="text-gray-700 font-medium">{{ state.backupEmail }}</span>
            <Tag color="green">已绑定</Tag>
          </div>
          <div v-else class="text-gray-400">未绑定</div>
          <div class="text-xs text-gray-400">与登录邮箱独立，用于紧急找回</div>
        </div>
        <Space>
          <Button v-if="state.backupEmail" @click="openEmailModal">换绑</Button>
          <Button v-else type="primary" @click="openEmailModal">绑定</Button>
          <Button v-if="state.backupEmail" danger @click="unbindEmail">解绑</Button>
        </Space>
      </div>
    </Card>

    <!-- MFA（预留） -->
    <Card title="MFA 二次验证" :bordered="true">
      <div class="flex items-center justify-between">
        <div class="space-y-1">
          <div v-if="mfaEnabled" class="flex items-center gap-2">
            <span class="text-gray-700 font-medium">已开启</span>
            <Tag color="green">已绑定</Tag>
          </div>
          <div v-else class="text-gray-400">未绑定 MFA 设备</div>
          <div class="text-xs text-gray-400">绑定后登录需二次确认（预留功能）</div>
        </div>
        <Space>
          <Button disabled>绑定（敬请期待）</Button>
        </Space>
      </div>
    </Card>

    <!-- ========== 三个绑定 Modal ========== -->

    <Modal
      v-model:open="phoneModalOpen"
      :title="state.phone ? '换绑密保手机' : '绑定密保手机'"
      :confirm-loading="phoneSubmitting"
      ok-text="确认"
      cancel-text="取消"
      @ok="submitPhone"
    >
      <Form layout="vertical" class="pt-2">
        <Form.Item label="手机号码" required>
          <Input
            v-model:value="phoneForm.phone"
            placeholder="请输入 11 位手机号"
            :maxlength="11"
            @input="phoneForm.phone = phoneForm.phone.replace(/\D/g, '')"
          />
        </Form.Item>
        <p class="text-xs text-gray-400 m-0">
          我们不会对外展示您的手机号，仅用于安全验证。
        </p>
      </Form>
    </Modal>

    <Modal
      v-model:open="questionModalOpen"
      :title="state.secretQuestion ? '修改密保问题' : '设置密保问题'"
      :confirm-loading="questionSubmitting"
      ok-text="确认"
      cancel-text="取消"
      @ok="submitQuestion"
    >
      <Form layout="vertical" class="pt-2">
        <Form.Item label="选择密保问题" required>
          <Select
            v-model:value="questionForm.secretQuestion"
            placeholder="请选择或填写一个问题"
            :options="SECRET_QUESTION_OPTIONS.map(q => ({ value: q, label: q }))"
            show-search
            :filter-option="false"
            allow-clear
          />
          <div class="mt-1">
            <Input
              v-model:value="questionForm.secretQuestion"
              placeholder="也可以自定义问题"
              :maxlength="100"
            />
          </div>
        </Form.Item>
        <Form.Item label="您的答案" required>
          <Input.Password
            v-model:value="questionForm.secretAnswer"
            placeholder="答案一旦设置无法查看，只能重置"
            :maxlength="200"
          />
        </Form.Item>
        <p class="text-xs text-gray-400 m-0">
          请牢记答案，建议记在安全的地方。忘记答案只能手动清除后重新设置。
        </p>
      </Form>
    </Modal>

    <Modal
      v-model:open="emailModalOpen"
      :title="state.backupEmail ? '换绑备用邮箱' : '绑定备用邮箱'"
      :confirm-loading="emailSubmitting"
      ok-text="确认"
      cancel-text="取消"
      @ok="submitEmail"
    >
      <Form layout="vertical" class="pt-2">
        <Form.Item label="备用邮箱" required>
          <Input
            v-model:value="emailForm.backupEmail"
            placeholder="example@gmail.com"
            :maxlength="100"
          />
        </Form.Item>
        <p class="text-xs text-gray-400 m-0">
          与您的登录邮箱独立，用于账号紧急找回。
        </p>
      </Form>
    </Modal>
  </div>
</template>
