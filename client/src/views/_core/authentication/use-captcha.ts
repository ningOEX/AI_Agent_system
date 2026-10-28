import { ref } from 'vue';

import { getCaptchaApi } from '#/api';

/** 当前图形验证码的 id（提交登录时需一并带上） */
export const captchaId = ref('');
/** 图形验证码的 SVG 内容 */
export const captchaSvg = ref('');
export const captchaLoading = ref(false);

/**
 * 拉取一张新的图形验证码
 * 后端为一次性验证码，登录/注册失败后需重新拉取
 */
export async function loadCaptcha(): Promise<void> {
  captchaLoading.value = true;
  try {
    const { captchaId: id, svg } = await getCaptchaApi();
    captchaId.value = id;
    captchaSvg.value = svg;
  } finally {
    captchaLoading.value = false;
  }
}
