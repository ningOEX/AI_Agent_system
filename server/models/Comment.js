import mongoose from 'mongoose';

const CommentSchema = new mongoose.Schema({
  blogId: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog', required: true, index: true },
  // 评论者：未登录用户可以用 nickname + email，登录用户走 userId
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  nickname: { type: String, trim: true, maxlength: 40, default: '' },
  email: { type: String, trim: true, default: '' },
  // 嵌套结构：parentId 直接父评论，rootId 整栋楼根评论（顶级自己是自己）
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },
  rootId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },
  // 被 @ 的用户或评论（可选）
  replyToUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  replyToNickname: { type: String, default: '' },
  // 正文
  content: { type: String, trim: true, required: true, maxlength: 1000 },
  // 审核状态：pending 待审 / approved 通过 / rejected 拒绝
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true,
  },
  ip: { type: String, default: '' },
}, { timestamps: true });

// 复合索引：查询某文章已通过的顶级评论
CommentSchema.index({ blogId: 1, rootId: 1, status: 1, createdAt: 1 });
CommentSchema.index({ blogId: 1, parentId: 1, status: 1 });

// 回复数虚拟属性
CommentSchema.virtual('replyCount', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'rootId',
  count: true,
  match: { status: 'approved' },
});

const Comment = mongoose.model('Comment', CommentSchema);
export default Comment;
