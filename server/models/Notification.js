import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, '通知标题不能为空'],
      trim: true,
      maxlength: [200, '标题不能超过 200 字符'],
      index: true,
    },
    content: {
      type: String,
      required: [true, '通知内容不能为空'],
      maxlength: [5000, '内容不能超过 5000 字符'],
    },
    publisherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    publisherName: {
      type: String,
      required: true,
      trim: true,
    },
    // 已读记录：每个用户独立，数组存对应用户 ObjectId + 时间戳
    readBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true },
);

// 列表常用排序：最新在前
notificationSchema.index({ createdAt: -1 });

// readBy.userId 单独建索引，方便查询"某用户读过哪些"
notificationSchema.index({ 'readBy.userId': 1 });

export default mongoose.model('Notification', notificationSchema);
