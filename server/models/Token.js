import mongoose from 'mongoose';

const tokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true, // 防止重复写入同一个 JWT
    },
    userAgent: {
      type: String,
      default: '',
    },
    // JWT 过期时间：TTL 索引，到期后 MongoDB 自动清理该记录
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

export default mongoose.model('Token', tokenSchema);
