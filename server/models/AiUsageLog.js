import mongoose from 'mongoose';

/**
 * 大模型调用埋点：每调用一次 DashScope 记一条，用于统计调用量与成本。
 * 不保存提问与回答正文，只记模型、场景、token 用量、费用与耗时。
 */
const aiUsageLogSchema = new mongoose.Schema(
  {
    // 调用场景：文章生成 / 智能客服 / 文生图
    scene: { type: String, enum: ['article', 'chat', 'image'], required: true },
    // 实际调用的模型名（如 qwen3.8-flash / qwen-plus / wan2.2-t2i-flash）
    model: { type: String, required: true },
    // 计量单位：token（按量计费）/ image（按张计费）
    unit: { type: String, enum: ['token', 'image'], default: 'token' },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    // 非 token 计量数量（图片张数），token 场景恒为 0
    units: { type: Number, default: 0 },
    // 单价快照：记录下单当刻的价目，后续调价不追溯改写历史费用
    pricing: {
      unit: { type: String, default: 'token' },
      inputPricePerK: { type: Number, default: 0 },
      outputPricePerK: { type: Number, default: 0 },
      pricePerImage: { type: Number, default: 0 },
    },
    // 费用（元，6 位小数）；失败的调用计 0
    cost: { type: Number, default: 0 },
    // usage 是否来自估算（上游未返回用量时按字符数折算）
    estimated: { type: Boolean, default: false },
    // 价目表未收录该模型，未计费
    unknownModel: { type: Boolean, default: false },
    // 调用者：后台取登录用户；前台客服免登录，为 null + 匿名访客，靠 sessionId 归属
    user: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      username: { type: String, default: '' },
      role: { type: String, default: '' },
    },
    sessionId: { type: String, default: '' },
    success: { type: Boolean, default: true },
    statusCode: { type: Number, default: 0 },
    errorMessage: { type: String, default: '' },
    durationMs: { type: Number, default: 0 },
    ip: { type: String, default: '' },
  },
  { timestamps: true },
);

// 明细倒序 + 趋势聚合的匹配起点
aiUsageLogSchema.index({ createdAt: -1 });
// 按模型 / 按场景分组与筛选
aiUsageLogSchema.index({ model: 1, createdAt: -1 });
aiUsageLogSchema.index({ scene: 1, createdAt: -1 });
// 明细按调用者筛选
aiUsageLogSchema.index({ 'user.userId': 1, createdAt: -1 });
// 客服匿名会话归属排查
aiUsageLogSchema.index({ sessionId: 1, createdAt: -1 });

export default mongoose.model('AiUsageLog', aiUsageLogSchema);
