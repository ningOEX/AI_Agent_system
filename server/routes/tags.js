import express from 'express';
import { body, param, validationResult } from 'express-validator';

import Tag from '../models/Tag.js';
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

/** GET /api/tags  当前登录用户自己的标签列表 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const list = await Tag.find({ userId: req.user.id })
      .sort({ useCount: -1, name: 1 })
      .lean();
    res.json(list);
  } catch (err) {
    next(err);
  }
});

/** POST /api/tags  创建标签（归入当前用户） */
router.post(
  '/',
  requireAuth,
  [body('name').trim().notEmpty().withMessage('名称不能为空').isLength({ max: 30 })],
  validate,
  async (req, res, next) => {
    try {
      const userId = req.user.id;
      const name = req.body.name.trim();
      const nameLower = name.toLowerCase();
      const existing = await Tag.findOne({ userId, nameLower });
      if (existing) return res.status(200).json(existing);
      const tag = await Tag.create({
        userId,
        name,
        nameLower,
        color: req.body.color || '',
      });
      res.status(201).json(tag);
    } catch (err) {
      if (err.code === 11000) {
        const existing = await Tag.findOne({
          userId: req.user.id,
          nameLower: req.body.name.toLowerCase(),
        });
        if (existing) return res.status(200).json(existing);
      }
      next(err);
    }
  },
);

/** PUT /api/tags/:id  改色或重命名（只有创建者能改；同步改自己 Blog.tags） */
router.put(
  '/:id',
  requireAuth,
  [
    param('id').isMongoId(),
    body('name').optional().trim().notEmpty().isLength({ max: 30 }),
    body('color').optional().isString().isLength({ max: 20 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const userId = req.user.id;
      const doc = await Tag.findOne({ _id: req.params.id, userId });
      if (!doc) return res.status(404).json({ message: '标签不存在或无权修改' });

      if (req.body.name) {
        const newName = req.body.name.trim();
        const newLower = newName.toLowerCase();
        if (doc.nameLower !== newLower) {
          const clash = await Tag.findOne({
            userId,
            nameLower: newLower,
            _id: { $ne: doc._id },
          });
          if (clash) return res.status(409).json({ message: '已存在同名标签' });
          await Blog.updateMany(
            { userId, tags: doc.name },
            { $pull: { tags: doc.name } },
          );
          await Blog.updateMany(
            { userId, tags: { $ne: newName } },
            { $addToSet: { tags: newName } },
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

/** DELETE /api/tags/:id  删除标签（只有创建者能删；自己 Blog 自动 $pull） */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const doc = await Tag.findOne({ _id: req.params.id, userId: req.user.id });
    if (!doc) return res.status(404).json({ message: '标签不存在或无权删除' });
    await Blog.updateMany({ userId: req.user.id, tags: doc.name }, { $pull: { tags: doc.name } });
    await Tag.deleteOne({ _id: doc._id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * 内部辅助：保证某用户的这些标签都存在并 +1；旧标签集合里被移除的 -1
 * @param {string[]} newTags
 * @param {string[]} oldTags
 * @param {ObjectId} userId  标签归属的用户（= blog 的 userId，不是当前操作人）
 */
export async function touchTags(newTags, oldTags = [], userId = null) {
  if (!userId) return;

  const trimSet = (arr) =>
    new Set(arr.map((t) => String(t || '').trim()).filter(Boolean));

  const next = trimSet(newTags);
  const prev = trimSet(oldTags);

  for (const t of prev) {
    if (!next.has(t)) {
      await Tag.updateOne(
        { userId, nameLower: t.toLowerCase() },
        { $inc: { useCount: -1 } },
      );
    }
  }
  for (const t of next) {
    const nameLower = t.toLowerCase();
    await Tag.updateOne(
      { userId, nameLower },
      {
        $inc: { useCount: 1 },
        $setOnInsert: { name: t, nameLower, userId },
      },
      { upsert: true },
    );
  }
}

export default router;
