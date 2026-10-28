import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema(
  {
    // 提交人
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    username: {
      type: String,
      default: '',
    },
    // 问题类型：bug 功能异常 / feature 功能建议 / experience 体验问题 / content 内容问题 / other 其他
    type: {
      type: String,
      enum: ['bug', 'feature', 'experience', 'content', 'other'],
      default: 'other',
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    // 处理状态：pending 待处理 / processing 处理中 / resolved 已解决
    status: {
      type: String,
      enum: ['pending', 'processing', 'resolved'],
      default: 'pending',
      index: true,
    },
    // 管理员回复（处理结果）
    reply: {
      type: String,
      default: '',
      trim: true,
    },
    repliedBy: {
      type: String,
      default: '',
    },
    repliedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

feedbackSchema.index({ userId: 1, createdAt: -1 });
feedbackSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Feedback', feedbackSchema);
