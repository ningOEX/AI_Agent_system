import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true, // 存储 bcrypt 哈希值，绝不存明文
      select: false,  // 默认查询不返回密码字段
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    avatar: {
      type: String,
      default: '',
      trim: true,
    },
    // ---------- 安全绑定字段（可选，用户主动绑定后才有值） ----------
    // 密保手机：中国手机号，仅存数字，不存区号
    phone: {
      type: String,
      default: '',
      trim: true,
      match: [/^1[3-9]\d{9}$/, '手机号格式不正确'],
    },
    // 密保问题（选一个预置选项 + 用户自己的答案）
    secretQuestion: {
      type: String,
      default: '',
      trim: true,
      maxlength: 100,
    },
    secretAnswer: {
      type: String,
      default: '',
      trim: true,
      maxlength: 200,
    },
    // 备用邮箱（可不同于登录邮箱）
    backupEmail: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, '邮箱格式不正确'],
    },
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
