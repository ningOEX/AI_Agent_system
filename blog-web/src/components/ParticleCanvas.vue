<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

interface Pulse { gx: number; gy: number; r: number; alive: boolean; }

const props = withDefaults(defineProps<{
  cols?: number;
  rows?: number;
  pulseSpeed?: number;
  pulseIntervalMs?: number;
  breathPeriod?: number;
  breathAmp?: number;
}>(), {
  cols: 26, rows: 14,
  pulseSpeed: 0.15, pulseIntervalMs: 2500,
  breathPeriod: 4200, breathAmp: 3.5,
});

const canvasRef = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;
let rafId = 0;
let w = 0, h = 0, cellW = 0, cellH = 0;

// ===== 颜色从 CSS 变量读取（主题自适应） =====
const colors = ref({
  grid: 'rgba(148, 163, 184, 0.10)',
  node: 'rgba(226, 232, 240, 0.45)',
  pulse: 'rgba(167, 139, 250, 0.85)',
});

function readCssColors() {
  const cs = getComputedStyle(document.documentElement);
  const brand400 = cs.getPropertyValue('--tw-brand-400').trim() || '129 140 248';
  const brand500 = cs.getPropertyValue('--tw-brand-500').trim() || '99 102 241';
  const accent500 = cs.getPropertyValue('--tw-accent-500').trim() || '170 85 247';
  const isDark = document.documentElement.classList.contains('dark');

  // grid/node 深浅色不同
  if (isDark) {
    colors.value.grid = `rgb(${brand400} / 0.12)`;
    colors.value.node = `rgb(${brand400} / 0.55)`;
  } else {
    colors.value.grid = `rgb(255 255 255 / 0.18)`;
    colors.value.node = `rgb(255 255 255 / 0.7)`;
  }
  // pulse 用 accent 色
  colors.value.pulse = `rgb(${accent500} / 0.9)`;
}

watch(colors, () => { /* 触发重新绘制 */ });

// ===== 网格 =====
let baseGrid: { x: number; y: number }[][] = [];
let curGrid: { x: number; y: number }[][] = [];
let pulses: Pulse[] = [];
let lastPulseAt = 0;

function buildGrid() {
  baseGrid = []; curGrid = [];
  for (let j = 0; j < props.rows; j++) {
    const rowB: { x: number; y: number }[] = [];
    const rowC: { x: number; y: number }[] = [];
    for (let i = 0; i < props.cols; i++) {
      const x = i * cellW + cellW / 2;
      const y = j * cellH + cellH / 2;
      rowB.push({ x, y });
      rowC.push({ x, y });
    }
    baseGrid.push(rowB);
    curGrid.push(rowC);
  }
}

function spawnPulse() {
  pulses.push({
    gx: Math.floor(Math.random() * props.cols),
    gy: Math.floor(Math.random() * props.rows),
    r: 0, alive: true,
  });
}

function draw() {
  if (!ctx) return;
  const T = performance.now();
  const phase = (T / props.breathPeriod) * Math.PI * 2;

  // 呼吸位移
  for (let j = 0; j < props.rows; j++) {
    for (let i = 0; i < props.cols; i++) {
      const b = baseGrid[j][i];
      const ox = Math.sin(phase + i * 0.35 + j * 0.15) * props.breathAmp;
      const oy = Math.cos(phase + j * 0.35 + i * 0.15) * props.breathAmp;
      curGrid[j][i].x = b.x + ox;
      curGrid[j][i].y = b.y + oy;
    }
  }

  ctx.clearRect(0, 0, w, h);

  // 网格线
  ctx.strokeStyle = colors.value.grid;
  ctx.lineWidth = 0.6;
  for (let j = 0; j < props.rows; j++) {
    for (let i = 0; i < props.cols; i++) {
      const p = curGrid[j][i];
      if (i < props.cols - 1) {
        const q = curGrid[j][i + 1];
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
      if (j < props.rows - 1) {
        const q = curGrid[j + 1][i];
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
    }
  }

  // 节点
  ctx.fillStyle = colors.value.node;
  for (let j = 0; j < props.rows; j++) {
    for (let i = 0; i < props.cols; i++) {
      const p = curGrid[j][i];
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2); ctx.fill();
    }
  }

  // 脉冲
  if (T - lastPulseAt > props.pulseIntervalMs) { spawnPulse(); lastPulseAt = T; }
  for (const p of pulses) {
    if (!p.alive) continue;
    p.r += props.pulseSpeed;
    if (p.r > Math.max(props.cols, props.rows) * 1.5) { p.alive = false; continue; }

    const cx = curGrid[p.gy]?.[p.gx];
    if (!cx) continue;
    const pxR = p.r * Math.max(cellW, cellH);
    const alpha = Math.max(0, 1 - p.r / (Math.max(props.cols, props.rows) * 1.2));

    // 外圈光环
    ctx.beginPath();
    ctx.arc(cx.x, cx.y, pxR, 0, Math.PI * 2);
    ctx.strokeStyle = colors.value.pulse.replace(/[\d.]+\)$/, `${alpha * 0.55})`);
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 波前激活
    for (let j = 0; j < props.rows; j++) {
      for (let i = 0; i < props.cols; i++) {
        const node = curGrid[j][i];
        const dx = node.x - cx.x, dy = node.y - cx.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= pxR && dist > pxR - Math.max(cellW, cellH) * 1.5) {
          const a = Math.max(0, 1 - Math.abs(dist - pxR) / (Math.max(cellW, cellH) * 1.2));
          if (a > 0.1) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, 2.2 + a * 1.2, 0, Math.PI * 2);
            ctx.fillStyle = colors.value.pulse.replace(/[\d.]+\)$/, `${Math.min(1, a + 0.3)})`);
            ctx.fill();
          }
        }
      }
    }
  }
  pulses = pulses.filter((p) => p.alive);
  rafId = requestAnimationFrame(draw);
}

let ro: ResizeObserver | null = null;
let mo: MutationObserver | null = null;

function resize() {
  if (!canvasRef.value) return;
  const rect = canvasRef.value.parentElement!.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  w = rect.width; h = rect.height;
  canvasRef.value.width = w * dpr;
  canvasRef.value.height = h * dpr;
  canvasRef.value.style.width = w + 'px';
  canvasRef.value.style.height = h + 'px';
  ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  cellW = w / props.cols;
  cellH = h / props.rows;
  buildGrid();
}

onMounted(() => {
  if (!canvasRef.value) return;
  ctx = canvasRef.value.getContext('2d');
  if (!ctx) return;
  readCssColors();
  resize();
  lastPulseAt = performance.now();
  draw();

  ro = new ResizeObserver(resize);
  ro.observe(canvasRef.value.parentElement!);

  // 监听主题变化（html 的 class 或 style 属性）
  mo = new MutationObserver(() => readCssColors());
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
});

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  ro?.disconnect();
  mo?.disconnect();
});
</script>

<template>
  <canvas ref="canvasRef" class="pointer-events-none absolute inset-0 h-full w-full" />
</template>
