import mongoose from 'mongoose';

/**
 * 接口调用埋点：每一次 HTTP 请求（含 GET）都记一条，用于接口监控与文档详情页。
 * 与 aiusagelogs / auditlogs 不同：
 * - auditlogs 只拦写操作 + 只拦业务路由
 * - EndpointCallLog 记录所有路由（含 GET /api/health / /api/public/*），是真正的全量观测
 */
const endpointCallLogSchema = new mongoose.Schema(
  {
    method: { type: String, uppercase: true, required: true },
    // 规范化后的路由键：用 catalog 匹配后得到的 ":param" 模板形式，如 "GET /api/blogs/:id"
    routeKey: { type: String, required: true, index: true },
    // 实际请求路径（不带 query）
    path: { type: String, required: true },
    statusCode: { type: Number, required: true },
    durationMs: { type: Number, required: true },
    success: { type: Boolean, default: true },
    // 调用者：解析 requireAuth 之后的 req.user；未登录为 null + 匿名
    user: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      username: { type: String, default: '' },
      role: { type: String, default: '' },
    },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    // 匹配 catalog 的 catalog.id，用于把聚合数据和文档详情页关联
    catalogId: { type: String, default: '' },
  },
  { timestamps: true },
);

// 明细倒序
endpointCallLogSchema.index({ createdAt: -1 });
// 按路由聚合（概览 / 分布）
endpointCallLogSchema.index({ routeKey: 1, createdAt: -1 });
// 失败请求快速筛选
endpointCallLogSchema.index({ success: 1, createdAt: -1 });
// 与 catalog 关联查询
endpointCallLogSchema.index({ catalogId: 1, createdAt: -1 });

// TTL 索引：30 天自动清理，与 auditlogs 的长期保留不同（观测类数据不需要永久留存）
endpointCallLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60, name: 'ttl_30d' },
);

export default mongoose.model('EndpointCallLog', endpointCallLogSchema);
