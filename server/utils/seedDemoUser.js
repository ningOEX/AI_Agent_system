import bcrypt from 'bcryptjs';
import User from '../models/User.js';

/**
 * 确保两个预置账号存在，且角色字段正确：
 *   demo / 123456 → role: 'user'（普通测试用户，只能看分析页）
 *   admin / admin123 → role: 'admin'（管理员，可看所有模块）
 * 对已存在的账号用 findOneAndUpdate 补 role 字段（Mongo schema 新增字段后旧文档无此字段）。
 */
export async function seedDemoUser() {
  await ensureUser({
    username: 'demo',
    email: 'demo@example.com',
    password: '123456',
    role: 'user',
  });
  await ensureUser({
    username: 'admin',
    email: 'admin@example.com',
    password: 'admin123',
    role: 'admin',
  });
}

async function ensureUser({ username, email, password, role }) {
  const existing = await User.findOne({ username });
  if (existing) {
    if (existing.role !== role) {
      await User.updateOne({ _id: existing._id }, { $set: { role } });
      console.log(`[seed] 用户 ${username} 补 role=${role}`);
    }
    return false;
  }
  const hashed = await bcrypt.hash(password, 10);
  await User.create({ username, email, password: hashed, role });
  console.log(`[seed] 账号创建成功 -> 用户名: ${username} 密码: ${password} role: ${role}`);
  return true;
}
