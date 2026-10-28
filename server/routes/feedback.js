import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import mongoose from 'mongoose';

import Feedback from '../models/Feedback.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const STATUS = ['pending', 'processing', 'resolved'];
const TYPES = ['bug', 'feature', 'experience', 'content', 'other'];

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: '仅管理员可操作' });
  }
  next();
}

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

/** 分页参数归一化 */
function paging(req) {
  const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
  const pageSize = Math.min(
    50,
    Math.max(1, Number.parseInt(String(req.query.pageSize || '10'), 10) || 10),
  );
  return { page, pageSize, skip: (page - 1) * pageSize };
}

/** 把按状态聚合的结果转成 { pending, processing, resolved } */
function toCounts(rows) {
  const counts = { pending: 0, processing: 0, resolved: 0 };
  for (const row of rows) {
    if (row._id in counts) counts[row._id] = row.count;
  }
  return counts;
}

// ---------- 用户端 ----------

/** POST /api/feedback  提交问题反馈 */
router.post(
  '/',
  requireAuth,
  [
    body('title').trim().notEmpty().withMessage('标题不能为空').isLength({ max: 100 }),
    body('content')
      .trim()
      .notEmpty()
      .withMessage('问题描述不能为空')
      .isLength({ max: 2000 }),
    body('type').optional().isIn(TYPES).withMessage('问题类型不合法'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const feedback = await Feedback.create({
        userId: req.user.id,
        username: req.user.username,
        title: req.body.title,
        content: req.body.content,
        type: req.body.type || 'other',
      });
      res.status(201).json(feedback);
    } catch (err) {
      next(err);
    }
  },
);

/** GET /api/feedback/mine  我的反馈列表 + 各状态数量 */
router.get(
  '/mine',
  requireAuth,
  [query('status').optional().isIn(STATUS)],
  validate,
  async (req, res, next) => {
    try {
      const { page, pageSize, skip } = paging(req);
      const baseMatch = { userId: req.user.id };
      const match = { ...baseMatch };
      if (req.query.status) match.status = req.query.status;

      const [list, total, countRows] = await Promise.all([
        Feedback.find(match).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
        Feedback.countDocuments(match),
        Feedback.aggregate([{ $match: baseMatch }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      ]);

      res.json({ list, total, page, pageSize, counts: toCounts(countRows) });
    } catch (err) {
      next(err);
    }
  },
);

// ---------- 管理员端 ----------

/** GET /api/feedback  全部反馈（支持状态/关键词筛选） */
router.get(
  '/',
  requireAuth,
  requireAdmin,
  [query('status').optional().isIn(STATUS)],
  validate,
  async (req, res, next) => {
    try {
      const { page, pageSize, skip } = paging(req);
      const match = {};
      if (req.query.status) match.status = req.query.status;
      if (req.query.keyword) {
        const keyword = String(req.query.keyword).trim().slice(0, 50);
        const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        match.$or = [{ title: regex }, { content: regex }, { username: regex }];
      }

      const [list, total, countRows] = await Promise.all([
        Feedback.find(match).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
        Feedback.countDocuments(match),
        Feedback.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      ]);

      res.json({ list, total, page, pageSize, counts: toCounts(countRows) });
    } catch (err) {
      next(err);
    }
  },
);

/** PUT /api/feedback/:id/reply  管理员处理并回复 */
router.put(
  '/:id/reply',
  requireAuth,
  requireAdmin,
  [
    param('id').custom((v) => mongoose.isValidObjectId(v)).withMessage('反馈 id 不合法'),
    body('status').isIn(STATUS).withMessage('处理状态不合法'),
    body('reply').optional().isString().trim().isLength({ max: 2000 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { status } = req.body;
      const reply = String(req.body.reply || '').trim();

      // 标记为已解决时必须给出处理结果，否则用户看不到任何回复
      if (status === 'resolved' && !reply) {
        return res.status(422).json({ message: '标记为已解决时请填写处理结果' });
      }

      const update = { status };
      if (reply) {
        update.reply = reply;
        update.repliedBy = req.user.username;
        update.repliedAt = new Date();
      }

      const feedback = await Feedback.findByIdAndUpdate(req.params.id, update, {
        new: true,
      });
      if (!feedback) return res.status(404).json({ message: '反馈不存在' });

      res.json(feedback);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
