import mongoose from 'mongoose';

/**
 * 每个用户独立的标签。同名标签在不同用户下可以并存（compound unique on userId + nameLower）。
 */
const tagSchema = new mongoose.Schema(
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
      maxlength: 30,
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

tagSchema.pre('save', function preSave() {
  if (this.name) this.nameLower = this.name.toLowerCase().trim();
});

tagSchema.index({ userId: 1, nameLower: 1 }, { unique: true });

export default mongoose.model('Tag', tagSchema);
