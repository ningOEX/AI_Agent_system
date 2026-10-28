import express from 'express';
import { body, query, validationResult } from 'express-validator';

import Blog from '../models/Blog.js';
import Category from '../models/Category.js';
import { requireAuth } from '../middleware/auth.js';
import contentGuard from '../middleware/contentGuard.js';
import { touchCategory } from './categories.js';
import { touchTags } from './tags.js';

const router = express.Router();

// ---------- 校验规则 ----------
const blogValidation = [
  body('title').trim().notEmpty().withMessage('标题不能为空').isLength({ max: 200 }),
  body('category').trim().notEmpty().withMessage('分类不能为空').isLength({ max: 50 }),
  body('summary').trim().notEmpty().withMessage('摘要不能为空').isLength({ max: 500 }),
  body('content').notEmpty().withMessage('详情内容不能为空'),
  body('tags').customSanitizer((v) => v ?? []).isArray().withMessage('tags 必须是数组'),
  body('tags.*').optional().isString().trim(),
  body('coverImage').optional().isString(),
  body('status').optional().isIn(['draft', 'scheduled', 'published']),
  // scheduledAt：允许 null（非定时发布），有值时才校验 ISO8601
  body('scheduledAt')
    .optional({ nullable: true })
    .if((value) => value != null && value !== '')
    .isISO8601()
    .toDate(),
  body('author').optional().isString().trim(),
  // 内容声明：original 原创 / ai AI 生成
  body('contentType').optional().isIn(['original', 'ai']),
  body('featured').optional().isBoolean(),
];

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      message: '参数校验失败',
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

/**
 * 所有权校验：确保当前登录用户是该博客所有者（admin 例外）。
 * 在 PUT /api/blogs/:id 和 DELETE /api/blogs/:id 中作为中间件使用。
 */
async function checkOwnership(req, res, next) {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ message: '文章不存在' });
    }
    if (req.user.role !== 'admin' && !blog.userId.equals(req.user.id)) {
      return res.status(403).json({ message: '无权操作此文章' });
    }
    // 把查到的 blog 挂上去，后续路由直接用，省一次 DB 查询
    req.blog = blog;
    next();
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ message: '无效的文章 ID' });
    }
    next(err);
  }
}

// ---------- GET /api/blogs 列表（分页 + 搜索 + 状态过滤 + 用户隔离） ----------
router.get(
  '/',
  requireAuth,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('keyword').optional().isString().trim(),
    query('status').optional().isIn(['draft', 'scheduled', 'published']),
    query('category').optional().isString().trim(),
    query('featured').optional().isBoolean().toBoolean(),
  ],
  async (req, res, next) => {
    try {
      const page = req.query.page ?? 1;
      const pageSize = req.query.pageSize ?? 10;
      const keyword = req.query.keyword?.trim();
      const status = req.query.status;
      const category = req.query.category;

      const filter = {};

      // 一对一隔离：admin 看所有，普通用户只看自己的
      if (req.user.role !== 'admin') {
        filter.userId = req.user.id;
      }

      if (keyword) {
        filter.$or = [
          { title: { $regex: keyword, $options: 'i' } },
          { summary: { $regex: keyword, $options: 'i' } },
          { tags: { $in: [new RegExp(keyword, 'i')] } },
        ];
      }
      if (status) filter.status = status;
      if (category) filter.category = category;
      if (req.query.featured !== undefined) filter.featured = req.query.featured;

      const [items, total] = await Promise.all([
        Blog.find(filter)
          .select({ content: 0 })
          .populate('userId', 'username')
          .sort({ featured: -1, createdAt: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize),
        Blog.countDocuments(filter),
      ]);

      res.json({
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      });
    } catch (err) {
      next(err);
    }
  },
);

/** 管理员权限校验：批量操作仅 admin 可用 */
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: '仅管理员可以执行此操作' });
  }
  next();
}

// ---------- 批量操作的公共校验规则 ----------
const batchIdsValidation = [
  body('ids').isArray({ min: 1 }).withMessage('请至少选择一篇文章'),
  body('ids.*').isMongoId().withMessage('存在无效的文章 ID'),
];

// ---------- PUT /api/blogs/batch/status 批量上架/下架（仅 admin） ----------
// 注意：必须注册在 /:id 之前，避免静态子路径被参数路由吃掉
router.put(
  '/batch/status',
  requireAuth,
  requireAdmin,
  [
    ...batchIdsValidation,
    body('status').isIn(['draft', 'published']).withMessage('状态只能是 draft 或 published'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { ids, status } = req.body;

      if (status === 'published') {
        // 首次上架的文章补齐发布时间（已有发布时间的保持不变）
        await Blog.updateMany(
          { _id: { $in: ids }, publishedAt: null },
          { $set: { publishedAt: new Date() } },
        );
      }

      // 上下架都清空定时时间，避免残留 scheduledAt 造成误发布
      const result = await Blog.updateMany(
        { _id: { $in: ids } },
        { $set: { status, scheduledAt: null } },
      );

      res.json({ matched: result.matchedCount, modified: result.modifiedCount, status });
    } catch (err) {
      next(err);
    }
  },
);

// ---------- PUT /api/blogs/batch/category 批量修改分类（所有登录用户，普通用户仅限自己的文章） ----------
router.put(
  '/batch/category',
  requireAuth,
  [
    ...batchIdsValidation,
    body('category').trim().notEmpty().withMessage('分类不能为空').isLength({ max: 50 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { ids } = req.body;
      const category = req.body.category.trim();
      const categoryLower = category.toLowerCase();

      // 一对一隔离：admin 可批量改所有文章，普通用户只能改自己的
      const scope = { _id: { $in: ids } };
      if (req.user.role !== 'admin') scope.userId = req.user.id;

      const docs = await Blog.find(scope).select({ category: 1, userId: 1 });
      const movedOutByUser = new Map(); // userId -> Map<oldLower, count>
      let movedTotal = 0;
      for (const doc of docs) {
        const oldName = (doc.category || '').trim();
        if (!oldName || oldName.toLowerCase() === categoryLower) continue;
        const userId = String(doc.userId);
        const inner = movedOutByUser.get(userId) ?? new Map();
        inner.set(oldName.toLowerCase(), (inner.get(oldName.toLowerCase()) || 0) + 1);
        movedOutByUser.set(userId, inner);
        movedTotal += 1;
      }

      const result = await Blog.updateMany(scope, { $set: { category } });

      // 同步维护分类的 useCount：按 userId 分组分别处理
      const upsertQueries = [];
      for (const [userIdStr, innerMap] of movedOutByUser) {
        const userId = userIdStr;
        for (const [oldLower, count] of innerMap) {
          upsertQueries.push(
            Category.updateOne({ userId, nameLower: oldLower }, { $inc: { useCount: -count } }),
          );
        }
        if (movedTotal > 0) {
          upsertQueries.push(
            Category.updateOne(
              { userId, nameLower: categoryLower },
              {
                $inc: { useCount: movedTotal },
                $setOnInsert: { name: category, nameLower: categoryLower, userId },
              },
              { upsert: true },
            ),
          );
        }
      }
      await Promise.all(upsertQueries);

      res.json({
        matched: result.matchedCount,
        modified: result.modifiedCount,
        category,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------- GET /api/blogs/:id 详情（带所有权校验） ----------
router.get('/:id', requireAuth, checkOwnership, async (req, res) => {
  // checkOwnership 已经查到 blog 并校验所有权，直接返回
  res.json(req.blog);
});

// ---------- POST /api/blogs 新建（自动绑定当前用户；含敏感词校验） ----------
router.post('/', requireAuth, blogValidation, validate, contentGuard, async (req, res, next) => {
  try {
    const data = req.body;

    // 强制绑定当前用户——前端传什么 userId 都忽略
    data.userId = req.user.id;

    // 定时发布：如果 status=scheduled 且 scheduledAt 已过，直接当 published
    if (data.status === 'scheduled' && data.scheduledAt && new Date(data.scheduledAt) <= new Date()) {
      data.status = 'published';
      data.publishedAt = data.scheduledAt;
    }
    if (data.status === 'published' && !data.publishedAt) {
      data.publishedAt = new Date();
    }

    const blog = await Blog.create(data);
    // 自动登记分类/标签并 +1 useCount（归属 blog 所有者）
    await Promise.all([
      touchCategory(blog.category, '', blog.userId),
      touchTags(blog.tags || [], [], blog.userId),
    ]);
    res.status(201).json(blog);
  } catch (err) {
    next(err);
  }
});

// ---------- PUT /api/blogs/:id/featured — 仅 admin 可切换 ----------
router.put(
  '/:id/featured',
  requireAuth,
  async (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: '仅管理员可以设置精选' });
    next();
  },
  body('featured').isBoolean().withMessage('featured 必须是布尔值'),
  validate,
  async (req, res, next) => {
    try {
      req.blog = await Blog.findById(req.params.id);
      if (!req.blog) return res.status(404).json({ message: '文章不存在' });
      req.blog.featured = req.body.featured;
      const saved = await req.blog.save();
      res.json({ _id: saved._id, featured: saved.featured });
    } catch (err) {
      next(err);
    }
  },
);

// ---------- PUT /api/blogs/:id 更新（带所有权校验；含敏感词校验） ----------
router.put(
  '/:id',
  requireAuth,
  checkOwnership,
  blogValidation,
  validate,
  contentGuard,
  async (req, res, next) => {
    try {
      const oldCategory = req.blog.category;
      const oldTags = [...(req.blog.tags || [])];

      // 禁止更新 userId——所有权不能转移
      const { userId, ...updates } = req.body;
      Object.assign(req.blog, updates);
      const saved = await req.blog.save();

      // 分类/标签变化时自动维护 useCount（归属 blog 所有者）
      await Promise.all([
        touchCategory(saved.category, oldCategory, saved.userId),
        touchTags(saved.tags || [], oldTags, saved.userId),
      ]);

      res.json(saved);
    } catch (err) {
      next(err);
    }
  },
);

// ---------- DELETE /api/blogs/:id 删除（带所有权校验） ----------
router.delete('/:id', requireAuth, checkOwnership, async (req, res, next) => {
  try {
    await Blog.deleteOne({ _id: req.blog._id });
    // 删除时反向扣减计数（归属 blog 所有者）
    await Promise.all([
      touchCategory('', req.blog.category, req.blog.userId),
      touchTags([], req.blog.tags || [], req.blog.userId),
    ]);
    res.json({ message: '删除成功' });
  } catch (err) {
    next(err);
  }
});

export default router;
