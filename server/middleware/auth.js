import jwt from 'jsonwebtoken';
import Token from '../models/Token.js';
import User from '../models/User.js';

/** JWT 校验中间件：保护需要登录才能访问的接口 */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: '未提供登录凭证，请先登录' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: '登录凭证无效或已过期，请重新登录' });
  }

  // 校验 token 是否仍在数据库有效（退出登录/被服务端注销的记录已被删除）
  const existed = await Token.exists({ token });
  if (!existed) {
    return res.status(401).json({ message: '登录状态已失效，请重新登录' });
  }

  // 查一次用户角色——所有受保护路由都需要知道 role 来判断权限（如 admin 例外）
  const user = await User.findById(payload.id);
  if (!user) {
    return res.status(401).json({ message: '用户不存在' });
  }

  req.user = { id: user._id, username: user.username, role: user.role };
  req.authToken = token;
  next();
}

/** 管理员校验中间件：必须挂在 requireAuth 之后（依赖 req.user 已填充） */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: '仅管理员可查看' });
  }
  next();
}
