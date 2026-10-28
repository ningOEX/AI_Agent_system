import mongoose from 'mongoose';

/**
 * 客服会话历史消息归档集合。
 * 当 ChatSession.messages 超过阈值时，最早的消息被移出并归档到此处，
 * 避免单文档无限膨胀逼近 MongoDB 16MB 限制，同时保留完整历史供后台查阅。
 */
const chatMessageArchiveSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true },
    messages: [
      {
        role: { type: String, enum: ['user', 'assistant'], required: true },
        content: { type: String, required: true },
        source: {
          type: String,
          enum: ['option', 'faq', 'ai', 'fallback', 'handoff'],
          default: 'ai',
        },
        faqId: { type: mongoose.Schema.Types.ObjectId, ref: 'Faq' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    archivedAt: { type: Date, default: Date.now, index: { expires: '180d' } }, // 归档保留 180 天后自动清理
  },
  { timestamps: true },
);

export default mongoose.models.ChatMessageArchive ||
  mongoose.model('ChatMessageArchive', chatMessageArchiveSchema);
