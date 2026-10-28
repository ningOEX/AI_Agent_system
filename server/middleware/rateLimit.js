/**
 * 轻量内存限流器（不引入 express-rate-limit 依赖）。
 *
 * 用法：
 *   import rateLimit from './middleware/rateLimit.js';
 *   router.post('/message', rateLimit({ windowMs: 60_000, max: 10 }), handler);
 *
 * 键：默认取 req.ip；可通过 keyGenerator 自定义（如按 IP + sessionId 双重限流）。
 * 窗口采用「滑动计数」：每个键记录 [时间戳, 时间戳, ...]，请求时清理窗口外的计数。
 */
export default function rateLimit({
  windowMs = 60_000,
  max = 10,
  keyGenerator = (req) => req.ip,
  message = '请求过于频繁，请稍后再试',
} = {}) {
  const hits = new Map();

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();
    const windowStart = now - windowMs;

    const timestamps = (hits.get(key) || []).filter((t) => t > windowStart);

    if (timestamps.length >= max) {
      const retryAfter = Math.ceil((timestamps[0] + windowMs - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ message });
    }

    timestamps.push(now);
    hits.set(key, timestamps);

    // 定期清理过期键，避免内存泄漏
    if (hits.size > 10000) {
      for (const [k, ts] of hits) {
        if (!ts.some((t) => t > windowStart)) hits.delete(k);
      }
    }

    next();
  };
}
