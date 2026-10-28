import crypto from 'node:crypto';

const TTL_MS = 5 * 60 * 1000; // 验证码有效期 5 分钟
const store = new Map(); // captchaId -> { text, expiresAt }

export function saveCaptcha(text) {
  // 惰性清理过期验证码，防止内存膨胀
  const now = Date.now();
  for (const [id, item] of store) {
    if (item.expiresAt < now) store.delete(id);
  }

  const id = crypto.randomUUID();
  store.set(id, { text: text.toLowerCase(), expiresAt: now + TTL_MS });
  return id;
}

/** 校验验证码：一次性，无论对错立即作废，防止同一验证码被反复尝试 */
export function verifyCaptcha(id, code) {
  const item = id ? store.get(id) : null;
  if (id) store.delete(id);
  if (!item) return false;
  if (item.expiresAt < Date.now()) return false;
  return typeof code === 'string' && item.text === code.trim().toLowerCase();
}
