import express from 'express';
import { body, validationResult } from 'express-validator';

import Blog from '../models/Blog.js';
import Comment from '../models/Comment.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// ================================================================
//                 博客前台公开 API（无需登录）
// ================================================================

/** GET /api/public/blogs — 公开博客列表（仅 published） */
router.get('/blogs', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize || '12', 10)));
    const keyword = req.query.keyword?.trim();
    const category = req.query.category?.trim();
    const tag = req.query.tag?.trim();

    const filter = { status: 'published' };
    if (keyword) {
      filter.$or = [
        { title: { $regex: keyword, $options: 'i' } },
        { summary: { $regex: keyword, $options: 'i' } },
        { tags: { $in: [new RegExp(keyword, 'i')] } },
      ];
    }
    if (category) filter.category = category;
    if (tag) filter.tags = tag;

    const [list, total] = await Promise.all([
      Blog.find(filter)
        .select({ content: 0 })
        .populate('userId', 'username avatar')
        .sort({ featured: -1, publishedAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      Blog.countDocuments(filter),
    ]);

    // 聚合每个博客的已通过评论数
    const blogIds = list.map((b) => b._id);
    const commentCounts = await Comment.aggregate([
      { $match: { blogId: { $in: blogIds }, status: 'approved' } },
      { $group: { _id: '$blogId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(commentCounts.map((c) => [String(c._id), c.count]));

    const listWithCounts = list.map((b) => ({
      ...b.toObject(),
      commentCount: countMap.get(String(b._id)) || 0,
    }));

    res.json({
      list: listWithCounts,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) { next(err); }
});

/** GET /api/public/blogs/:id — 公开博客详情（仅 published，自增 views） */
router.get('/blogs/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const blog = await Blog.findOneAndUpdate(
      { _id: id, status: 'published' },
      { $inc: { views: 1 } },
      { new: true },
    ).populate('userId', 'username avatar');

    if (!blog) {
      return res.status(404).json({ message: '文章不存在或尚未发布' });
    }

    const commentCount = await Comment.countDocuments({ blogId: blog._id, status: 'approved' });
    const result = blog.toObject();
    result.commentCount = commentCount;

    res.json(result);
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ message: '无效的文章 ID' });
    }
    next(err);
  }
});

/** GET /api/public/categories — 分类聚合 */
router.get('/categories', async (_req, res, next) => {
  try {
    const result = await Blog.aggregate([
      { $match: { status: 'published', category: { $ne: '' } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    res.json(result.map((r) => ({ name: r._id, count: r.count })));
  } catch (err) { next(err); }
});

/** GET /api/public/tags — 标签聚合 */
router.get('/tags', async (_req, res, next) => {
  try {
    const result = await Blog.aggregate([
      { $match: { status: 'published', tags: { $nin: [[], null] } } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 50 },
    ]);
    res.json(result.map((r) => ({ name: r._id, count: r.count })));
  } catch (err) { next(err); }
});

/** GET /api/public/archive — 按月归档 */
router.get('/archive', async (_req, res, next) => {
  try {
    const result = await Blog.aggregate([
      { $match: { status: 'published' } },
      {
        $group: {
          _id: {
            year: { $year: '$publishedAt' },
            month: { $month: '$publishedAt' },
          },
          count: { $sum: 1 },
          blogs: {
            $push: {
              _id: '$_id',
              title: '$title',
              publishedAt: '$publishedAt',
            },
          },
        },
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
    ]);
    res.json(
      result.map((r) => ({
        year: r._id.year,
        month: r._id.month,
        label: `${r._id.year}年${String(r._id.month).padStart(2, '0')}月`,
        count: r.count,
        blogs: r.blogs,
      })),
    );
  } catch (err) { next(err); }
});

// ================================================================
//                 公开评论 API（无需登录，但默认 pending）
// ================================================================

/** GET /api/public/blogs/:id/comments — 某文章评论树（仅 approved，按 rootId 盖楼） */
router.get('/blogs/:id/comments', async (req, res, next) => {
  try {
    const blogId = req.params.id;
    // 先校验文章存在且已发布
    const blog = await Blog.exists({ _id: blogId, status: 'published' });
    if (!blog) {
      return res.status(404).json({ message: '文章不存在' });
    }

    const allApproved = await Comment.find({ blogId, status: 'approved' })
      .populate('userId', 'username avatar')
      .sort({ createdAt: 1 })
      .lean();

    // 组装：根评论 + 每栋楼的回复数组
    const roots = [];
    const replyMap = new Map(); // rootId → []
    for (const c of allApproved) {
      if (!c.rootId || String(c.rootId) === String(c._id)) {
        // 顶级评论
        roots.push(c);
      } else {
        const key = String(c.rootId);
        if (!replyMap.has(key)) replyMap.set(key, []);
        replyMap.get(key).push(c);
      }
    }
    // 每栋楼：roots[i].replies = replyMap.get(roots[i]._id) || []
    for (const r of roots) {
      r.replies = replyMap.get(String(r._id)) || [];
      r.replyCount = r.replies.length;
    }

    res.json({
      total: allApproved.length,
      rootCount: roots.length,
      roots,
    });
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ message: '无效的文章 ID' });
    next(err);
  }
});

/** POST /api/public/blogs/:id/comments — 发表评论（需登录，默认 pending 等待审核） */
router.post(
  '/blogs/:id/comments',
  requireAuth,
  [
    body('content').trim().notEmpty().withMessage('内容不能为空').isLength({ max: 1000 }).withMessage('内容不能超过 1000 字'),
    body('parentId').optional().isMongoId(),
  ],
  async (req, res, next) => {
    try {
      const blogId = req.params.id;
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({
          message: '参数校验失败',
          errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
        });
      }

      const blog = await Blog.exists({ _id: blogId, status: 'published' });
      if (!blog) return res.status(404).json({ message: '文章不存在或尚未发布' });

      const { content, parentId } = req.body;

      // 嵌套结构处理
      let rootId = null;
      let replyToNickname = '';
      if (parentId) {
        const parent = await Comment.findById(parentId);
        if (!parent) return res.status(404).json({ message: '回复的评论不存在' });
        rootId = parent.rootId || parent._id;
        replyToNickname = parent.nickname || parent.userId?.username || '楼主';
      }

      const comment = new Comment({
        blogId,
        content,
        parentId: parentId || null,
        rootId,
        replyToNickname,
        // 强制使用当前登录用户，前端传什么都忽略
        userId: req.user.id,
        nickname: req.user.username,
        status: 'pending',
        ip: (req.ip || req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim(),
      });

      const saved = await comment.save();
      res.status(201).json({
        _id: saved._id,
        status: saved.status,
        message: '评论已提交，等待管理员审核',
      });
    } catch (err) {
      if (err.name === 'CastError') return res.status(400).json({ message: '无效的文章 ID' });
      next(err);
    }
  },
);

export default router;
