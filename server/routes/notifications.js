import { Router } from 'express';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ================================================================
//                     通知 / 公告
//
// 路由顺序重要：**所有静态路径必须在参数路由之前**，否则 /unread-count
// 会被 /:id 捕获、/read-all 会被 /:id/read 捕获。
// ================================================================

// ------- 列表 / 未读数（无参数） -------

/** GET /api/notifications — 全员读列表，每条附加 isRead */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));
    const skip = (page - 1) * pageSize;
    const userId = req.user.id;

    const [list, total] = await Promise.all([
      Notification.find().sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
      Notification.countDocuments(),
    ]);

    const enriched = list.map((n) => ({
      ...n,
      isRead: n.readBy?.some((r) => String(r.userId) === String(userId)) ?? false,
      readBy: undefined,
    }));

    res.json({ list: enriched, total, page, pageSize });
  } catch (err) { next(err); }
});

/** GET /api/notifications/unread-count — 当前用户未读数 */
router.get('/unread-count', requireAuth, async (req, res, next) => {
  try {
    const count = await Notification.countDocuments({ 'readBy.userId': { $ne: req.user.id } });
    res.json({ count });
  } catch (err) { next(err); }
});

/** PUT /api/notifications/read-all — 当前用户全部已读 */
router.put('/read-all', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const { modifiedCount } = await Notification.updateMany(
      { 'readBy.userId': { $ne: userId } },
      { $addToSet: { readBy: { userId, readAt: now } } },
    );
    res.json({ message: '已全部标记为已读', count: modifiedCount });
  } catch (err) { next(err); }
});

/** POST /api/notifications — 仅 admin 发布 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: '仅管理员可以发布通知' });
    const { title, content } = req.body || {};
    if (!title || !String(title).trim()) return res.status(422).json({ message: '标题不能为空' });
    if (!content || !String(content).trim()) return res.status(422).json({ message: '内容不能为空' });
    if (String(title).length > 200) return res.status(422).json({ message: '标题不能超过 200 字符' });
    if (String(content).length > 5000) return res.status(422).json({ message: '内容不能超过 5000 字符' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ message: '用户不存在' });

    const note = await Notification.create({
      title: String(title).trim(),
      content: String(content).trim(),
      publisherId: user._id,
      publisherName: user.username,
      readBy: [],
    });
    res.status(201).json(note);
  } catch (err) { next(err); }
});

// ------- 单条操作（带 :id 参数） -------
// 重要：**/:id/read 这种子路由必须在 /:id 之前注册**，
// 否则 Express 会把 /xxx/read 里的 xxx/read 当作 :id 参数吃掉。

/** PUT /api/notifications/:id/read — 当前用户标记单条已读（幂等） */
router.put('/:id/read', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    // 用 $addToSet 原子去重——之前 ObjectId/String 比较 bug 导致重复写入
    const { matchedCount, modifiedCount } = await Notification.updateOne(
      { _id: req.params.id, 'readBy.userId': { $ne: userId } },
      { $addToSet: { readBy: { userId, readAt: now } } },
    );
    if (matchedCount === 0) {
      // 要么通知不存在，要么已经标记过了
      const note = await Notification.findById(req.params.id);
      if (!note) return res.status(404).json({ message: '通知不存在' });
      return res.json({ message: '已标记为已读（重复请求，已忽略）' });
    }
    res.json({ message: '已标记为已读', isNew: modifiedCount > 0 });
  } catch (err) { next(err); }
});

/** GET /api/notifications/:id */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const note = await Notification.findById(req.params.id).lean();
    if (!note) return res.status(404).json({ message: '通知不存在' });
    const userId = req.user.id;
    note.isRead = note.readBy?.some((r) => String(r.userId) === String(userId)) ?? false;
    note.readBy = undefined;
    res.json(note);
  } catch (err) { next(err); }
});

/** PUT /api/notifications/:id — 仅 admin 编辑 */
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: '仅管理员可以编辑通知' });
    const { title, content } = req.body || {};
    const updates = {};
    if (title !== undefined) {
      const t = String(title).trim();
      if (!t) return res.status(422).json({ message: '标题不能为空' });
      if (t.length > 200) return res.status(422).json({ message: '标题不能超过 200 字符' });
      updates.title = t;
    }
    if (content !== undefined) {
      const c = String(content).trim();
      if (!c) return res.status(422).json({ message: '内容不能为空' });
      if (c.length > 5000) return res.status(422).json({ message: '内容不能超过 5000 字符' });
      updates.content = c;
    }
    if (Object.keys(updates).length === 0) return res.status(422).json({ message: '没有需要更新的字段' });

    const note = await Notification.findByIdAndUpdate(
      req.params.id, { $set: updates }, { new: true, runValidators: true },
    ).lean();
    if (!note) return res.status(404).json({ message: '通知不存在' });
    res.json(note);
  } catch (err) { next(err); }
});

/** DELETE /api/notifications/:id — 仅 admin 删 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: '仅管理员可以删除通知' });
    const note = await Notification.findByIdAndDelete(req.params.id);
    if (!note) return res.status(404).json({ message: '通知不存在' });
    res.json({ message: '通知已删除' });
  } catch (err) { next(err); }
});

export default router;
