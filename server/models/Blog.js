import mongoose from 'mongoose';

const blogSchema = new mongoose.Schema(
  {
    // 所有者：一对一隔离——普通用户只能看到/改自己的博客，admin 能看所有
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, '标题不能为空'],
      trim: true,
      maxlength: [200, '标题不能超过 200 字符'],
      index: true,
    },
    category: {
      type: String,
      required: [true, '分类不能为空'],
      trim: true,
      maxlength: 50,
      index: true,
    },
    summary: {
      type: String,
      required: [true, '摘要不能为空'],
      maxlength: 500,
    },
    content: {
      type: String,
      required: [true, '详情内容不能为空'],
    },
    tags: {
      type: [String],
      default: [],
    },
    coverImage: {
      type: String,
      default: '',
    },
    // 发布状态：draft 草稿 / scheduled 定时 / published 已发布
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'published'],
      default: 'draft',
      index: true,
    },
    // 定时发布时间（status=scheduled 时生效）
    scheduledAt: {
      type: Date,
      default: null,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    author: {
      type: String,
      default: '',
    },
    // 内容声明：original 原创内容 / ai AI 生成内容
    contentType: {
      type: String,
      enum: ['original', 'ai'],
      default: 'original',
      index: true,
    },
    // 浏览量（前台展示用，每次 GET /api/public/blogs/:id 自增）
    views: {
      type: Number,
      default: 0,
    },
    // 精选标记：true = 首页头条展示
    featured: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true },
);

// 定时自动发布：每次 save 时检查 scheduledAt 是否已到
blogSchema.pre('save', function preSave(next) {
  if (this.status === 'scheduled' && this.scheduledAt && this.scheduledAt <= new Date()) {
    this.status = 'published';
    this.publishedAt = this.publishedAt || this.scheduledAt;
  }
  if (this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  next();
});

export default mongoose.model('Blog', blogSchema);
