import express from 'express';
import { query, validationResult } from 'express-validator';

import EndpointCallLog from '../models/EndpointCallLog.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getCatalogById, getCatalogGroups, listCatalog } from '../config/apiCatalog.js';

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

function rangeStart(days) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

function parseDays(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.floor(n));
}

/**
 * GET /api/endpoint-monitor/overview
 * 近 N 天汇总：总调用、成功率、平均耗时、异常数、catalog 覆盖率
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
        EndpointCallLog.aggregate([
          { $match: { createdAt: { $gte: start } } },
          {
            $group: {
              _id: null,
              calls: { $sum: 1 },
              successCalls: { $sum: { $cond: ['$success', 1, 0] } },
              failedCalls: { $sum: { $cond: ['$success', 0, 1] } },
              error4xx: { $sum: { $cond: [{ $and: [{ $gte: ['$statusCode', 400] }, { $lt: ['$statusCode', 500] }] }, 1, 0] } },
              error5xx: { $sum: { $cond: [{ $gte: ['$statusCode', 500] }, 1, 0] } },
              avgMs: { $avg: '$durationMs' },
              maxMs: { $max: '$durationMs' },
              uniqueRoutes: { $addToSet: '$routeKey' },
              catalogCovered: {
                $sum: { $cond: [{ $ne: ['$catalogId', ''] }, 1, 0] },
              },
            },
          },
        ]),
        EndpointCallLog.aggregate([
          { $match: { createdAt: { $gte: todayStart } } },
          {
            $group: {
              _id: null,
              calls: { $sum: 1 },
              failedCalls: { $sum: { $cond: ['$success', 0, 1] } },
            },
          },
        ]),
      ]);

      const row = agg[0] || {};
      const calls = row.calls || 0;
      const successCalls = row.successCalls || 0;

      res.json({
        days,
        overview: {
          calls,
          successCalls,
          failedCalls: row.failedCalls || 0,
          successRate: calls ? Number(((successCalls / calls) * 100).toFixed(2)) : 0,
          error4xx: row.error4xx || 0,
          error5xx: row.error5xx || 0,
          avgMs: Math.round(row.avgMs || 0),
          maxMs: row.maxMs || 0,
          uniqueRoutes: row.uniqueRoutes ? row.uniqueRoutes.length : 0,
          catalogCovered: row.catalogCovered || 0,
          catalogCoverage: calls ? Number((((row.catalogCovered || 0) / calls) * 100).toFixed(2)) : 0,
        },
        today: {
          calls: todayAgg[0]?.calls || 0,
          failedCalls: todayAgg[0]?.failedCalls || 0,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/endpoint-monitor/trend
 * 按天调用量 / 耗时 / 错误数趋势，后端补零
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

      const rows = await EndpointCallLog.aggregate([
        { $match: { createdAt: { $gte: start } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: '+08:00' },
            },
            calls: { $sum: 1 },
            failedCalls: { $sum: { $cond: ['$success', 0, 1] } },
            avgMs: { $avg: '$durationMs' },
            maxMs: { $max: '$durationMs' },
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
          failedCalls: hit?.failedCalls || 0,
          avgMs: Math.round(hit?.avgMs || 0),
          maxMs: hit?.maxMs || 0,
        });
      }
      res.json({ days, trend });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/endpoint-monitor/distribution?by=route|group|status&days=N
 * 按路由键 / 分组 / 状态码段聚合
 */
router.get(
  '/distribution',
  requireAuth,
  requireAdmin,
  [
    query('by').optional().isIn(['route', 'group', 'status']),
    query('days').optional().isInt({ min: 1, max: MAX_DAYS }).toInt(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const by = req.query.by === 'group' || req.query.by === 'status' ? req.query.by : 'route';
      const days = parseDays(req.query.days);
      const start = rangeStart(days);

      let groupId;
      if (by === 'status') {
        groupId = {
          $switch: {
            branches: [
              { case: { $lt: ['$statusCode', 300] }, then: '2xx' },
              { case: { $lt: ['$statusCode', 400] }, then: '3xx' },
              { case: { $lt: ['$statusCode', 500] }, then: '4xx' },
            ],
            default: '5xx',
          },
        };
      } else if (by === 'group') {
        groupId = '$catalogId';
      } else {
        groupId = '$routeKey';
      }

      const rows = await EndpointCallLog.aggregate([
        { $match: { createdAt: { $gte: start } } },
        {
          $group: {
            _id: groupId,
            calls: { $sum: 1 },
            successCalls: { $sum: { $cond: ['$success', 1, 0] } },
            avgMs: { $avg: '$durationMs' },
            totalMs: { $sum: '$durationMs' },
          },
        },
        { $sort: { calls: -1 } },
      ]);

      let items = [];
      if (by === 'group') {
        const allCatalog = listCatalog();
        const idToGroup = new Map(allCatalog.map((c) => [c.id, c.group]));
        const counters = new Map();
        for (const row of rows) {
          const g = idToGroup.get(row._id || '') || 'other';
          const cur = counters.get(g) || { name: g, calls: 0, successCalls: 0, totalMs: 0 };
          cur.calls += row.calls;
          cur.successCalls += row.successCalls;
          cur.totalMs += row.totalMs;
          counters.set(g, cur);
        }
        items = [...counters.values()]
          .map((it) => ({
            name: it.name,
            calls: it.calls,
            successRate: it.calls ? Number(((it.successCalls / it.calls) * 100).toFixed(2)) : 0,
            avgMs: Math.round(it.totalMs / (it.calls || 1)),
          }))
          .sort((a, b) => b.calls - a.calls);
      } else if (by === 'status') {
        items = rows.map((r) => ({
          name: r._id || 'unknown',
          calls: r.calls,
          successRate: r.calls ? Number(((r.successCalls / r.calls) * 100).toFixed(2)) : 0,
          avgMs: Math.round(r.avgMs || 0),
        }));
      } else {
        items = rows.map((r) => {
          const catalog = getCatalogById(r._id);
          return {
            routeKey: r._id,
            name: catalog?.name || r._id,
            group: catalog?.group || 'other',
            method: catalog?.method || r._id.split(' ')[0],
            path: catalog?.path || r._id.slice(r._id.indexOf(' ') + 1),
            auth: catalog?.auth || '',
            description: catalog?.description || '',
            calls: r.calls,
            successCalls: r.successCalls,
            successRate: r.calls ? Number(((r.successCalls / r.calls) * 100).toFixed(2)) : 0,
            avgMs: Math.round(r.avgMs || 0),
          };
        });
      }

      res.json({ by, days, items });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/endpoint-monitor/list
 * 单条请求级明细：分页 + 筛选（routeKey / status / success / keyword / 时间范围）
 */
router.get(
  '/list',
  requireAuth,
  requireAdmin,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('routeKey').optional().isString().trim(),
    query('statusCode').optional().isInt({ min: 100, max: 599 }).toInt(),
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
      if (req.query.routeKey) filter.routeKey = req.query.routeKey;
      if (req.query.statusCode) filter.statusCode = req.query.statusCode;
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
          { path: regex },
          { method: regex },
          { routeKey: regex },
          { 'user.username': regex },
        ];
      }

      const [list, total] = await Promise.all([
        EndpointCallLog.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .lean(),
        EndpointCallLog.countDocuments(filter),
      ]);

      res.json({ list, total, page, pageSize });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/endpoint-monitor/route/:routeKey
 * 单个路由的聚合 stats + catalog 文档 + 最近 N 条调用样例
 * 前端详情页核心数据
 */
router.get(
  '/route/*',
  requireAuth,
  requireAdmin,
  [
    query('days').optional().isInt({ min: 1, max: MAX_DAYS }).toInt(),
  ],
  validate,
  async (req, res, next) => {
    try {
      // Express 4 通配符 /* 匹配剩余全部路径，值在 req.params[0] 中
      // URL 里的空格会被浏览器编成 %20 但用户可能直接 GET/api/public/blogs 访问——
      // 这里把 "GET/api/public/blogs" 归一化成 "GET /api/public/blogs"，与 catalog.id 对齐
      let raw = req.params[0] || '';
      if (!raw) return res.status(422).json({ message: 'routeKey 不能为空' });
      raw = decodeURIComponent(raw);
      if (!raw.includes(' ')) {
        // 把 "GET/api/public/blogs" 修正成 "GET /api/public/blogs"，与 catalog.id 对齐
        raw = raw.replace(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\//, '$1 /');
      }
      const routeKey = raw.trim();
      const days = parseDays(req.query.days);
      const start = rangeStart(days);

      const catalog = getCatalogById(routeKey);

      const [agg, recent] = await Promise.all([
        EndpointCallLog.aggregate([
          { $match: { routeKey, createdAt: { $gte: start } } },
          {
            $group: {
              _id: null,
              calls: { $sum: 1 },
              successCalls: { $sum: { $cond: ['$success', 1, 0] } },
              failedCalls: { $sum: { $cond: ['$success', 0, 1] } },
              error5xx: { $sum: { $cond: [{ $gte: ['$statusCode', 500] }, 1, 0] } },
              error4xx: { $sum: { $cond: [{ $and: [{ $gte: ['$statusCode', 400] }, { $lt: ['$statusCode', 500] }] }, 1, 0] } },
              avgMs: { $avg: '$durationMs' },
              minMs: { $min: '$durationMs' },
              maxMs: { $max: '$durationMs' },
            },
          },
        ]),
        EndpointCallLog.find({ routeKey })
          .sort({ createdAt: -1 })
          .limit(20)
          .lean(),
      ]);

      const row = agg[0];
      const stats = row
        ? {
            calls: row.calls,
            successCalls: row.successCalls,
            failedCalls: row.failedCalls,
            successRate: row.calls ? Number(((row.successCalls / row.calls) * 100).toFixed(2)) : 0,
            avgMs: Math.round(row.avgMs || 0),
            minMs: row.minMs || 0,
            maxMs: row.maxMs || 0,
            error4xx: row.error4xx || 0,
            error5xx: row.error5xx || 0,
          }
        : null;

      res.json({
        routeKey,
        days,
        catalog: catalog
          ? {
              method: catalog.method,
              path: catalog.path,
              group: catalog.group,
              name: catalog.name,
              description: catalog.description,
              auth: catalog.auth,
              params: catalog.params,
              response: catalog.response,
              notes: catalog.notes,
            }
          : null,
        stats,
        recent: recent.map((r) => ({
          _id: r._id,
          method: r.method,
          path: r.path,
          statusCode: r.statusCode,
          success: r.success,
          durationMs: r.durationMs,
          user: r.user,
          ip: r.ip,
          createdAt: r.createdAt,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/endpoint-monitor/catalog
 * 完整 catalog + group 字典，供前端页面初始化
 */
router.get('/catalog', requireAuth, requireAdmin, (req, res) => {
  res.json({
    groups: getCatalogGroups(),
    items: listCatalog(),
  });
});

export default router;
