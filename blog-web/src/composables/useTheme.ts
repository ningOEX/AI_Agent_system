import { ref, watchEffect } from 'vue';

export type ThemeName = 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate';
export type ThemeMode = 'light' | 'dark';

export interface ThemePreset {
  name: ThemeName;
  label: string;
  // HSL 值（不含 hsl() 包装）
  brand: Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900, string>;
  accent500: string;
  accent600: string;
  // 预览用的颜色块
  swatch: [string, string];
}

export const THEMES: ThemePreset[] = [
  {
    name: 'indigo',
    label: '靛紫',
    swatch: ['#6366f1', '#a855f7'],
    brand: {
      50: '239 246 255', 100: '224 231 255', 200: '199 210 254', 300: '165 180 252',
      400: '129 140 248', 500: '99 102 241', 600: '79 70 229', 700: '67 56 202',
      800: '55 48 163', 900: '49 46 129',
    },
    accent500: '271 81 56',
    accent600: '271 72 51',
  },
  {
    name: 'emerald',
    label: '翠绿',
    swatch: ['#10b981', '#06b6d4'],
    brand: {
      50: '236 253 245', 100: '209 250 229', 200: '167 243 208', 300: '110 231 183',
      400: '52 211 153', 500: '16 185 129', 600: '5 150 105', 700: '4 120 87',
      800: '6 95 70', 900: '6 78 59',
    },
    accent500: '189 94 43',
    accent600: '187 84 39',
  },
  {
    name: 'amber',
    label: '琥珀',
    swatch: ['#f59e0b', '#f97316'],
    brand: {
      50: '255 251 235', 100: '254 243 199', 200: '253 230 138', 300: '252 211 77',
      400: '251 191 36', 500: '245 158 11', 600: '217 119 6', 700: '180 83 9',
      800: '146 64 14', 900: '120 53 15',
    },
    accent500: '24 95 53',
    accent600: '24 90 45',
  },
  {
    name: 'rose',
    label: '玫瑰',
    swatch: ['#f43f5e', '#ec4899'],
    brand: {
      50: '255 241 242', 100: '255 228 230', 200: '254 205 211', 300: '253 164 175',
      400: '251 113 133', 500: '244 63 94', 600: '225 29 72', 700: '190 18 60',
      800: '159 18 57', 900: '136 19 55',
    },
    accent500: '330 81 60',
    accent600: '330 73 49',
  },
  {
    name: 'slate',
    label: '石墨',
    swatch: ['#475569', '#64748b'],
    brand: {
      50: '248 250 252', 100: '241 245 249', 200: '226 232 240', 300: '203 213 225',
      400: '148 163 184', 500: '100 116 139', 600: '71 85 105', 700: '51 65 85',
      800: '30 41 59', 900: '15 23 42',
    },
    accent500: '217 91 60',
    accent600: '217 83 48',
  },
];

const LS_MODE = 'blog-theme-mode';
const LS_NAME = 'blog-theme-name';

const mode = ref<ThemeMode>((localStorage.getItem(LS_MODE) as ThemeMode) || 'light');
const themeName = ref<ThemeName>((localStorage.getItem(LS_NAME) as ThemeName) || 'indigo');

const current = ref<ThemePreset>(THEMES.find((t) => t.name === themeName.value) || THEMES[0]);

export function useTheme() {
  function applyTheme() {
    const preset = THEMES.find((t) => t.name === themeName.value) || THEMES[0];
    current.value = preset;

    const root = document.documentElement;

    // 深浅色
    root.classList.toggle('dark', mode.value === 'dark');
    localStorage.setItem(LS_MODE, mode.value);

    // 主题色 CSS 变量
    root.dataset.theme = preset.name;
    localStorage.setItem(LS_NAME, preset.name);

    Object.entries(preset.brand).forEach(([k, v]) => {
      root.style.setProperty(`--tw-brand-${k}`, v);
    });
    root.style.setProperty('--tw-accent-500', preset.accent500);
    root.style.setProperty('--tw-accent-600', preset.accent600);
  }

  function setMode(m: ThemeMode) {
    mode.value = m;
  }
  function toggleMode() {
    mode.value = mode.value === 'light' ? 'dark' : 'light';
  }
  function setThemeName(n: ThemeName) {
    themeName.value = n;
  }

  watchEffect(applyTheme);

  return { mode, themeName, current, THEMES, setMode, toggleMode, setThemeName, applyTheme };
}
