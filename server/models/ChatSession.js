import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    // 回答来源：预设选项 / FAQ 命中 / AI 生成 / 兜底 / 转人工 / 等待人工回复 / 管理员回复
    source: {
      type: String,
      enum: ['option', 'faq', 'ai', 'fallback', 'handoff', 'waiting', 'admin'],
      default: 'ai',
    },
    faqId: { type: mongoose.Schema.Types.ObjectId, ref: 'Faq' },
  },
  { timestamps: true },
);

const chatSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    messages: { type: [chatMessageSchema], default: [] },
    // 是否出现过 AI 答不出 / 用户要求转人工，供后台筛选
    unhandled: { type: Boolean, default: false },
    // 用户点击转人工后进入等待模式：后续消息只存库不触发 AI/FAQ 自动回复
    awaitingAgent: { type: Boolean, default: false },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// TTL 索引：90 天内无新消息的会话自动清理，避免匿名会话永久堆积
chatSessionSchema.index({ lastMessageAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.models.ChatSession ||
  mongoose.model('ChatSession', chatSessionSchema);
