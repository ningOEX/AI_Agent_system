import mongoose from 'mongoose';

/**
 * 每个用户独立的分类。同名分类在不同用户下可以并存（compound unique on userId + nameLower）。
 * useCount 只统计该用户自己博客里的使用次数。
 */
const categorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
      set: (v) => (typeof v === 'string' ? v.trim() : v),
    },
    nameLower: {
      type: String,
    },
    color: {
      type: String,
      default: '',
      maxlength: 20,
    },
    useCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

categorySchema.pre('save', function preSave() {
  if (this.name) this.nameLower = this.name.toLowerCase().trim();
});

// compound unique: 同一用户下 nameLower 唯一；不同用户允许同名
categorySchema.index({ userId: 1, nameLower: 1 }, { unique: true });

export default mongoose.model('Category', categorySchema);
