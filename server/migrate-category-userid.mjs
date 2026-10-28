/**
 * 一次性迁移：把所有没有 userId 的 Category / Tag 文档分配给 admin 用户。
 * 迁移完删除本脚本即可。
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/login_demo';

async function run() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  const admin = await db.collection('users').findOne({ username: 'admin' });
  if (!admin) throw new Error('找不到 admin 用户');
  const adminId = admin._id;

  // 已有 compound unique { userId, nameLower } 的索引吗？
  const catIndexes = await db.collection('categories').indexInformation();
  const tagIndexes = await db.collection('tags').indexInformation();
  console.log('categories indexes:', catIndexes);
  console.log('tags indexes:', tagIndexes);

  // 先把孤儿文档分配给 admin，避免创建 compound unique 索引时冲突
  const catRes = await db
    .collection('categories')
    .updateMany({ userId: { $exists: false } }, { $set: { userId: adminId } });
  const tagRes = await db
    .collection('tags')
    .updateMany({ userId: { $exists: false } }, { $set: { userId: adminId } });
  console.log(`分类迁移: matched=${catRes.matchedCount} modified=${catRes.modifiedCount}`);
  console.log(`标签迁移: matched=${tagRes.matchedCount} modified=${tagRes.modifiedCount}`);

  // 删除旧的 nameLower 唯一索引（如果存在）
  try {
    await db.collection('categories').dropIndex('nameLower_1');
  } catch (_) { /* 不存在就忽略 */ }
  try {
    await db.collection('tags').dropIndex('nameLower_1');
  } catch (_) { /* 不存在就忽略 */ }

  await mongoose.disconnect();
  console.log('✅ 迁移完成');
}

run().catch((err) => {
  console.error('迁移失败:', err);
  process.exit(1);
});
