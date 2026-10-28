import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/db.js';
import { seedDemoUser } from './utils/seedDemoUser.js';
import { seedFaq } from './utils/seedFaq.js';
import authRoutes from './routes/auth.js';
import blogRoutes from './routes/blogs.js';
import uploadRoutes from './routes/upload.js';
import aiRoutes from './routes/ai.js';
import notificationRoutes from './routes/notifications.js';
import publicRoutes from './routes/public.js';
import commentRoutes from './routes/comments.js';
import chatRoutes from './routes/chat.js';
import statsRoutes from './routes/stats.js';
import feedbackRoutes from './routes/feedback.js';
import categoryRoutes from './routes/categories.js';
import tagRoutes from './routes/tags.js';
import auditLogRoutes from './routes/auditLogs.js';
import aiUsageRoutes from './routes/aiUsage.js';
import endpointMonitorRoutes from './routes/endpointMonitor.js';
import auditTrail from './middleware/auditTrail.js';
import endpointMonitor from './middleware/endpointMonitor.js';
import path from 'path';

import Blog from './models/Blog.js';

const app = express();

// 触发 --watch 热重载以重新加载 .env（CORS 多域名配置）

// 全局中间件
// CLIENT_ORIGIN 支持逗号分隔的多域名（如 http://localhost:5666,http://localhost:3000），
// cors 库对字符串做精确匹配，必须拆成数组才能让每个来源都通过校验。
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// 接口调用监控：拦截所有 HTTP 请求（含 GET），观测面覆盖全站；
// 必须在 express.json() 之后、业务路由之前；在 auditTrail 之前
app.use(endpointMonitor);
// 操作留痕：拦截所有写操作并落库（只拦 POST/PUT/DELETE/PATCH）
app.use(auditTrail);

// 路由
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/ai-usage', aiUsageRoutes);
app.use('/api/endpoint-monitor', endpointMonitorRoutes);

// 本地存储模式：让 uploads/ 目录下的文件可以直接通过 URL 访问
app.use('/uploads', express.static(path.resolve('uploads')));

// 404
app.use((req, res) => res.status(404).json({ message: '接口不存在' }));

// 统一错误处理
app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ message: '服务器内部错误' });
});

/**
 * 定时发布扫描：把所有 status='scheduled' 且 scheduledAt <= 现在 的文章改成 'published'。
 * pre('save') 钩子只在 .save() 调用时触发，没法让文章"自己到点变 published"，
 * 所以必须在这里主动扫一次数据库。
 */
async function publishScheduledNow() {
  try {
    const now = new Date();
    // updateMany 走 MongoDB 原生操作，不触发 Mongoose pre('save') 钩子，
    // 所以这里直接 $set status + publishedAt，跟 pre('save') 里的逻辑对齐。
    const { modifiedCount } = await Blog.updateMany(
      { status: 'scheduled', scheduledAt: { $lte: now } },
      [
        {
          $set: {
            status: 'published',
            // publishedAt 优先用 scheduledAt（代表定时到点自动发布），没有就用当前时间
            publishedAt: { $ifNull: ['$publishedAt', '$scheduledAt', now] },
          },
        },
      ],
    );
    if (modifiedCount > 0) {
      console.log(`[scheduler] 自动发布 ${modifiedCount} 篇定时文章（时间: ${now.toISOString()}）`);
    }
  } catch (err) {
    console.error('[scheduler] 定时发布扫描失败:', err.message);
  }
}

const PORT = process.env.PORT || 5000;

connectDB()
  .then(async () => {
    // 首次启动自动补一个测试账号方便演示（已存在则跳过）
    await seedDemoUser();
    // 首次启动初始化客服高频问答
    await seedFaq();

    // 启动时先扫一次（服务器可能停了很久，有文章早该发布了）
    await publishScheduledNow();

    // 然后每 30 秒扫一次——够用了，极端场景最多延迟 30 秒
    setInterval(publishScheduledNow, 30 * 1000);

    app.listen(PORT, () => console.log(`[server] API running at http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('[db] 连接失败:', err.message);
    process.exit(1);
  });
