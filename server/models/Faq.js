import mongoose from 'mongoose';

const faqSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true, maxlength: 120 },
    answer: { type: String, required: true, trim: true, maxlength: 2000 },
    category: { type: String, default: '通用', trim: true },
    keywords: { type: [String], default: [] },
    // 回答后推荐的追问（存问题文本，前端点击后按文本再走一次问答）
    followUps: { type: [String], default: [] },
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
    hitCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

faqSchema.index({ enabled: 1, order: 1 });

export default mongoose.models.Faq || mongoose.model('Faq', faqSchema);
