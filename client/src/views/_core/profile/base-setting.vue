<script setup lang="ts">
import type { UploadProps } from 'ant-design-vue';

import { onMounted, ref } from 'vue';

import { Avatar, Button, Card, Input, Upload, message } from 'ant-design-vue';
import { useUserStore } from '@vben/stores';

import { getUserInfoApi, updateProfileApi } from '#/api/core/user';
import { deleteImageApi, uploadImageApi } from '#/api/upload';

const userStore = useUserStore();

const avatarUrl = ref(''); // 当前头像 URL（可能是旧的，也可能是上传成功的新 OSS URL）
const uploading = ref(false);

const username = ref('');
const email = ref('');

onMounted(async () => {
  try {
    const u = await getUserInfoApi();
    avatarUrl.value = u.avatar || '';
    username.value = u.username;
    email.value = u.desc || '';
    userStore.setUserInfo(u);
  } catch (e: any) {
    message.error(e?.message || '加载用户信息失败');
  }
});

// ---------- 头像上传 ----------
const avatarBeforeUpload: UploadProps['beforeUpload'] = (file) => {
  if (!file.type?.startsWith('image/')) { message.error('只能上传图片'); return false; }
  if (file.size > 5 * 1024 * 1024) { message.error('头像不能超过 5MB'); return false; }
  return true;
};

const avatarCustomRequest: UploadProps['customRequest'] = async ({ file }) => {
  uploading.value = true;
  try {
    // 1. 上传新头像到 OSS
    const { url } = await uploadImageApi(file as File, { folder: 'avatars' });

    // 2. 更新后端 profile
    const oldAvatar = avatarUrl.value;
    const res = await updateProfileApi({ avatar: url });
    avatarUrl.value = res.avatar || url;

    // 3. 同步更新 userStore（顶部头像自动变）——只覆盖 avatar，其余字段保留
    const currentInfo = userStore.userInfo;
    if (currentInfo) {
      userStore.setUserInfo({ ...currentInfo, avatar: avatarUrl.value });
    }

    // 4. 删旧 OSS 头像（异步，旧的头像 URL 没值或等于新值时跳过）
    if (oldAvatar && oldAvatar !== avatarUrl.value) {
      deleteImageApi(oldAvatar).catch(() => {});
    }

    message.success('头像更新成功');
  } catch (e: any) {
    message.error(e?.message || '头像上传失败');
  } finally {
    uploading.value = false;
  }
};

async function handleRemoveAvatar() {
  if (!avatarUrl.value) return;
  const old = avatarUrl.value;
  avatarUrl.value = '';
  try {
    await updateProfileApi({ avatar: '' });
    avatarUrl.value = '';
    const currentInfo = userStore.userInfo;
    if (currentInfo) {
      userStore.setUserInfo({ ...currentInfo, avatar: '' });
    }
    deleteImageApi(old).catch(() => {});
    message.success('头像已移除');
  } catch (e: any) {
    avatarUrl.value = old; // 回滚
    message.error(e?.message || '移除失败');
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <Card title="头像设置" class="mb-4">
      <div class="flex items-center gap-6">
        <!-- 预览 -->
        <div class="flex-shrink-0">
          <Avatar
            :src="avatarUrl"
            :size="96"
            class="bg-blue-500 flex items-center justify-center text-white text-xl font-semibold"
          >
            {{ username?.[0]?.toUpperCase() || 'U' }}
          </Avatar>
        </div>

        <!-- 操作区 -->
        <div class="flex-1 space-y-2">
          <div class="flex gap-2">
            <Upload
              :show-upload-list="false"
              :before-upload="avatarBeforeUpload"
              :custom-request="avatarCustomRequest"
              accept="image/*"
            >
              <Button type="primary" :loading="uploading">
                {{ avatarUrl ? '更换头像' : '上传头像' }}
              </Button>
            </Upload>
            <Button v-if="avatarUrl" danger @click="handleRemoveAvatar">移除</Button>
          </div>
          <p class="text-xs text-gray-500 m-0">
            支持 JPG / PNG / WebP，最大 5MB。上传后自动同步到所有页面。
          </p>
        </div>
      </div>
    </Card>

    <Card title="账号信息">
      <div class="space-y-4 max-w-md">
        <div>
          <label class="block mb-1 text-sm text-gray-500">用户名</label>
          <Input :value="username" disabled />
        </div>
        <div>
          <label class="block mb-1 text-sm text-gray-500">邮箱</label>
          <Input :value="email" disabled />
        </div>
      </div>
    </Card>
  </div>
</template>
