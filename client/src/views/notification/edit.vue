<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';

import { Button, Card, Form, Input, message } from 'ant-design-vue';
import { useRoute } from 'vue-router';

import {
  createNotificationApi,
  getNotificationByIdApi,
  updateNotificationApi,
} from '#/api/core/notification';
import { useTabs } from '@vben/hooks';

const route = useRoute();
const { closeCurrentTab } = useTabs();

// 路由形态：
//   /notification/create              → create 模式
//   /notification/:id/edit            → edit 模式
const noteId = computed(() => route.params.id as string | undefined);
const isEdit = computed(() => !!noteId.value);

const formState = reactive({
  title: '',
  content: '',
});
const submitting = ref(false);
const loadingDetail = ref(false);

onMounted(async () => {
  if (!isEdit.value) return;
  loadingDetail.value = true;
  try {
    const note = await getNotificationByIdApi(noteId.value!);
    formState.title = note.title;
    formState.content = note.content;
  } catch (e: any) {
    message.error(e?.message || '加载通知失败');
  } finally {
    loadingDetail.value = false;
  }
});

async function handleSubmit() {
  if (!formState.title.trim()) return message.warning('请输入标题');
  if (!formState.content.trim()) return message.warning('请输入内容');

  submitting.value = true;
  try {
    if (isEdit.value) {
      await updateNotificationApi(noteId.value!, {
        title: formState.title.trim(),
        content: formState.content.trim(),
      });
      message.success('更新成功');
    } else {
      await createNotificationApi({
        title: formState.title.trim(),
        content: formState.content.trim(),
      });
      message.success('发布成功');
    }
    // 广播通知刷新事件——所有 tab 的顶栏铃铛 + 列表页立即刷新
    try {
      new BroadcastChannel('app-notification').postMessage({ type: 'refresh' });
    } catch { /* noop */ }
    await closeCurrentTab();
  } catch (e: any) {
    message.error(e?.message || (isEdit.value ? '更新失败' : '发布失败'));
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="max-w-3xl mx-auto py-4">
    <Card
      :title="isEdit ? '编辑通知公告' : '发布通知公告'"
      :bordered="false"
      :loading="loadingDetail"
    >
      <Form layout="vertical" class="pt-2">
        <Form.Item
          label="通知标题"
          required
          :rules="[{ required: true, message: '请输入标题' }, { max: 200, message: '不能超过 200 字符' }]"
        >
          <Input
            v-model:value="formState.title"
            placeholder="例如：系统升级维护通知"
            :maxlength="200"
            show-count
          />
        </Form.Item>

        <Form.Item
          label="通知内容"
          required
          :rules="[{ required: true, message: '请输入内容' }]"
        >
          <Input.TextArea
            v-model:value="formState.content"
            placeholder="详细描述..."
            :rows="10"
            :maxlength="5000"
            show-count
          />
        </Form.Item>

        <Form.Item class="!mb-0 pt-2">
          <Button type="primary" :loading="submitting" @click="handleSubmit">
            {{ isEdit ? '保存修改' : '立即发布' }}
          </Button>
          <Button class="ml-2" @click="() => closeCurrentTab()">取消</Button>
        </Form.Item>
      </Form>

      <div class="mt-4 pt-4 border-t text-xs text-gray-400">
        <template v-if="isEdit">
          提示：编辑后不会清除已读状态，已读用户仍保持已读。
        </template>
        <template v-else>
          提示：发布后所有登录用户均可看到，发布人为当前管理员账号。
        </template>
      </div>
    </Card>
  </div>
</template>
