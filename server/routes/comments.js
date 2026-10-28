import express from 'express';
import { body, query, validationResult } from 'express-validator';

import Comment from '../models/Comment.js';
import Blog from '../models/Blog.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

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

/** GET /api/comments — 评论列表（分页 + 状态 + 关键词过滤，admin 看所有） */
router.get(
  '/',
  requireAuth,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('status').optional().isIn(['pending', 'approved', 'rejected']),
    query('keyword').optional().isString().trim(),
    query('blogId').optional().isMongoId(),
  ],
  async (req, res, next) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: '仅管理员可管理评论' });
      }

      const page = req.query.page ?? 1;
      const pageSize = req.query.pageSize ?? 15;
      const filter = {};
      if (req.query.status) filter.status = req.query.status;
      if (req.query.blogId) filter.blogId = req.query.blogId;
      if (req.query.keyword) {
        const kw = String(req.query.keyword).trim();
        filter.$or = [
          { content: { $regex: kw, $options: 'i' } },
          { nickname: { $regex: kw, $options: 'i' } },
          { email: { $regex: kw, $options: 'i' } },
        ];
      }

      const [items, total] = await Promise.all([
        Comment.find(filter)
          .populate('blogId', 'title _id')
          .populate('userId', 'username avatar')
          .sort({ createdAt: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize),
        Comment.countDocuments(filter),
      ]);

      res.json({
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      });
    } catch (err) { next(err); }
  },
);

/** GET /api/comments/stats — 评论统计（各状态数量 + 今日新增） */
router.get('/stats', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: '仅管理员' });
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    const agg = await Comment.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const byStatus = { pending: 0, approved: 0, rejected: 0 };
    for (const a of agg) byStatus[a._id] = a.count;

    const todayCount = await Comment.countDocuments({ createdAt: { $gte: todayStart } });
    res.json({ byStatus, todayCount, total: byStatus.pending + byStatus.approved + byStatus.rejected });
  } catch (err) { next(err); }
});

/** PUT /api/comments/:id/status — 审核（approved / rejected） */
router.put(
  '/:id/status',
  requireAuth,
  [body('status').isIn(['approved', 'rejected']).withMessage('status 必须是 approved 或 rejected')],
  validate,
  async (req, res, next) => {
    try {
      if (req.user.role !== 'admin') return res.status(403).json({ message: '仅管理员' });
      const id = req.params.id;
      const comment = await Comment.findById(id);
      if (!comment) return res.status(404).json({ message: '评论不存在' });
      comment.status = req.body.status;
      const saved = await comment.save();
      res.json({ _id: saved._id, status: saved.status });
    } catch (err) {
      if (err.name === 'CastError') return res.status(400).json({ message: '无效的评论 ID' });
      next(err);
    }
  },
);

/** DELETE /api/comments/:id — 删除评论（连同整栋楼的回复一起删） */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: '仅管理员' });
    const id = req.params.id;
    const target = await Comment.findById(id);
    if (!target) return res.status(404).json({ message: '评论不存在' });

    // 同时删除整栋楼：rootId === 自己的 id → 顶级评论，删整栋；否则只删自己
    let deletedCount;
    if (!target.parentId || !target.rootId || String(target.rootId) === String(target._id)) {
      const r = await Comment.deleteMany({
        $or: [{ _id: id }, { rootId: id }],
      });
      deletedCount = r.deletedCount;
    } else {
      const r = await Comment.deleteOne({ _id: id });
      deletedCount = r.deletedCount;
    }
    res.json({ message: '删除成功', deletedCount });
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ message: '无效的评论 ID' });
    next(err);
  }
});

export default router;
