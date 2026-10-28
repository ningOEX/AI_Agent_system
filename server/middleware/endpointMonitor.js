import jwt from 'jsonwebtoken';

import EndpointCallLog from '../models/EndpointCallLog.js';
import { matchCatalog } from '../config/apiCatalog.js';

// 路径不参与接口调用监控：静态资源目录
const SKIP_PREFIXES = ['/uploads'];

// 不参与监控的 HTTP 方法
const SKIP_METHODS = ['GET','HEAD', 'OPTIONS'];

function shouldSkip(method, path) {
  if (SKIP_METHODS.includes(method)) return true;
  return SKIP_PREFIXES.some((p) => path.startsWith(p));
}

/** 从 Authorization 头解析登录用户（兜底：部分 route 在中间件之后才执行 requireAuth） */
function operatorFromReq(req) {
  if (req.user) {
    return { userId: req.user.id, username: req.user.username, role: req.user.role };
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token && process.env.JWT_SECRET) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      return {
        userId: payload.id || null,
        username: payload.username || '',
        role: payload.role || '',
      };
    } catch {
      // 令牌无效就当作匿名
    }
  }
  return { userId: null, username: '', role: '' };
}

/**
 * 接口调用埋点中间件：拦截所有请求（含 GET），请求结束时异步落库。
 *
 * 与 auditTrail 的区别：
 * - auditTrail 只拦 WRITE_METHODS（POST/PUT/DELETE/PATCH）+ 只拦能映射到业务模块的路径
 * - endpointMonitor 拦所有 HTTP 方法，统计口径是「HTTP 请求级」而非「业务动作级」
 * - 目的是做可视化的接口调用监控 + 为前端「接口调用详情 = 接口文档」提供数据支撑
 *
 * 性能：fire-and-forget，不 await 不阻塞响应；TTL 30 天自动清理，不做永久留存。
 * 容错：写库失败只打日志，绝不影响主流程。
 */
export default function endpointMonitor(req, res, next) {
  if (shouldSkip(req.method, req.path)) return next();

  const startedAt = Date.now();
  const { method, path } = req;

  const catalog = matchCatalog(method, path);
  const routeKey = catalog ? catalog.id : `${method} ${path}`;
  const catalogId = catalog ? catalog.id : '';

  // 请求结束（无论成功失败 / 是否被 catalog 收录）统一落库
  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const statusCode = res.statusCode || 0;
    const operator = operatorFromReq(req);

    EndpointCallLog.create({
      method,
      routeKey,
      path,
      statusCode,
      durationMs,
      success: statusCode < 400,
      user: operator,
      ip: req.ip || req.socket?.remoteAddress || '',
      userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
      catalogId,
    }).catch((err) => {
      console.error('[endpointMonitor] 埋点写入失败:', err.message);
    });
  });

  next();
}
