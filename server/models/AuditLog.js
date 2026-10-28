import mongoose from 'mongoose';

/**
 * 操作留痕（审计日志）
 *
 * 由全局中间件 middleware/auditTrail.js 自动写入：所有 POST/PUT/PATCH/DELETE
 * 都会落库一条记录，保留变更前（before）/变更后（after）的完整快照，
 * 支持后续按对象还原（恢复删除、回滚修改、撤销新增）。
 */
const auditLogSchema = new mongoose.Schema(
  {
    // 动作类型：新增 / 修改 / 删除
    action: {
      type: String,
      enum: ['create', 'update', 'delete'],
      required: true,
    },
    // 模块标识（blog / category / tag / comment / notification / feedback / user ...）
    module: {
      type: String,
      required: true,
    },
    // 模块中文名，便于列表直接展示
    moduleLabel: {
      type: String,
      default: '',
    },
    method: { type: String, default: '' },
    path: { type: String, default: '' },
    // 目标文档 _id（批量操作时存第一个，完整列表见 targetIds）
    targetId: { type: String, default: '' },
    targetIds: { type: [String], default: [] },
    // 目标可读名称（文章标题 / 分类名 / 用户名 ...），便于关键字检索
    targetLabel: { type: String, default: '' },
    // 变更前快照（update/delete 有值；批量操作时是数组）
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    // 变更后快照（create/update 有值；批量操作时是数组）
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    // 操作人
    operator: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      username: { type: String, default: '' },
      role: { type: String, default: '' },
    },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    statusCode: { type: Number, default: 0 },
    success: { type: Boolean, default: true },
    errorMessage: { type: String, default: '' },
    // 是否已被还原（还原后不可重复还原）
    restored: { type: Boolean, default: false },
    restoredAt: { type: Date, default: null },
    restoredBy: { type: String, default: '' },
  },
  { timestamps: true },
);

// 列表默认按时间倒序
auditLogSchema.index({ createdAt: -1 });
// 按模块 + 动作筛选
auditLogSchema.index({ module: 1, action: 1, createdAt: -1 });
// 普通用户只能看自己的记录
auditLogSchema.index({ 'operator.userId': 1, createdAt: -1 });
// 按目标对象回溯某条数据的全部变更历史
auditLogSchema.index({ targetId: 1, createdAt: -1 });

export default mongoose.model('AuditLog', auditLogSchema);
