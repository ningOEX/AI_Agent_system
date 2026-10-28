import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

import AuditLog from '../models/AuditLog.js';
import Blog from '../models/Blog.js';
import Category from '../models/Category.js';
import ChatSession from '../models/ChatSession.js';
import Comment from '../models/Comment.js';
import Faq from '../models/Faq.js';
import Feedback from '../models/Feedback.js';
import Notification from '../models/Notification.js';
import Tag from '../models/Tag.js';
import User from '../models/User.js';

/**
 * 模块注册表：模块标识 → 模型 / 中文名 / 名称字段
 * 新增业务模块时只在这里补一行即可，留痕自动覆盖。
 */
const MODULE_MODELS = {
  blog: { model: Blog, label: '博客文章', labelField: 'title' },
  category: { model: Category, label: '分类', labelField: 'name' },
  tag: { model: Tag, label: '标签', labelField: 'name' },
  comment: { model: Comment, label: '评论', labelField: 'content' },
  notification: { model: Notification, label: '通知公告', labelField: 'title' },
  feedback: { model: Feedback, label: '问题反馈', labelField: 'title' },
  user: { model: User, label: '用户', labelField: 'username' },
  chatSession: { model: ChatSession, label: '客服会话', labelField: 'sessionId' },
  faq: { model: Faq, label: '客服问答', labelField: 'question' },
  upload: { model: null, label: '文件上传', labelField: '' },
};

// 路径前缀 → 模块；注意长前缀必须排在前面（/api/chat/faqs 先于 /api/chat）
const PATH_MODULES = [
  { prefix: '/api/blogs', module: 'blog' },
  { prefix: '/api/categories', module: 'category' },
  { prefix: '/api/tags', module: 'tag' },
  { prefix: '/api/comments', module: 'comment' },
  { prefix: '/api/notifications', module: 'notification' },
  { prefix: '/api/feedback', module: 'feedback' },
  { prefix: '/api/auth', module: 'user' },
  { prefix: '/api/upload', module: 'upload' },
  { prefix: '/api/chat/faqs', module: 'faq' },
  { prefix: '/api/chat/sessions', module: 'chatSession' },
  { prefix: '/api/chat', module: 'chatSession' },
];

// 不参与留痕：健康检查、留痕自身、AI 流式接口、纯认证流程（登录/登出/发验证码/改密/重置）
const SKIP_PREFIXES = [
  '/api/health',
  '/api/audit-logs',
  '/api/ai',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/send-sms',
  '/api/auth/change-password',
  '/api/auth/reset-password',
];

// 动作修正：默认按 HTTP 方法推断，少数路径需要覆盖（如「更新个人资料」用 PUT 之外的语义）
const ACTION_OVERRIDES = [
  { prefix: '/api/auth/profile', action: 'update' },
];

const ID_RE = /^[0-9a-fA-F]{24}$/;
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// 需要脱敏的字段，禁止把密码 / 令牌写进留痕
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'captcha',
]);

/** 按模块取模型（供恢复接口复用） */
export function getAuditModel(moduleName) {
  return MODULE_MODELS[moduleName]?.model || null;
}

/** 把 mongoose 文档转成可存储的普通对象 */
function toPlain(doc) {
  if (doc == null) return null;
  if (Array.isArray(doc)) return doc.map((d) => toPlain(d));
  if (typeof doc.toObject === 'function') {
    return doc.toObject({ depopulate: true, versionKey: false });
  }
  return doc;
}

/** 递归脱敏 + 保留 ObjectId / Date 原生类型（否则恢复时无法还原引用） */
function sanitize(value, depth = 0) {
  if (value == null) return value ?? null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  if (typeof value === 'object') {
    // Buffer（如文件上传）不展开成巨型对象
    if (Buffer.isBuffer(value)) return null;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.has(k) ? '******' : sanitize(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** 解析请求路径命中的模块与目标 _id */
function resolveTarget(path, body) {
  const matched = PATH_MODULES.find((p) => path.startsWith(p.prefix));

  if (!matched) {
    // 未登记的前缀默认识别为「评论」——博客前台发评论走 /api/public/blogs/:id/comments
    if (body?.content && path.includes('/comments')) {
      const cmt = MODULE_MODELS.comment;
      return {
        module: 'comment',
        moduleLabel: cmt.label,
        model: cmt.model,
        labelField: cmt.labelField,
        // 新建评论时路径末段是 blogId，真正的新评论 _id 在响应体里，这里留空由响应补齐
        targetId: '',
        targetIds: [],
      };
    }
    return null;
  }

  const meta = MODULE_MODELS[matched.module];
  const segments = path.split('/').filter(Boolean);

  // 1) 路径里第一个 24 位十六进制段就是目标 _id（如 /api/blogs/:id、/api/blogs/:id/featured）
  let targetId = segments.find((s) => ID_RE.test(s)) || '';
  // 2) 客服会话用的是自定义 sessionId 字符串（非 ObjectId）
  if (!targetId) {
    const si = segments.indexOf('sessions');
    if (si !== -1 && segments[si + 1]) targetId = segments[si + 1];
  }

  // 3) 批量操作：路径无 id，但 body.ids 是数组
  let targetIds = [];
  if (!targetId && Array.isArray(body?.ids)) {
    targetIds = body.ids.map((v) => String(v)).filter((v) => ID_RE.test(v));
  }

  return {
    module: matched.module,
    moduleLabel: meta?.label || matched.module,
    model: meta?.model || null,
    labelField: meta?.labelField || '',
    targetId: String(targetId || ''),
    targetIds: targetIds.length ? targetIds : targetId ? [String(targetId)] : [],
  };
}

/** 从快照里取一个可读名称作为 targetLabel */
function pickLabel(snapshot, labelField) {
  const first = Array.isArray(snapshot) ? snapshot[0] : snapshot;
  if (!first || !labelField) return '';
  // 部分接口返回 { user: {...} } 的包装结构（如注册），下钻一层
  const source = first[labelField] == null && first.user ? first.user : first;
  const raw = source[labelField];
  if (raw == null) return '';
  return String(raw).slice(0, 80);
}

/**
 * 全局留痕中间件：挂在 express.json() 之后、所有业务路由之前。
 * - 写操作（POST/PUT/PATCH/DELETE）先取变更前快照（req._auditBefore）
 * - 包装 res.json 捕获响应体，请求结束时异步落库
 */
export default function auditTrail(req, res, next) {
  if (!WRITE_METHODS.has(req.method)) return next();
  const path = req.path || '';
  if (SKIP_PREFIXES.some((p) => path.startsWith(p))) return next();

  const target = resolveTarget(path, req.body);
  if (!target) return next();

  // 路由派发过程中 express 会改写 req.url，导致 res 'finish' 时 req.path 变成子路径，
  // 所以这里把进入时的完整路径固化下来，留痕落库时使用。
  req._auditPath = path;

  // 个人资料等「无 id 路径但操作对象就是当前登录用户」的接口，从令牌补齐目标 id
  if (!target.targetId && target.targetIds.length === 0 && path.startsWith('/api/auth/')) {
    const uid = operatorFromReq(req).userId;
    if (uid) {
      target.targetId = String(uid);
      target.targetIds = [String(uid)];
    }
  }

  // 包装响应，捕获返回体（用于记录变更后状态）
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    req._auditResponse = body;
    return originalJson(body);
  };

  // 请求结束（无论成功失败）统一落库，失败不阻塞主流程
  res.on('finish', () => {
    writeAuditLog(req, res, target).catch((err) => {
      console.error('[audit] 留痕写入失败:', err.message);
    });
  });

  // 需要变更前快照的场景：修改 / 删除
  if (req.method !== 'POST') {
    takeSnapshot(target)
      .then((snapshot) => {
        req._auditBefore = snapshot;
        // 如果路由处理器在快照完成前就已经返回（极端情况），补一次
        if (res.writableEnded) return;
        next();
      })
      .catch(() => next());
    return;
  }

  next();
}

/** 取变更前快照 */
async function takeSnapshot(target) {
  const { model, targetId, targetIds } = target;
  if (!model) return null;
  const ids = targetIds.length ? targetIds : targetId ? [targetId] : [];
  if (!ids.length) return null;
  try {
    const docs = await model.find({ _id: { $in: ids } }).lean();
    if (targetIds.length > 1) return docs;
    return docs[0] || null;
  } catch {
    return null;
  }
}

/** 取变更后快照（批量修改时响应体没有完整文档，需要回查一次） */
async function takeAfter(target, responseBody) {
  const plain = sanitize(toPlain(responseBody));
  if (!target.model) return plain;

  // 批量修改：响应体是 {matched, modified, ...}，回查这批文档的最终状态
  if (target.targetIds.length > 1) {
    try {
      const docs = await target.model
        .find({ _id: { $in: target.targetIds } })
        .lean();
      return sanitize(docs);
    } catch {
      return plain;
    }
  }
  return plain;
}

/** 从 Authorization 头解析操作人（兜底：部分路由在中间件之后才执行 requireAuth） */
function operatorFromReq(req) {
  if (req.user) {
    return { userId: req.user.id, username: req.user.username, role: req.user.role };
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token && process.env.JWT_SECRET) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      return { userId: payload.id, username: payload.username || '', role: '' };
    } catch {
      // 令牌无效就当作匿名操作
    }
  }
  return { userId: null, username: '', role: '' };
}

/** 组装并写入留痕记录 */
async function writeAuditLog(req, res, target) {
  const { method } = req;
  const path = req._auditPath || req.originalUrl.split('?')[0];
  let action = method === 'POST' ? 'create' : method === 'DELETE' ? 'delete' : 'update';
  const override = ACTION_OVERRIDES.find((o) => path.startsWith(o.prefix));
  if (override) action = override.action;

  const before = sanitize(toPlain(req._auditBefore ?? null));
  const responseBody = req._auditResponse;
  const failed = res.statusCode >= 400;

  // 失败请求没有产生真实数据变更，不记录 after；删除操作也没有 after
  const after =
    failed || action === 'delete' ? null : await takeAfter(target, responseBody);

  const operator = operatorFromReq(req);
  const afterDoc = Array.isArray(after) ? after[0] : after;
  const targetId =
    target.targetId ||
    String(afterDoc?._id ?? afterDoc?.user?._id ?? '');

  const record = {
    action,
    module: target.module,
    moduleLabel: target.moduleLabel,
    method,
    path,
    targetId,
    targetIds: target.targetIds.length ? target.targetIds : targetId ? [targetId] : [],
    targetLabel: pickLabel(after ?? before, target.labelField),
    before,
    after,
    operator: {
      userId: operator.userId || null,
      username:
        operator.username ||
        (target.module === 'comment' || target.module === 'chatSession' ? '访客' : ''),
      role: operator.role || '',
    },
    ip: req.ip || req.socket?.remoteAddress || '',
    userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
    statusCode: res.statusCode,
    success: !failed,
    errorMessage: failed
      ? String(responseBody?.message || responseBody?.error || '').slice(0, 300)
      : '',
  };

  await AuditLog.create(record);
}
