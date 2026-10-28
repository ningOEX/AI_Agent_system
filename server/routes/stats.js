import express from 'express';
import mongoose from 'mongoose';

import Blog from '../models/Blog.js';
import ChatSession from '../models/ChatSession.js';
import Comment from '../models/Comment.js';
import Faq from '../models/Faq.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: '仅管理员可查看' });
  }
  next();
}

// 与评论状态保持一致：pending / approved / rejected
const PENDING = 'pending';
const APPROVED = 'approved';

/** 最近 N 天按天聚合某集合的新增数量 */
async function dailyCount(Model, days, extraMatch = {}) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const rows = await Model.aggregate([
    { $match: { ...extraMatch, createdAt: { $gte: start } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: '+08:00' } },
        count: { $sum: 1 },
      },
    },
  ]);

  const map = new Map(rows.map((r) => [r._id, r.count]));
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ date: key, count: map.get(key) || 0 });
  }
  return out;
}

/**
 * GET /api/stats/dashboard
 * 后台工作台 / 分析页共用的一份真实统计
 */
router.get('/dashboard', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      blogTotal,
      blogPublished,
      viewAgg,
      commentTotal,
      commentPending,
      commentApproved,
      userTotal,
      sessionTotal,
      sessionUnhandled,
      faqTotal,
      notificationTotal,
      todayBlogs,
      todayComments,
      todaySessions,
      trendBlogs,
      trendComments,
      trendSessions,
      categoryAgg,
      topBlogs,
      recentComments,
      recentSessions,
      recentBlogs,
    ] = await Promise.all([
      Blog.countDocuments(),
      Blog.countDocuments({ status: 'published' }),
      Blog.aggregate([{ $group: { _id: null, views: { $sum: '$views' } } }]),
      Comment.countDocuments(),
      Comment.countDocuments({ status: PENDING }),
      Comment.countDocuments({ status: APPROVED }),
      User.countDocuments(),
      ChatSession.countDocuments(),
      ChatSession.countDocuments({ unhandled: true }),
      Faq.countDocuments({ enabled: true }),
      Notification.countDocuments(),
      Blog.countDocuments({ createdAt: { $gte: todayStart } }),
      Comment.countDocuments({ createdAt: { $gte: todayStart } }),
      ChatSession.countDocuments({ createdAt: { $gte: todayStart } }),
      dailyCount(Blog, 14),
      dailyCount(Comment, 14),
      dailyCount(ChatSession, 14),
      Blog.aggregate([
        { $group: { _id: '$category', value: { $sum: 1 } } },
        { $sort: { value: -1 } },
      ]),
      Blog.find()
        .sort({ views: -1, createdAt: -1 })
        .limit(6)
        .select('title views category featured status publishedAt')
        .lean(),
      Comment.find()
        .sort({ createdAt: -1 })
        .limit(6)
        .populate('blogId', 'title')
        .select('nickname content status createdAt blogId')
        .lean(),
      ChatSession.find()
        .sort({ lastMessageAt: -1 })
        .limit(6)
        .select('sessionId messages unhandled lastMessageAt')
        .lean(),
      Blog.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('title category status createdAt views')
        .lean(),
    ]);

    const trend = trendBlogs.map((item, index) => ({
      date: item.date,
      blogs: item.count,
      comments: trendComments[index]?.count || 0,
      chats: trendSessions[index]?.count || 0,
    }));

    res.json({
      overview: {
        blogs: blogTotal,
        publishedBlogs: blogPublished,
        views: viewAgg[0]?.views || 0,
        comments: commentTotal,
        pendingComments: commentPending,
        approvedComments: commentApproved,
        users: userTotal,
        chats: sessionTotal,
        pendingChats: sessionUnhandled,
        faqs: faqTotal,
        notifications: notificationTotal,
      },
      today: {
        blogs: todayBlogs,
        comments: todayComments,
        chats: todaySessions,
      },
      trend,
      categories: categoryAgg.map((c) => ({ name: c._id || '未分类', value: c.value })),
      topBlogs: topBlogs.map((b) => ({
        _id: b._id,
        title: b.title,
        views: b.views || 0,
        category: b.category,
        featured: !!b.featured,
        status: b.status,
        publishedAt: b.publishedAt,
      })),
      recentComments: recentComments.map((c) => ({
        _id: c._id,
        nickname: c.nickname,
        content: c.content,
        status: c.status,
        createdAt: c.createdAt,
        blogTitle: c.blogId?.title || '（文章已删除）',
      })),
      recentSessions: recentSessions.map((s) => ({
        sessionId: s.sessionId,
        unhandled: s.unhandled,
        messageCount: s.messages.length,
        lastMessage: s.messages.length ? s.messages[s.messages.length - 1].content : '',
        lastMessageAt: s.lastMessageAt,
      })),
      recentBlogs: recentBlogs.map((b) => ({
        _id: b._id,
        title: b.title,
        category: b.category,
        status: b.status,
        views: b.views || 0,
        createdAt: b.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/stats/personal
 * 普通用户专属的个人创作分析页数据：只统计自己名下的文章与这些文章收到的评论
 */
router.get('/personal', requireAuth, async (req, res, next) => {
  try {
    const userId = String(req.user.id);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // 先取出我的文章 ID，评论统计全部限定在这些文章下
    const myBlogs = await Blog.find({ userId: userObjectId }).select('_id').lean();
    const blogIds = myBlogs.map((b) => b._id);
    const commentMatch = { blogId: { $in: blogIds } };

    const [
      blogTotal,
      blogPublished,
      blogDraft,
      blogScheduled,
      viewAgg,
      commentTotal,
      commentPending,
      commentApproved,
      todayBlogs,
      todayComments,
      trendBlogs,
      trendComments,
      categoryAgg,
      topBlogs,
      recentComments,
      recentBlogs,
    ] = await Promise.all([
      Blog.countDocuments({ userId: userObjectId }),
      Blog.countDocuments({ userId: userObjectId, status: 'published' }),
      Blog.countDocuments({ userId: userObjectId, status: 'draft' }),
      Blog.countDocuments({ userId: userObjectId, status: 'scheduled' }),
      Blog.aggregate([
        { $match: { userId: userObjectId } },
        { $group: { _id: null, views: { $sum: '$views' } } },
      ]),
      blogIds.length ? Comment.countDocuments(commentMatch) : 0,
      blogIds.length ? Comment.countDocuments({ ...commentMatch, status: PENDING }) : 0,
      blogIds.length ? Comment.countDocuments({ ...commentMatch, status: APPROVED }) : 0,
      Blog.countDocuments({ userId: userObjectId, createdAt: { $gte: todayStart } }),
      blogIds.length ? Comment.countDocuments({ ...commentMatch, createdAt: { $gte: todayStart } }) : 0,
      dailyCount(Blog, 14, { userId: userObjectId }),
      blogIds.length ? dailyCount(Comment, 14, commentMatch) : [],
      Blog.aggregate([
        { $match: { userId: userObjectId } },
        { $group: { _id: '$category', value: { $sum: 1 } } },
        { $sort: { value: -1 } },
      ]),
      Blog.find({ userId: userObjectId })
        .sort({ views: -1, createdAt: -1 })
        .limit(6)
        .select('title views category featured status publishedAt')
        .lean(),
      blogIds.length
        ? Comment.find(commentMatch)
            .sort({ createdAt: -1 })
            .limit(6)
            .populate('blogId', 'title')
            .select('nickname content status createdAt blogId')
            .lean()
        : [],
      Blog.find({ userId: userObjectId })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('title category status createdAt views')
        .lean(),
    ]);

    const trend = trendBlogs.map((item, index) => ({
      date: item.date,
      blogs: item.count,
      comments: trendComments[index]?.count || 0,
    }));

    res.json({
      overview: {
        blogs: blogTotal,
        publishedBlogs: blogPublished,
        drafts: blogDraft,
        scheduled: blogScheduled,
        views: viewAgg[0]?.views || 0,
        comments: commentTotal,
        pendingComments: commentPending,
        approvedComments: commentApproved,
      },
      today: {
        blogs: todayBlogs,
        comments: todayComments,
      },
      trend,
      categories: categoryAgg.map((c) => ({ name: c._id || '未分类', value: c.value })),
      topBlogs: topBlogs.map((b) => ({
        _id: b._id,
        title: b.title,
        views: b.views || 0,
        category: b.category,
        featured: !!b.featured,
        status: b.status,
        publishedAt: b.publishedAt,
      })),
      recentComments: recentComments.map((c) => ({
        _id: c._id,
        nickname: c.nickname,
        content: c.content,
        status: c.status,
        createdAt: c.createdAt,
        blogTitle: c.blogId?.title || '（文章已删除）',
      })),
      recentBlogs: recentBlogs.map((b) => ({
        _id: b._id,
        title: b.title,
        category: b.category,
        status: b.status,
        views: b.views || 0,
        createdAt: b.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
