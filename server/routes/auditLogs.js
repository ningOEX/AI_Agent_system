import express from 'express';
import mongoose from 'mongoose';
import { param, query, validationResult } from 'express-validator';

import AuditLog from '../models/AuditLog.js';
import { requireAuth } from '../middleware/auth.js';
import { getAuditModel } from '../middleware/auditTrail.js';

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

/**
 * GET /api/audit-logs  留痕列表（分页 + 筛选）
 * 每个账号只能看到自己的操作记录（管理员也不例外）
 *
 * 列表按「操作对象」聚合：同一个对象（module + targetId）的多次改动只渲染最新一条，
 * 完整历史在详情里通过 GET /:id/history 查看，避免同一篇文章被刷屏。
 */
router.get(
  '/',
  requireAuth,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('module').optional().isString().trim(),
    query('action').optional().isIn(['create', 'update', 'delete']),
    query('keyword').optional().isString().trim(),
    query('startTime').optional().isISO8601().toDate(),
    query('endTime').optional().isISO8601().toDate(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const page = req.query.page ?? 1;
      const pageSize = req.query.pageSize ?? 10;

      // 数据隔离：每个账号只能看到自己的操作记录
      const filter = { 'operator.userId': req.user.id };

      if (req.query.module) filter.module = req.query.module;
      if (req.query.action) filter.action = req.query.action;

      const keyword = req.query.keyword?.trim();
      if (keyword) {
        const regex = { $regex: keyword, $options: 'i' };
        filter.$or = [
          { targetLabel: regex },
          { path: regex },
          { 'operator.username': regex },
        ];
      }

      if (req.query.startTime || req.query.endTime) {
        filter.createdAt = {};
        if (req.query.startTime) filter.createdAt.$gte = req.query.startTime;
        if (req.query.endTime) filter.createdAt.$lte = req.query.endTime;
      }

      const [result] = await AuditLog.aggregate([
        { $match: filter },
        // 列表不返回前后的完整快照，先剔除避免聚合过程占内存（详情单独查）
        { $project: { before: 0, after: 0 } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            // 同一操作对象归一组；无 targetId 的记录（批量操作 / 文件上传）按自身 _id 独立成组
            _id: {
              module: '$module',
              target: {
                $cond: [
                  { $gt: [{ $strLenCP: { $ifNull: ['$targetId', ''] } }, 0] },
                  '$targetId',
                  { $concat: ['#', { $toString: '$_id' }] },
                ],
              },
            },
            latest: { $first: '$$ROOT' },
            changeCount: { $sum: 1 },
          },
        },
        {
          $replaceRoot: {
            newRoot: { $mergeObjects: ['$latest', { changeCount: '$changeCount' }] },
          },
        },
        { $sort: { createdAt: -1 } },
        {
          $facet: {
            items: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
            total: [{ $count: 'count' }],
          },
        },
      ]);

      const total = result?.total?.[0]?.count ?? 0;

      res.json({
        items: result?.items ?? [],
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

/**
 * GET /api/audit-logs/:id/history  同一操作对象的全部改动记录（时间倒序）
 * 用于详情里展示该对象的完整变更历史；无 targetId 的记录只返回自身。
 */
router.get(
  '/:id/history',
  requireAuth,
  param('id').isMongoId(),
  validate,
  async (req, res, next) => {
    try {
      const log = await AuditLog.findById(req.params.id).select('-before -after').lean();
      if (!log) return res.status(404).json({ message: '留痕记录不存在' });

      if (String(log.operator?.userId || '') !== String(req.user.id)) {
        return res.status(403).json({ message: '无权查看该留痕记录' });
      }

      if (!log.targetId) return res.json([log]);

      // 数据隔离：历史也只回溯自己的改动，不含他人对同一对象的操作
      const items = await AuditLog.find({
        module: log.module,
        targetId: log.targetId,
        'operator.userId': req.user.id,
      })
        .select('-before -after')
        .sort({ createdAt: -1 })
        .lean();

      res.json(items);
    } catch (err) {
      next(err);
    }
  },
);

/** GET /api/audit-logs/:id  单条留痕详情（含变更前/后快照） */
router.get('/:id', requireAuth, param('id').isMongoId(), validate, async (req, res, next) => {
  try {
    const log = await AuditLog.findById(req.params.id).lean();
    if (!log) return res.status(404).json({ message: '留痕记录不存在' });

    // 每个账号只能查看自己的记录（管理员也不例外）
    if (String(log.operator?.userId || '') !== String(req.user.id)) {
      return res.status(403).json({ message: '无权查看该留痕记录' });
    }

    res.json(log);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/audit-logs/:id/restore  一键恢复到变更前
 * - delete → 用变更前快照把文档重新插回（保留原 _id）
 * - update → 用变更前快照覆盖当前文档
 * - create → 删除当时新建的文档（撤销新增）
 * 每个账号仅可恢复自己操作的记录（管理员也不例外）
 */
router.post(
  '/:id/restore',
  requireAuth,
  param('id').isMongoId(),
  validate,
  async (req, res, next) => {
    try {
      const log = await AuditLog.findById(req.params.id);
      if (!log) return res.status(404).json({ message: '留痕记录不存在' });

      // 每个账号只能恢复自己的操作记录（管理员也不例外）
      if (String(log.operator?.userId || '') !== String(req.user.id)) {
        return res.status(403).json({ message: '无权恢复他人的操作记录' });
      }
      if (!log.success) {
        return res.status(400).json({ message: '该操作未成功，无需恢复' });
      }
      if (log.restored) {
        return res.status(409).json({ message: '该记录已恢复过，请勿重复操作' });
      }

      const model = getAuditModel(log.module);
      if (!model) {
        return res.status(400).json({ message: '该模块不支持数据恢复' });
      }

      const snapshots = log.before == null ? [] : Array.isArray(log.before) ? log.before : [log.before];
      const ids = (log.targetIds?.length ? log.targetIds : [log.targetId]).filter(Boolean);

      if (log.action === 'delete') {
        if (!snapshots.length) {
          return res.status(400).json({ message: '缺少变更前数据，无法恢复' });
        }
        const existed = await model.countDocuments({ _id: { $in: ids } });
        if (existed > 0) {
          return res.status(409).json({ message: '目标数据已存在，无需恢复' });
        }
        await model.collection.insertMany(snapshots, { ordered: false });
      } else if (log.action === 'create') {
        if (!ids.length) {
          return res.status(400).json({ message: '缺少目标标识，无法撤销' });
        }
        await model.collection.deleteMany({ _id: { $in: ids.map((i) => toObjectId(i)) } });
      } else {
        if (!snapshots.length) {
          return res.status(400).json({ message: '缺少变更前数据，无法回滚' });
        }
        for (const snapshot of snapshots) {
          if (!snapshot?._id) continue;
          const { _id, __v, ...rest } = snapshot;
          // 保留原始创建时间，更新时间记为回滚时刻
          rest.updatedAt = new Date();
          await model.collection.replaceOne({ _id: toObjectId(_id) }, rest, { upsert: true });
        }
      }

      log.restored = true;
      log.restoredAt = new Date();
      log.restoredBy = req.user.username || '';
      await log.save();

      res.json({ message: '已恢复到变更前的状态', restored: true });
    } catch (err) {
      if (err?.code === 11000) {
        return res.status(409).json({ message: '目标数据已存在，无需恢复' });
      }
      next(err);
    }
  },
);

/** 字符串 id 转 ObjectId，非法值返回原值交给 mongo 抛错 */
function toObjectId(id) {
  return mongoose.Types.ObjectId.isValid(String(id))
    ? new mongoose.Types.ObjectId(String(id))
    : id;
}

export default router;
