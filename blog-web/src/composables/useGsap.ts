import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { onMounted, onUnmounted } from 'vue';

gsap.registerPlugin(ScrollTrigger);

/** 页面首次入场（从下往上渐入） */
export function usePageEnter(target: string | Element, opts?: { delay?: number; y?: number }) {
  onMounted(() => {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    gsap.fromTo(
      el,
      { opacity: 0, y: opts?.y ?? 24 },
      { opacity: 1, y: 0, duration: 0.8, delay: opts?.delay ?? 0.1, ease: 'power3.out' },
    );
  });
}

/** 滚动入场（元素进入视口时从下往上渐入） */
export function useScrollReveal(targets: string | string[], opts?: { stagger?: number; y?: number }) {
  let ctx: gsap.Context | null = null;
  onMounted(() => {
    const list = typeof targets === 'string' ? [targets] : targets;
    ctx = gsap.context(() => {
      list.forEach((sel) => {
        gsap.fromTo(
          sel,
          { opacity: 0, y: opts?.y ?? 28 },
          {
            opacity: 1,
            y: 0,
            duration: 0.7,
            stagger: opts?.stagger ?? 0.08,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: sel,
              start: 'top 85%',
              once: true,
            },
          },
        );
      });
    });
  });
  onUnmounted(() => {
    ctx?.revert();
  });
}

/** Hero 区入场（更有仪式感） */
export function useHeroReveal() {
  onMounted(() => {
    const hero = document.querySelector('[data-hero]');
    if (!hero) return;
    gsap.fromTo(
      hero,
      { opacity: 0, scale: 0.98 },
      { opacity: 1, scale: 1, duration: 1, ease: 'power3.out' },
    );
    // Hero 内部元素交错入场
    const items = hero.querySelectorAll('[data-hero-item]');
    gsap.fromTo(
      items,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6, stagger: 0.12, delay: 0.3, ease: 'power2.out' },
    );
  });
}

/** 页面加载后刷新 ScrollTrigger */
export function useRefreshScroll() {
  onMounted(() => {
    ScrollTrigger.refresh();
  });
}

export { gsap, ScrollTrigger };
