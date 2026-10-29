<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
import {
  ChevronDown,
  Compass,
  ExternalLink,
  Github,
  Heart,
  Moon,
  Sparkles,
  Sun,
} from 'lucide-vue-next';
import { ref } from 'vue';

import { useTheme, type ThemeName } from '@/composables/useTheme';
import { CMS_URL, getStoredUser } from '@/api';
import ChatWidget from '@/components/ChatWidget.vue';

const { mode, themeName, current, THEMES, toggleMode, setThemeName } = useTheme();
const themeOpen = ref(false);

const user = getStoredUser();
// 管理员账号不展示智能客服（客服由管理员在后台回复，前台弹窗只给普通用户/访客）
const isAdmin = user?.role === 'admin';

function pickTheme(n: ThemeName) {
  setThemeName(n);
  themeOpen.value = false;
}
</script>

<template>
  <div class="relative min-h-screen text-slate-900 dark:text-slate-100">
    <!-- 杂质风全屏背景（占满视口 + 滚动延伸） -->
    <div class="noise-bg" aria-hidden="true" />

    <!-- ============ 顶栏 ============ -->
    <header class="sticky top-0 z-50 border-b border-white/40 bg-white/60 backdrop-blur-xl dark:border-white/5 dark:bg-slate-900/70">
      <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <RouterLink to="/" class="group flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-logo-gradient text-white shadow-lg shadow-brand-500/30 transition-transform group-hover:scale-105">
            <Sparkles class="h-5 w-5" />
          </div>
          <div class="leading-tight">
            <h1 class="text-[17px] font-bold tracking-tight text-slate-900 dark:text-white">AI · Pulse</h1>
            <p class="text-[11px] text-slate-500 tracking-wide dark:text-slate-400">探索 AI 的脉搏</p>
          </div>
        </RouterLink>

        <nav class="flex items-center gap-1">
          <RouterLink
            to="/"
            class="relative rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-brand-600 dark:text-slate-300 dark:hover:text-brand-400"
            active-class="text-brand-600 dark:text-brand-400"
          >
            博客大厅
          </RouterLink>

          <RouterLink
            v-if="user"
            to="/profile"
            class="relative rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-brand-600 dark:text-slate-300 dark:hover:text-brand-400"
            active-class="text-brand-600 dark:text-brand-400"
          >
            个人中心
          </RouterLink>

          <!-- 主题切换下拉 -->
          <div class="relative">
            <button
              @click="themeOpen = !themeOpen"
              class="ml-1 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/70 px-3 py-1.5 text-sm font-medium text-slate-600 transition-all hover:border-brand-300 hover:text-brand-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:text-brand-400"
            >
              <!-- 主题色预览球 -->
              <span
                class="inline-block h-3 w-3 rounded-full ring-1 ring-slate-300 dark:ring-slate-600"
                :style="{ background: `linear-gradient(135deg, ${current.swatch[0]}, ${current.swatch[1]})` }"
              />
              <span class="hidden sm:inline">{{ current.label }}</span>
              <ChevronDown class="h-3.5 w-3.5" :class="{ 'rotate-180': themeOpen, 'transition-transform': true }" />
            </button>

            <div
              v-if="themeOpen"
              class="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10 backdrop-blur dark:border-slate-700 dark:bg-slate-800"
            >
              <!-- 深浅色 -->
              <div class="mb-1 border-b border-slate-100 pb-2 dark:border-slate-700">
                <div class="mb-1 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">外观</div>
                <div class="flex gap-1">
                  <button
                    @click="mode = 'light'"
                    class="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
                    :class="mode === 'light'
                      ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                      : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'"
                  >
                    <Sun class="h-3.5 w-3.5" /> 浅色
                  </button>
                  <button
                    @click="mode = 'dark'"
                    class="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
                    :class="mode === 'dark'
                      ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                      : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'"
                  >
                    <Moon class="h-3.5 w-3.5" /> 深色
                  </button>
                </div>
              </div>

              <!-- 主题色 -->
              <div>
                <div class="mb-1 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">主题色</div>
                <div class="grid grid-cols-1 gap-0.5">
                  <button
                    v-for="t in THEMES"
                    :key="t.name"
                    @click="pickTheme(t.name)"
                    class="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-700"
                    :class="{ 'bg-brand-50 dark:bg-slate-700': themeName === t.name }"
                  >
                    <span
                      class="inline-block h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10"
                      :style="{ background: `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]})` }"
                    />
                    <span class="flex-1 text-slate-700 dark:text-slate-200">{{ t.label }}</span>
                    <span v-if="themeName === t.name" class="text-brand-500">✓</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <a
            :href="CMS_URL"
            target="_blank"
            class="ml-1 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/70 px-3.5 py-2 text-sm font-medium text-slate-700 transition-all hover:border-brand-300 hover:text-brand-600 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:text-brand-400"
          >
            <ExternalLink class="h-3.5 w-3.5" />
            管理后台
          </a>
        </nav>
      </div>
    </header>

    <!-- 点击别处关闭下拉 -->
    <div
      v-if="themeOpen"
      class="fixed inset-0 z-40"
      @click="themeOpen = false"
    />

    <!-- ============ 主内容 ============ -->
    <main class="px-4 sm:px-6 lg:px-8">
      <RouterView />
    </main>

    <!-- ============ 页脚 ============ -->
    <footer class="mt-16 border-t border-slate-200/60 backdrop-blur-sm dark:border-slate-800/80">
      <div class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div class="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div class="flex items-center gap-2 text-slate-500 text-sm dark:text-slate-400">
            <Compass class="h-4 w-4 text-brand-500" />
            <span>© {{ new Date().getFullYear() }} AI · Pulse — 与 AI 同行</span>
          </div>
          <div class="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
            <span class="inline-flex items-center gap-1">
              <Heart class="h-3.5 w-3.5 text-rose-500" fill="currentColor" />
              用心打造
            </span>
            <span class="h-4 w-px bg-slate-300 dark:bg-slate-700" />
            <span class="inline-flex items-center gap-1">
              <Github class="h-3.5 w-3.5" />
              Open Source
            </span>
          </div>
        </div>
      </div>
    </footer>

    <!-- ============ 智能客服（管理员账号不显示） ============ -->
    <ChatWidget v-if="!isAdmin" />
  </div>
</template>
