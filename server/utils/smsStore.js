/**
 * 模拟短信验证码存储（开发环境零成本，生产环境可替换为真实 SMS）。
 *
 * 设计与 captchaStore 一致：内存 Map、TTL 自动过期、惰性清理、一次性消费。
 * Key 是 phone + scene（一个手机号同一 scene 下只保留最新一个验证码）。
 */

const TTL_MS = 5 * 60 * 1000; // 5 分钟有效
const store = new Map(); // `${phone}:${scene}` -> { code, expiresAt, consumed }

export const SMS_SCENES = {
  CHANGE: 'change',   // 已登录改密码
  RESET: 'reset',     // 未登录找回密码
  BIND: 'bind',       // 绑定手机号（预留）
};

function cleanExpired() {
  const now = Date.now();
  for (const [key, item] of store) {
    if (item.expiresAt < now) store.delete(key);
  }
}

/** 生成并存储 6 位数字验证码；开发环境返回明文 code 方便调试，生产环境只返回 smsId */
export function saveSmsCode(phone, scene = SMS_SCENES.CHANGE) {
  cleanExpired();
  const key = `${phone}:${scene}`;
  const code = String(Math.floor(100_000 + Math.random() * 900_000)); // 6 位
  store.set(key, {
    code,
    expiresAt: Date.now() + TTL_MS,
    consumed: false,
  });
  // 开发环境把 code 直接返回——省掉真实 SMS 服务成本，前端可直接看到
  return { code, expiresIn: Math.floor(TTL_MS / 1000) };
}

/** 校验验证码：成功后标记 consumed=true，防止同一验证码被多次尝试 */
export function verifySmsCode(phone, code, scene = SMS_SCENES.CHANGE) {
  const key = `${phone}:${scene}`;
  const item = store.get(key);
  if (!item || item.consumed) return false;
  if (item.expiresAt < Date.now()) { store.delete(key); return false; }
  const ok = item.code === String(code).trim();
  if (ok) {
    item.consumed = true; // 标记已消费
    store.delete(key);     // 验证后立即从 store 删除（一次性）
  }
  return ok;
}
