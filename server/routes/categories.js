import express from 'express';
import { body, param, validationResult } from 'express-validator';

import Category from '../models/Category.js';
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

/** GET /api/categories  当前登录用户自己的分类列表 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const list = await Category.find({ userId: req.user.id })
      .sort({ useCount: -1, name: 1 })
      .lean();
    res.json(list);
  } catch (err) {
    next(err);
  }
});

/** POST /api/categories  创建分类（归入当前用户） */
router.post(
  '/',
  requireAuth,
  [body('name').trim().notEmpty().withMessage('名称不能为空').isLength({ max: 50 })],
  validate,
  async (req, res, next) => {
    try {
      const userId = req.user.id;
      const name = req.body.name.trim();
      const nameLower = name.toLowerCase();
      const existing = await Category.findOne({ userId, nameLower });
      if (existing) return res.status(200).json(existing);
      const category = await Category.create({
        userId,
        name,
        nameLower,
        color: req.body.color || '',
      });
      res.status(201).json(category);
    } catch (err) {
      // compound unique 冲突直接返回已有
      if (err.code === 11000) {
        const existing = await Category.findOne({
          userId: req.user.id,
          nameLower: req.body.name.toLowerCase(),
        });
        if (existing) return res.status(200).json(existing);
      }
      next(err);
    }
  },
);

/** PUT /api/categories/:id  重命名或改色（只有创建者能改） */
router.put(
  '/:id',
  requireAuth,
  [
    param('id').isMongoId(),
    body('name').optional().trim().notEmpty().isLength({ max: 50 }),
    body('color').optional().isString().isLength({ max: 20 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const doc = await Category.findOne({ _id: req.params.id, userId: req.user.id });
      if (!doc) return res.status(404).json({ message: '分类不存在或无权修改' });

      const update = {};
      if (req.body.name) {
        const newName = req.body.name.trim();
        const newLower = newName.toLowerCase();
        if (doc.nameLower !== newLower) {
          const clash = await Category.findOne({
            userId: req.user.id,
            nameLower: newLower,
            _id: { $ne: doc._id },
          });
          if (clash) return res.status(409).json({ message: '已存在同名分类' });
          // 同步修改当前用户自己 Blog 里的 category
          await Blog.updateMany(
            { userId: req.user.id, category: doc.name },
            { $set: { category: newName } },
          );
          doc.name = newName;
          doc.nameLower = newLower;
        }
      }
      if (typeof req.body.color === 'string') doc.color = req.body.color;
      const saved = await doc.save();
      res.json(saved);
    } catch (err) {
      next(err);
    }
  },
);

/** DELETE /api/categories/:id  删除分类（只有创建者能删；当前用户 Blog 的 category 会被清空） */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const doc = await Category.findOne({ _id: req.params.id, userId: req.user.id });
    if (!doc) return res.status(404).json({ message: '分类不存在或无权删除' });
    await Blog.updateMany(
      { userId: req.user.id, category: doc.name },
      { $set: { category: '' } },
    );
    await Category.deleteOne({ _id: doc._id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * 内部辅助：确保某用户的分类存在并 +1；如果 oldName 不同则 -1
 * @param {string} newName
 * @param {string} oldName
 * @param {ObjectId} userId  分类归属的用户（= blog 的 userId，不是当前操作人）
 */
export async function touchCategory(newName, oldName = '', userId = null) {
  if (!newName || !userId) return;
  const trimmed = newName.trim();
  if (!trimmed) return;
  const nameLower = trimmed.toLowerCase();

  if (oldName && oldName !== newName) {
    await Category.updateOne(
      { userId, nameLower: oldName.toLowerCase().trim() },
      { $inc: { useCount: -1 } },
    );
  }
  await Category.updateOne(
    { userId, nameLower },
    {
      $inc: { useCount: 1 },
      $setOnInsert: { name: trimmed, nameLower, userId },
    },
    { upsert: true },
  );
}

export default router;
