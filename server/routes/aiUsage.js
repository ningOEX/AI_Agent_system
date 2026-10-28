import express from 'express';
import { query, validationResult } from 'express-validator';

import AiUsageLog from '../models/AiUsageLog.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getPricing, listPricing, SCENE_LABELS } from '../config/modelPricing.js';

const router = express.Router();

const MAX_DAYS = 90;
const DEFAULT_DAYS = 14;

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

/** 金额统一保留 6 位小数，避免浮点尾巴出到前端 */
function money(value) {
  return Number((Number(value) || 0).toFixed(6));
}

/**
 * 取最近 N 天的起点（本地时间 00:00）。
 * 注意：这里依赖服务器本地时区为东八区，与统计口径的 timezone:'+08:00' 保持一致。
 */
function rangeStart(days) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

/** 解析 days 参数：1~90，默认 14 */
function parseDays(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.floor(n));
}

/**
 * GET /api/ai-usage/overview
 * 汇总指标（近 N 天）+ 今日快照，供页面顶部 KPI 卡片使用
 */
router.get(
  '/overview',
  requireAuth,
  requireAdmin,
  [query('days').optional().isInt({ min: 1, max: MAX_DAYS }).toInt()],
  validate,
  async (req, res, next) => {
    try {
      const days = parseDays(req.query.days);
      const start = rangeStart(days);

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [agg, todayAgg] = await Promise.all([
        AiUsageLog.aggregate([
          { $match: { createdAt: { $gte: start } } },
          {
            $group: {
              _id: null,
              calls: { $sum: 1 },
              successCalls: { $sum: { $cond: ['$success', 1, 0] } },
              promptTokens: { $sum: '$promptTokens' },
              completionTokens: { $sum: '$completionTokens' },
              totalTokens: { $sum: '$totalTokens' },
              units: { $sum: '$units' },
              cost: { $sum: '$cost' },
              estimatedCalls: { $sum: { $cond: ['$estimated', 1, 0] } },
              unknownModelCalls: { $sum: { $cond: ['$unknownModel', 1, 0] } },
            },
          },
        ]),
        AiUsageLog.aggregate([
          { $match: { createdAt: { $gte: todayStart } } },
          {
            $group: {
              _id: null,
              calls: { $sum: 1 },
              totalTokens: { $sum: '$totalTokens' },
              cost: { $sum: '$cost' },
            },
          },
        ]),
      ]);

      const row = agg[0] || {};
      const calls = row.calls || 0;
      const cost = money(row.cost);

      res.json({
        days,
        overview: {
          calls,
          successCalls: row.successCalls || 0,
          failedCalls: calls - (row.successCalls || 0),
          promptTokens: row.promptTokens || 0,
          completionTokens: row.completionTokens || 0,
          totalTokens: row.totalTokens || 0,
          units: row.units || 0,
          cost,
          avgCostPerCall: calls ? money(cost / calls) : 0,
          estimatedCalls: row.estimatedCalls || 0,
          unknownModelCalls: row.unknownModelCalls || 0,
        },
        today: {
          calls: todayAgg[0]?.calls || 0,
          totalTokens: todayAgg[0]?.totalTokens || 0,
          cost: money(todayAgg[0]?.cost),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/ai-usage/trend
 * 近 N 天按天趋势，后端补零（没有调用的日期也要有 0 的点）
 */
router.get(
  '/trend',
  requireAuth,
  requireAdmin,
  [query('days').optional().isInt({ min: 1, max: MAX_DAYS }).toInt()],
  validate,
  async (req, res, next) => {
    try {
      const days = parseDays(req.query.days);
      const start = rangeStart(days);

      const rows = await AiUsageLog.aggregate([
        { $match: { createdAt: { $gte: start } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: '+08:00' } },
            calls: { $sum: 1 },
            tokens: { $sum: '$totalTokens' },
            cost: { $sum: '$cost' },
          },
        },
      ]);

      const map = new Map(rows.map((r) => [r._id, r]));
      const trend = [];
      for (let i = 0; i < days; i += 1) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const hit = map.get(key);
        trend.push({
          date: key,
          calls: hit?.calls || 0,
          tokens: hit?.tokens || 0,
          cost: money(hit?.cost),
        });
      }

      res.json({ days, trend });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/ai-usage/distribution?by=model|scene&days=N
 * 费用分布，按费用倒序；label 优先取价目表别名 / 场景中文名
 */
router.get(
  '/distribution',
  requireAuth,
  requireAdmin,
  [
    query('by').optional().isIn(['model', 'scene']),
    query('days').optional().isInt({ min: 1, max: MAX_DAYS }).toInt(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const by = req.query.by === 'scene' ? 'scene' : 'model';
      const days = parseDays(req.query.days);
      const start = rangeStart(days);

      const rows = await AiUsageLog.aggregate([
        { $match: { createdAt: { $gte: start } } },
        {
          $group: {
            _id: `$${by}`,
            calls: { $sum: 1 },
            tokens: { $sum: '$totalTokens' },
            cost: { $sum: '$cost' },
          },
        },
        { $sort: { cost: -1 } },
      ]);

      const items = rows.map((r) => {
        const name = r._id || '未知';
        return {
          name,
          label: by === 'scene' ? SCENE_LABELS[name] || name : getPricing(name)?.label || name,
          calls: r.calls || 0,
          tokens: r.tokens || 0,
          cost: money(r.cost),
        };
      });

      res.json({ by, days, items });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/ai-usage/list
 * 明细分页 + 筛选（场景 / 模型 / 状态 / 关键词 / 时间范围）
 */
router.get(
  '/list',
  requireAuth,
  requireAdmin,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('scene').optional().isIn(['article', 'chat', 'image']),
    query('model').optional().isString().trim(),
    query('success').optional().isIn(['true', 'false']),
    query('keyword').optional().isString().trim(),
    query('startTime').optional().isISO8601().toDate(),
    query('endTime').optional().isISO8601().toDate(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const page = req.query.page ?? 1;
      const pageSize = req.query.pageSize ?? 10;

      const filter = {};
      if (req.query.scene) filter.scene = req.query.scene;
      if (req.query.model) filter.model = req.query.model;
      if (req.query.success) filter.success = req.query.success === 'true';

      if (req.query.startTime || req.query.endTime) {
        filter.createdAt = {};
        if (req.query.startTime) filter.createdAt.$gte = req.query.startTime;
        if (req.query.endTime) filter.createdAt.$lte = req.query.endTime;
      }

      const keyword = req.query.keyword?.trim();
      if (keyword) {
        const regex = { $regex: keyword, $options: 'i' };
        filter.$or = [
          { model: regex },
          { 'user.username': regex },
          { sessionId: regex },
          { errorMessage: regex },
        ];
      }

      const [list, total] = await Promise.all([
        AiUsageLog.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .lean(),
        AiUsageLog.countDocuments(filter),
      ]);

      res.json({
        list: list.map((item) => ({
          _id: item._id,
          scene: item.scene,
          model: item.model,
          unit: item.unit,
          promptTokens: item.promptTokens,
          completionTokens: item.completionTokens,
          totalTokens: item.totalTokens,
          units: item.units,
          cost: money(item.cost),
          estimated: item.estimated,
          unknownModel: item.unknownModel,
          user: item.user,
          sessionId: item.sessionId,
          success: item.success,
          statusCode: item.statusCode,
          errorMessage: item.errorMessage,
          durationMs: item.durationMs,
          createdAt: item.createdAt,
        })),
        total,
        page,
        pageSize,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/ai-usage/pricing
 * 价目表 + 场景字典，供页面展示与成本计算器取初值
 */
router.get('/pricing', requireAuth, requireAdmin, (req, res) => {
  res.json({
    scenes: Object.entries(SCENE_LABELS).map(([value, label]) => ({ value, label })),
    items: listPricing(),
  });
});

export default router;
