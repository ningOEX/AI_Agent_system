import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { seedDemoUser } from '../utils/seedDemoUser.js';

/** 种子脚本：node scripts/seed.js */
async function seed() {
  await connectDB();
  const created = await seedDemoUser();
  if (!created) {
    console.log('[seed] 测试账号已存在，无需重复创建');
  }
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('[seed] 失败:', err.message);
  process.exit(1);
});
