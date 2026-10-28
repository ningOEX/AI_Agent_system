<script lang="ts" setup>
import { theme } from 'ant-design-vue';
import { computed } from 'vue';

import { techStack } from './stack-data';

defineOptions({ name: 'TechStack' });

const { token } = theme.useToken();

const totalCount = computed(
  () => techStack.reduce((sum, g) => sum + g.items.length, 0),
);
</script>

<template>
  <div class="p-5">
    <!-- 页面头 -->
    <div
      class="relative overflow-hidden rounded-2xl border p-6"
      :style="{
        backgroundColor: token.colorBgElevated,
        borderColor: token.colorBorderSecondary,
      }"
    >
      <!-- 背景网格 -->
      <div
        class="pointer-events-none absolute inset-0 opacity-20"
        :style="{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
          backgroundSize: '22px 22px',
          color: token.colorPrimary,
          maskImage: 'linear-gradient(180deg, black 0%, transparent 80%)',
          WebkitMaskImage: 'linear-gradient(180deg, black 0%, transparent 80%)',
        }"
      />
      <div class="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span
              class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold text-white"
              :style="{ backgroundColor: token.colorPrimary }"
            >
              🧰
            </span>
            <h2 class="text-xl font-semibold">系统技术栈</h2>
          </div>
          <p
            class="mt-2 max-w-2xl text-sm leading-relaxed"
            :style="{ color: token.colorTextTertiary }"
          >
            本项目采用 Vue 3 + Node.js 的现代前后端分离架构，后台管理使用
            Vben Admin + Ant Design Vue，前台博客为独立部署的创意站点，
            AI 能力接入阿里云百炼 qwen 系列模型。点击卡片可直达官方文档。
          </p>
        </div>
        <div class="flex gap-5 text-center">
          <div v-for="group in techStack" :key="group.key">
            <div class="text-xl font-semibold">{{ group.items.length }}</div>
            <div
              class="text-xs"
              :style="{ color: token.colorTextTertiary }"
            >
              {{ group.title.split(' · ')[1] || group.title }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 分组卡片 -->
    <div class="mt-5 space-y-5">
      <section
        v-for="group in techStack"
        :key="group.key"
        class="rounded-2xl border p-5"
        :style="{
          backgroundColor: token.colorBgElevated,
          borderColor: token.colorBorderSecondary,
        }"
      >
        <header class="mb-4 flex items-center gap-3">
          <span
            class="h-6 w-1.5 rounded-full"
            :style="{ backgroundColor: group.accent }"
          />
          <div>
            <div class="text-base font-semibold leading-tight">
              {{ group.title }}
            </div>
            <div
              class="mt-0.5 text-xs"
              :style="{ color: token.colorTextTertiary }"
            >
              {{ group.subtitle }}
            </div>
          </div>
          <span
            class="ml-auto text-xs"
            :style="{ color: token.colorTextQuaternary }"
          >
            {{ group.items.length }} 项
          </span>
        </header>

        <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <a
            v-for="item in group.items"
            :key="item.name"
            :href="item.link || undefined"
            :target="item.link ? '_blank' : undefined"
            :rel="item.link ? 'noopener noreferrer' : undefined"
            class="tech-card group"
            :style="{
              backgroundColor: token.colorBgLayout,
              borderColor: token.colorBorderSecondary,
            }"
          >
            <div class="flex items-start gap-3">
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg transition-transform group-hover:scale-110"
                :style="{ backgroundColor: item.color + '22', color: item.color }"
              >
                {{ item.icon }}
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <span class="truncate text-sm font-semibold">{{ item.name }}</span>
                  <span
                    v-if="item.version"
                    class="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-mono"
                    :style="{
                      backgroundColor: token.colorFillTertiary,
                      color: token.colorTextSecondary,
                    }"
                  >
                    {{ item.version }}
                  </span>
                  <span
                    v-if="item.link"
                    class="ml-1 opacity-0 transition-opacity group-hover:opacity-100"
                    :style="{ color: token.colorPrimary }"
                  >
                    ↗
                  </span>
                </div>
                <div
                  class="mt-1 line-clamp-2 text-xs leading-relaxed"
                  :style="{ color: token.colorTextTertiary }"
                >
                  {{ item.desc }}
                </div>
              </div>
            </div>
          </a>
        </div>
      </section>
    </div>

    <!-- 底部注脚 -->
    <div
      class="mt-6 text-center text-xs"
      :style="{ color: token.colorTextQuaternary }"
    >
      技术栈清单共 {{ totalCount }} 项 · 最后维护 {{ new Date().toLocaleDateString() }}
    </div>
  </div>
</template>

<style scoped>
.tech-card {
  display: block;
  padding: 12px 14px;
  border: 1px solid transparent;
  border-radius: 12px;
  text-decoration: none;
  transition:
    transform 0.25s ease,
    border-color 0.25s ease,
    box-shadow 0.25s ease;
}

.tech-card:hover {
  transform: translateY(-2px);
  border-color: rgba(22, 119, 255, 0.35);
  box-shadow: 0 6px 20px -6px rgba(22, 119, 255, 0.25);
}
</style>
