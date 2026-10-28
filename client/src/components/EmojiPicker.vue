<script lang="ts" setup>
import { computed, ref } from 'vue';

import { Popover, theme } from 'ant-design-vue';

const emit = defineEmits<{ select: [emoji: string] }>();

const { token } = theme.useToken();

const RECENT_KEY = 'emoji-picker-recent';
const MAX_RECENT = 12;

const groups = [
  {
    key: 'mood',
    label: '情绪',
    icon: '😊',
    emojis: [
      '😀', '😄', '😁', '😆', '😂', '🤣', '😊', '🙂',
      '😉', '😍', '🤩', '😎', '🤔', '😅', '😢', '😭',
      '😡', '🤯', '🥳', '😴', '🫠', '🥺', '😬', '🙃',
    ],
  },
  {
    key: 'tech',
    label: '技术',
    icon: '🛠️',
    emojis: [
      '💻', '⌨️', '🖱️', '🐛', '🐞', '🔧', '🛠️', '⚙️',
      '🚀', '🧪', '🧩', '📦', '🔌', '💡', '📡', '🧠',
      '🤖', '🛰️', '🧑‍💻', '📱', '🔍', '🧯',
    ],
  },
  {
    key: 'feedback',
    label: '反馈',
    icon: '📮',
    emojis: [
      '📝', '📮', '📬', '📨', '✅', '❌', '⚠️', '❗',
      '❓', '💬', '👍', '👎', '🙏', '🎉', '🔥', '⭐',
      '💯', '🕒', '📌', '🧾', '📊', '🗂️',
    ],
  },
  {
    key: 'fun',
    label: '搞怪',
    icon: '🤪',
    emojis: [
      '🤪', '🤡', '👻', '💩', '🦄', '🐸', '🍉', '🌈',
      '🎈', '🎯', '🍕', '☕', '🐱', '🐶', '🫡', '🤝',
      '👀', '🫶', '✨', '🪄', '🎮', '🎵',
    ],
  },
];

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

const open = ref(false);
const active = ref(groups[0]!.key);
const recent = ref<string[]>(readRecent());

const currentEmojis = computed(
  () => groups.find((g) => g.key === active.value)?.emojis ?? [],
);

const allEmojis = groups.flatMap((g) => g.emojis);

function pick(emoji: string) {
  emit('select', emoji);
  recent.value = [emoji, ...recent.value.filter((e) => e !== emoji)].slice(
    0,
    MAX_RECENT,
  );
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.value));
  } catch {
    // 隐私模式下写不进去时静默忽略
  }
}

function pickRandom() {
  pick(allEmojis[Math.floor(Math.random() * allEmojis.length)] || '✨');
}
</script>

<template>
  <Popover
    v-model:open="open"
    trigger="click"
    placement="topLeft"
    overlay-class-name="emoji-popover"
    :overlay-inner-style="{ padding: '0' }"
  >
    <template #content>
      <div
        class="emoji-panel"
        :style="{
          backgroundColor: token.colorBgElevated,
          borderColor: token.colorBorderSecondary,
          color: token.colorText,
        }"
      >
        <!-- 头部：渐变流动背景 + 随机按钮 -->
        <div
          class="emoji-header"
          :style="{
            backgroundImage: `linear-gradient(120deg, ${token.colorPrimaryBg}, transparent 70%)`,
          }"
        >
          <div>
            <div class="emoji-title">表情速递</div>
            <div class="emoji-subtitle" :style="{ color: token.colorTextTertiary }">
              选一个，让反馈更有温度
            </div>
          </div>
          <button
            type="button"
            class="emoji-random"
            :style="{
              color: token.colorPrimary,
              borderColor: token.colorPrimaryBorder,
              backgroundColor: token.colorPrimaryBg,
            }"
            title="手气不错"
            @click="pickRandom"
          >
            🎲 随机
          </button>
        </div>

        <!-- 最近使用 -->
        <div v-if="recent.length" class="emoji-recent">
          <span
            class="emoji-label"
            :style="{ color: token.colorTextTertiary }"
          >
            最近
          </span>
          <div class="emoji-recent-list">
            <button
              v-for="emoji in recent"
              :key="emoji"
              type="button"
              class="emoji-chip"
              :style="{ backgroundColor: token.colorFillTertiary }"
              @click="pick(emoji)"
            >
              {{ emoji }}
            </button>
          </div>
        </div>

        <!-- 分类 -->
        <div class="emoji-tabs">
          <button
            v-for="group in groups"
            :key="group.key"
            type="button"
            class="emoji-tab"
            :class="{ 'emoji-tab-active': active === group.key }"
            :style="
              active === group.key
                ? {
                    color: token.colorPrimary,
                    backgroundColor: token.colorPrimaryBg,
                    borderColor: token.colorPrimaryBorder,
                  }
                : {
                    color: token.colorTextTertiary,
                    borderColor: 'transparent',
                  }
            "
            @click="active = group.key"
          >
            <span class="emoji-tab-icon">{{ group.icon }}</span>
            {{ group.label }}
          </button>
        </div>

        <!-- 表情网格 -->
        <div class="emoji-grid">
          <button
            v-for="emoji in currentEmojis"
            :key="emoji"
            type="button"
            class="emoji-item"
            @click="pick(emoji)"
          >
            {{ emoji }}
          </button>
        </div>

        <div
          class="emoji-footer"
          :style="{
            color: token.colorTextQuaternary,
            borderColor: token.colorBorderSecondary,
          }"
        >
          点击表情即可插入到光标处
        </div>
      </div>
    </template>

    <button
      type="button"
      class="emoji-trigger"
      :style="{ color: token.colorTextTertiary }"
      title="插入表情"
      @mousedown.prevent
    >
      <span class="emoji-trigger-face">🙂</span>
      <span>表情</span>
    </button>
  </Popover>
</template>

<style scoped>
.emoji-trigger {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 24px;
  padding: 0 8px;
  border: none;
  border-radius: 999px;
  background: transparent;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    transform 0.2s ease;
}

.emoji-trigger:hover {
  background-color: rgba(127, 127, 127, 0.12);
  transform: translateY(-1px);
}

.emoji-trigger-face {
  font-size: 15px;
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.emoji-trigger:hover .emoji-trigger-face {
  transform: rotate(-18deg) scale(1.15);
}

.emoji-panel {
  width: 322px;
  border: 1px solid transparent;
  border-radius: 14px;
  overflow: hidden;
}

.emoji-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px 10px;
  background-size: 220% 220%;
  animation: emoji-flow 9s ease infinite;
}

.emoji-title {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.4px;
}

.emoji-subtitle {
  margin-top: 2px;
  font-size: 11px;
}

.emoji-random {
  flex-shrink: 0;
  height: 24px;
  padding: 0 9px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 11px;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.emoji-random:hover {
  transform: scale(1.06) rotate(-2deg);
}

.emoji-recent {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 0 14px 8px;
}

.emoji-label {
  padding-top: 5px;
  font-size: 11px;
  white-space: nowrap;
}

.emoji-recent-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.emoji-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  cursor: pointer;
  transition: transform 0.18s ease;
}

.emoji-chip:hover {
  transform: scale(1.2) rotate(6deg);
}

.emoji-tabs {
  display: flex;
  gap: 4px;
  padding: 0 14px 8px;
}

.emoji-tab {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 24px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.emoji-tab-icon {
  font-size: 12px;
}

.emoji-tab-active {
  font-weight: 600;
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
  padding: 0 10px 10px;
  max-height: 188px;
  overflow-y: auto;
}

.emoji-item {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 34px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font-size: 19px;
  cursor: pointer;
  transition:
    transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1),
    background-color 0.18s ease;
}

.emoji-item:hover {
  transform: translateY(-2px) scale(1.22);
  background-color: rgba(127, 127, 127, 0.1);
}

.emoji-item:active {
  transform: scale(0.94);
}

.emoji-footer {
  padding: 7px 14px 9px;
  border-top: 1px dashed transparent;
  font-size: 11px;
  text-align: center;
}

@keyframes emoji-flow {
  0%,
  100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .emoji-header {
    animation: none;
  }
}
</style>

<style>
/* 去掉 Popover 默认内边距，让圆角面板贴边 */
.emoji-popover .ant-popover-inner {
  padding: 0;
  border-radius: 14px;
  overflow: hidden;
}
</style>
