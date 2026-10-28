import express from 'express';
import crypto from 'node:crypto';

import Blog from '../models/Blog.js';
import ChatMessageArchive from '../models/ChatMessageArchive.js';
import ChatSession from '../models/ChatSession.js';
import Faq from '../models/Faq.js';
import { requireAuth } from '../middleware/auth.js';
import rateLimit from '../middleware/rateLimit.js';
import { extractUsage, recordAiUsage } from '../utils/aiUsage.js';

const router = express.Router();

// 客服消息限流：每个 IP 每分钟最多 10 次，防止恶意刷量消耗 AI 额度
const chatRateLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: (req) => req.ip,
  message: '提问过于频繁，请稍后再试',
});

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const CHAT_MODEL = process.env.CHAT_MODEL || 'qwen-plus';
const DASHSCOPE_URL =
  'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

// FAQ 文本匹配命中阈值：低于这个分数就交给 AI
const HIT_THRESHOLD = 4;

// ============ 缓存层 ============
// FAQ 列表 + 文章知识上下文变化频率低，用内存缓存减少 DB 查询与 prompt token 消耗
const FAQ_CACHE_TTL = 5 * 60 * 1000; // 5 分钟
const CONTEXT_CACHE_TTL = 10 * 60 * 1000; // 10 分钟
const AI_ANSWER_CACHE_TTL = 60 * 60 * 1000; // 1 小时

let faqCache = { data: null, expiresAt: 0 };
let contextCache = { data: '', expiresAt: 0 };
const aiAnswerCache = new Map(); // key(normalized question) -> { answer, expiresAt }

/** 读取 FAQ 缓存，过期则重新查库 */
async function getCachedFaqs() {
  const now = Date.now();
  if (faqCache.data && faqCache.expiresAt > now) return faqCache.data;
  const list = await Faq.find({ enabled: true })
    .select('question answer keywords followUps')
    .lean();
  faqCache = { data: list, expiresAt: now + FAQ_CACHE_TTL };
  return list;
}

/** 主动失效 FAQ 缓存（FAQ 增删改时调用） */
function invalidateFaqCache() {
  faqCache = { data: null, expiresAt: 0 };
}

/** 读取文章知识上下文缓存 */
async function getCachedContext() {
  const now = Date.now();
  if (contextCache.expiresAt > now) return contextCache.data;
  const ctx = await knowledgeContext();
  contextCache = { data: ctx, expiresAt: now + CONTEXT_CACHE_TTL };
  return ctx;
}

/** 规范化用户提问作为缓存 key：去标点、trim、小写 */
function normalizeQuestion(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[\s，。！？、,.!?：:；;（）()「」【】"'`~@#$%^&*_+\-=<>/\\|]+/g, '');
}

/** 对话级 AI 回答缓存命中判断 */
function getCachedAiAnswer(text) {
  const key = normalizeQuestion(text);
  if (!key) return null;
  const hit = aiAnswerCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.answer;
  if (hit) aiAnswerCache.delete(key);
  return null;
}

/** 写入 AI 回答缓存 */
function setCachedAiAnswer(text, answer) {
  const key = normalizeQuestion(text);
  if (!key) return;
  aiAnswerCache.set(key, { answer, expiresAt: Date.now() + AI_ANSWER_CACHE_TTL });
  // 缓存容量上限：超过 1000 条时清理最早的
  if (aiAnswerCache.size > 1000) {
    const firstKey = aiAnswerCache.keys().next().value;
    if (firstKey) aiAnswerCache.delete(firstKey);
  }
}

const SYSTEM_PROMPT = `你是「AI · Pulse」博客站点的智能客服助手，名字叫小 Pulse。
站点是一个关于 AI Agent、前端工程与大模型应用的博客平台，内容由管理员在后台发布。

回答要求：
1. 用简体中文，简洁友好，控制在 120 字以内，必要时分点。
2. 只回答与本站相关的问题（文章、账号、评论、主题、后台使用等）。
3. 不确定的信息不要编造，直接说"这个我不太确定，建议联系管理员"。
4. 不要输出 Markdown 标题、代码块或链接以外的复杂排版。`;

/** 管理员校验 */
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: '仅管理员可操作' });
  }
  next();
}

/** 把中文字符串切成二元组，用于粗略相似度计算 */
function bigrams(text) {
  const s = String(text || '')
    .toLowerCase()
    .replace(/[\s，。！？、,.!?：:；;（）()「」【】"'`]/g, '');
  const set = new Set();
  for (let i = 0; i < s.length - 1; i += 1) set.add(s.slice(i, i + 2));
  return [...set];
}

/** 计算用户输入与某条 FAQ 的匹配分 */
function scoreFaq(text, faq) {
  const msg = String(text || '').toLowerCase();
  let score = 0;
  const candidates = [faq.question, ...(faq.keywords || [])];
  for (const raw of candidates) {
    const k = String(raw || '').trim().toLowerCase();
    if (!k) continue;
    if (msg.includes(k)) {
      score += 5;
      continue;
    }
    const grams = bigrams(k);
    if (!grams.length) continue;
    const hit = grams.filter((g) => msg.includes(g)).length;
    score += (hit / grams.length) * 3;
  }
  return score;
}

/** 取最近文章作为轻量知识上下文 */
async function knowledgeContext() {
  try {
    const blogs = await Blog.find({ status: 'published' })
      .sort({ createdAt: -1 })
      .limit(8)
      .select('title summary category')
      .lean();
    if (!blogs.length) return '';
    const lines = blogs.map(
      (b, i) =>
        `${i + 1}. 《${b.title}》｜分类：${b.category}｜摘要：${String(b.summary || '').slice(0, 80)}`,
    );
    return `\n\n以下是本站近期文章，可供参考（不要编造不存在的内容）：\n${lines.join('\n')}`;
  } catch {
    return '';
  }
}

/** 取会话最近若干轮对话，作为多轮上下文 */
async function recentHistory(sessionId) {
  try {
    const session = await ChatSession.findOne({ sessionId }).lean();
    if (!session) return [];
    return session.messages
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));
  } catch {
    return [];
  }
}

// ChatSession 单文档保留的最大消息数，超出部分归档到 ChatMessageArchive
const MAX_SESSION_MESSAGES = 50;

/** 写入一轮问答（失败不影响主流程） */
async function saveTurn(sessionId, userText, answer, source, faqId) {
  try {
    const message = { role: 'assistant', content: answer, source };
    if (faqId) message.faqId = faqId;

    const newTurn = [{ role: 'user', content: userText }, message];

    // 归档：若当前消息数 + 本轮(2条) 超过阈值，把溢出的最早消息移到归档集合
    const existing = await ChatSession.findOne({ sessionId })
      .select('messages')
      .lean();
    if (existing && existing.messages.length + newTurn.length > MAX_SESSION_MESSAGES) {
      const overflow =
        existing.messages.length + newTurn.length - MAX_SESSION_MESSAGES;
      const toArchive = existing.messages.slice(0, overflow);
      await ChatMessageArchive.create({ sessionId, messages: toArchive });
    }

    const update = {
      $push: {
        messages: {
          $each: newTurn,
          $slice: -MAX_SESSION_MESSAGES,
        },
      },
      $set: {
        lastMessageAt: new Date(),
        ...(source === 'fallback' || source === 'handoff' ? { unhandled: true } : {}),
      },
      $setOnInsert: { sessionId },
    };
    await ChatSession.updateOne({ sessionId }, update, { upsert: true });
  } catch (err) {
    console.error('[chat] 会话保存失败:', err.message);
  }
}

// ============ 前台：预设选项 ============

/** GET /api/chat/faq — 聊天窗首屏快捷选项 */
router.get('/faq', async (req, res, next) => {
  try {
    const list = await Faq.find({ enabled: true })
      .sort({ order: 1, createdAt: 1 })
      .limit(20)
      .select('question answer category followUps order')
      .lean();
    res.json({ list });
  } catch (err) {
    next(err);
  }
});

// ============ 前台：发消息 ============

/**
 * POST /api/chat/message
 * body: { sessionId?, message, type: 'text' | 'option' | 'handoff', faqId? }
 * - sessionId 由后端签发：首次请求不带，后端生成 UUID 并在响应中返回；
 *   后续请求携带该 sessionId 以维持多轮上下文。前端不再自行生成。
 * - type=option：命中预设，直接返回固定答案
 * - type=text：先做 FAQ 匹配，命中直接返回；否则走 qwen-plus 流式（SSE）
 */
router.post('/message', chatRateLimit, async (req, res, next) => {
  const { sessionId, message, faqId, type = 'text' } = req.body || {};
  const text = String(message || '').trim();

  if (!text) return res.status(422).json({ message: '请输入内容' });
  if (text.length > 1000) return res.status(422).json({ message: '内容过长，请精简到 1000 字以内' });

  // 后端签发 sessionId：前端未传或为空时生成安全的 UUID，避免客户端伪造/枚举
  const rawSid = String(sessionId || '').trim();
  const sid = rawSid || crypto.randomUUID();

  try {
    // 0) 等待人工模式：用户点过转人工后，所有消息只存库（user 消息），
    //    不返回任何自动生成的 assistant 内容，完全交给人工处理
    if (type !== 'handoff') {
      const sess = await ChatSession.findOne({ sessionId: sid })
        .select('awaitingAgent')
        .lean();
      if (sess?.awaitingAgent) {
        // 仅保存 user 消息，不写 assistant（不触发任何自动回复）
        await ChatSession.updateOne(
          { sessionId: sid },
          {
            $push: { messages: { $each: [{ role: 'user', content: text }], $slice: -MAX_SESSION_MESSAGES } },
            $set: { lastMessageAt: new Date() },
            $setOnInsert: { sessionId: sid },
          },
          { upsert: true },
        );
        return res.json({ sessionId: sid, source: 'waiting', silent: true, followUps: [] });
      }
    }

    // 1) 预设选项：零成本直接返回
    if (type === 'option' && faqId) {
      const faq = await Faq.findById(faqId);
      if (!faq || !faq.enabled) {
        return res.status(404).json({ message: '该问题已下线' });
      }
      await Faq.updateOne({ _id: faq._id }, { $inc: { hitCount: 1 } });
      await saveTurn(sid, text, faq.answer, 'option', faq._id);
      return res.json({
        sessionId: sid,
        answer: faq.answer,
        source: 'option',
        followUps: faq.followUps || [],
      });
    }

    // 1.5) 转人工：标记会话待跟进 + 进入等待模式
    if (type === 'handoff') {
      const answer =
        '已为你转接人工客服 🧑‍💼 管理员正在赶来，请稍等片刻。';
      await saveTurn(sid, '转人工', answer, 'handoff');
      // 进入等待模式：后续普通消息不再触发 AI/FAQ 自动回复
      await ChatSession.updateOne(
        { sessionId: sid },
        { $set: { awaitingAgent: true } },
        { upsert: true },
      );
      return res.json({ sessionId: sid, answer, source: 'handoff', followUps: [] });
    }

    // 2) 文本匹配 FAQ（走缓存，减少 DB 查询）
    const faqs = await getCachedFaqs();
    let best = null;
    let bestScore = 0;
    for (const faq of faqs) {
      const s = scoreFaq(text, faq);
      if (s > bestScore) {
        bestScore = s;
        best = faq;
      }
    }
    if (best && bestScore >= HIT_THRESHOLD) {
      await Faq.updateOne({ _id: best._id }, { $inc: { hitCount: 1 } });
      await saveTurn(sid, text, best.answer, 'faq', best._id);
      return res.json({
        sessionId: sid,
        answer: best.answer,
        source: 'faq',
        followUps: best.followUps || [],
      });
    }

    // 3) 对话级 AI 回答缓存：相同问题 1 小时内复用，避免重复消耗 token
    const cached = getCachedAiAnswer(text);
    if (cached) {
      await saveTurn(sid, text, cached, 'ai');
      return res.json({ sessionId: sid, answer: cached, source: 'ai', followUps: [] });
    }

    // 4) 未配置模型 Key → 兜底
    if (!DASHSCOPE_API_KEY) {
      const answer = '抱歉，智能客服暂时离线了。你可以换个说法，或联系管理员协助处理。';
      await saveTurn(sid, text, answer, 'fallback');
      return res.json({ sessionId: sid, answer, source: 'fallback', followUps: [] });
    }

    // 5) 调大模型流式回答
    await streamAnswer({ res, sid, text, req });
  } catch (err) {
    next(err);
  }
});

/** 调用 qwen-plus 流式输出，SSE 推给前端 */
async function streamAnswer({ res, sid, text, req }) {
  const startedAt = Date.now();
  const [context, history] = await Promise.all([
    getCachedContext(),
    recentHistory(sid),
  ]);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT + context },
    ...history,
    { role: 'user', content: text },
  ];

  const promptChars = SYSTEM_PROMPT.length + context.length + text.length;

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  res.flushHeaders?.();

  let full = '';
  // 埋点用：流式 usage 只出现在最后一个 chunk；拿不到时用字符数兜底估算
  let streamUsage = null;
  try {
    const upstream = await fetch(DASHSCOPE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages,
        stream: true,
        // 流式模式下必须显式声明，否则最后一个 chunk 不带 usage 统计
        stream_options: { include_usage: true },
        temperature: 0.6,
        max_tokens: 800,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '');
      console.error('[chat] DashScope 响应异常:', upstream.status, detail.slice(0, 300));
      throw new Error(`upstream ${upstream.status}`);
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let index = buffer.indexOf('\n');
      while (index >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf('\n');
        if (!line.startsWith('data:')) continue;

        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          // usage 只在最后一个 chunk 出现（该 chunk 的 choices 为空数组）
          const u = extractUsage(json);
          if (u) streamUsage = u;
          const delta = json?.choices?.[0]?.delta?.content || '';
          if (delta) {
            full += delta;
            res.write(`data: ${JSON.stringify({ delta })}\n\n`);
          }
        } catch {
          // 忽略无法解析的心跳行
        }
      }
    }

    res.write(`data: ${JSON.stringify({ done: true, source: 'ai', sessionId: sid })}\n\n`);
    res.end();
    const finalAnswer = full || '（没有获取到回答）';
    await saveTurn(sid, text, finalAnswer, 'ai');
    // 写入对话级缓存，相同问题 1 小时内复用
    if (finalAnswer) setCachedAiAnswer(text, finalAnswer);
    // 前台客服免登录，靠 sessionId 归属；不落库对话正文，只记用量
    await recordAiUsage({
      scene: 'chat',
      model: CHAT_MODEL,
      usage: streamUsage || { promptChars, completionChars: full.length },
      req,
      sessionId: sid,
      startedAt,
      success: true,
      statusCode: 200,
    });
  } catch (err) {
    console.error('[chat] AI 流式失败:', err.message);
    try {
      if (!full) {
        res.write(
          `data: ${JSON.stringify({ delta: '抱歉，服务暂时开小差了，请稍后再试或联系管理员。' })}\n\n`,
        );
      }
      res.write(`data: ${JSON.stringify({ done: true, source: 'fallback', sessionId: sid })}\n\n`);
      res.end();
    } catch {
      // 连接已断开
    }
    await saveTurn(sid, text, full || '（AI 服务异常，已转兜底）', 'fallback');
    await recordAiUsage({
      scene: 'chat',
      model: CHAT_MODEL,
      usage: streamUsage || { promptChars, completionChars: full.length },
      req,
      sessionId: sid,
      startedAt,
      success: false,
      statusCode: 502,
      errorMessage: err.message,
    });
  }
}

// ============ 后台：FAQ 管理 ============

router.get('/faqs', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const list = await Faq.find().sort({ order: 1, createdAt: -1 }).lean();
    res.json({ list });
  } catch (err) {
    next(err);
  }
});

router.post('/faqs', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { question, answer, category, keywords, followUps, order, enabled } = req.body || {};
    if (!String(question || '').trim() || !String(answer || '').trim()) {
      return res.status(422).json({ message: '问题和答案都不能为空' });
    }
    const faq = await Faq.create({
      question: String(question).trim(),
      answer: String(answer).trim(),
      category: category || '通用',
      keywords: Array.isArray(keywords) ? keywords : String(keywords || '').split(/[,，]/).filter(Boolean),
      followUps: Array.isArray(followUps) ? followUps : String(followUps || '').split(/[,，]/).filter(Boolean),
      order: Number(order) || 0,
      enabled: enabled !== false,
    });
    invalidateFaqCache();
    res.status(201).json(faq);
  } catch (err) {
    next(err);
  }
});

router.put('/faqs/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { question, answer, category, keywords, followUps, order, enabled } = req.body || {};
    const patch = {};
    if (question !== undefined) patch.question = String(question).trim();
    if (answer !== undefined) patch.answer = String(answer).trim();
    if (category !== undefined) patch.category = category;
    if (keywords !== undefined) {
      patch.keywords = Array.isArray(keywords)
        ? keywords
        : String(keywords).split(/[,，]/).filter(Boolean);
    }
    if (followUps !== undefined) {
      patch.followUps = Array.isArray(followUps)
        ? followUps
        : String(followUps).split(/[,，]/).filter(Boolean);
    }
    if (order !== undefined) patch.order = Number(order) || 0;
    if (enabled !== undefined) patch.enabled = !!enabled;

    const faq = await Faq.findByIdAndUpdate(req.params.id, patch, { new: true });
    if (!faq) return res.status(404).json({ message: '记录不存在' });
    invalidateFaqCache();
    res.json(faq);
  } catch (err) {
    next(err);
  }
});

router.delete('/faqs/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const deleted = await Faq.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: '记录不存在' });
    invalidateFaqCache();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ============ 后台：会话记录 ============

router.get('/sessions', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 10));
    const filter = {};
    if (req.query.unhandled === 'true') filter.unhandled = true;

    // 用聚合管道只取最后一条消息 + 消息总数，避免把整个 messages 数组拉到内存
    const [list, total] = await Promise.all([
      ChatSession.aggregate([
        { $match: filter },
        { $sort: { lastMessageAt: -1 } },
        { $skip: (page - 1) * pageSize },
        { $limit: pageSize },
        {
          $project: {
            sessionId: 1,
            unhandled: 1,
            lastMessageAt: 1,
            createdAt: 1,
            userId: 1,
            messageCount: { $size: '$messages' },
            lastMessage: { $slice: ['$messages', -1] },
          },
        },
      ]),
      ChatSession.countDocuments(filter),
    ]);

    res.json({
      list: list.map((s) => ({
        _id: s._id,
        sessionId: s.sessionId,
        unhandled: s.unhandled,
        lastMessageAt: s.lastMessageAt,
        createdAt: s.createdAt,
        messageCount: s.messageCount || 0,
        lastMessage: s.lastMessage?.[0]?.content || '',
      })),
      total,
      page,
      pageSize,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/sessions/:sessionId', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const session = await ChatSession.findOne({ sessionId: req.params.sessionId }).lean();
    if (!session) return res.status(404).json({ message: '会话不存在' });
    // 合并归档消息：按时间顺序拼接到当前 messages 前面，还原完整对话历史
    const archives = await ChatMessageArchive.find({ sessionId: req.params.sessionId })
      .sort({ archivedAt: 1 })
      .lean();
    const archivedMessages = archives.flatMap((a) => a.messages);
    session.messages = [...archivedMessages, ...session.messages];
    res.json(session);
  } catch (err) {
    next(err);
  }
});

router.put('/sessions/:sessionId/handled', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const session = await ChatSession.findOneAndUpdate(
      { sessionId: req.params.sessionId },
      { $set: { unhandled: false } },
      { new: true },
    );
    if (!session) return res.status(404).json({ message: '会话不存在' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/sessions/:sessionId', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const deleted = await ChatSession.findOneAndDelete({ sessionId: req.params.sessionId });
    if (!deleted) return res.status(404).json({ message: '会话不存在' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** 批量删除会话：DELETE /api/chat/sessions，body: { sessionIds: string[] } */
router.delete('/sessions', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.sessionIds)
      ? req.body.sessionIds.map((s) => String(s).trim()).filter(Boolean)
      : [];
    if (!ids.length) return res.status(422).json({ message: '请选择要删除的会话' });
    if (ids.length > 100) return res.status(422).json({ message: '单次最多删除 100 条' });

    const { deletedCount } = await ChatSession.deleteMany({ sessionId: { $in: ids } });
    res.json({ ok: true, deleted: deletedCount });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/chat/sessions/:sessionId/reply
 * 管理员回复用户：写入一条 source=admin 的 assistant 消息，并标记会话已处理。
 * 仅 admin 可调用。
 */
router.post('/sessions/:sessionId/reply', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const reply = String(req.body?.reply || '').trim();
    if (!reply) return res.status(422).json({ message: '回复内容不能为空' });
    if (reply.length > 2000) return res.status(422).json({ message: '回复内容过长，请控制在 2000 字以内' });

    const message = { role: 'assistant', content: reply, source: 'admin' };

    // 归档溢出消息，保持单文档不超过 MAX_SESSION_MESSAGES
    const existing = await ChatSession.findOne({ sessionId: req.params.sessionId })
      .select('messages')
      .lean();
    if (existing && existing.messages.length + 1 > MAX_SESSION_MESSAGES) {
      const overflow = existing.messages.length + 1 - MAX_SESSION_MESSAGES;
      const toArchive = existing.messages.slice(0, overflow);
      await ChatMessageArchive.create({ sessionId: req.params.sessionId, messages: toArchive });
    }

    const session = await ChatSession.findOneAndUpdate(
      { sessionId: req.params.sessionId },
      {
        $push: { messages: { $each: [message], $slice: -MAX_SESSION_MESSAGES } },
        $set: { lastMessageAt: new Date(), unhandled: false },
      },
      { new: true },
    );
    if (!session) return res.status(404).json({ message: '会话不存在' });
    res.json({ ok: true, message });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/chat/history?sessionId=xxx
 * 公开接口：返回某会话最近 20 条消息，供前台在打开客服时加载历史（含管理员回复）。
 */
router.get('/history', async (req, res, next) => {
  try {
    const sessionId = String(req.query.sessionId || '').trim();
    if (!sessionId) return res.status(422).json({ message: '缺少 sessionId' });

    const session = await ChatSession.findOne({ sessionId })
      .select('messages')
      .slice('messages', -20)
      .lean();
    if (!session) return res.json({ list: [] });

    res.json({ list: session.messages || [] });
  } catch (err) {
    next(err);
  }
});

/** 重置会话状态：前台打开弹框时调用，清除 awaitingAgent 等待模式 */
router.post('/sessions/:sessionId/reset', async (req, res, next) => {
  try {
    const session = await ChatSession.findOneAndUpdate(
      { sessionId: req.params.sessionId },
      { $set: { awaitingAgent: false } },
      { new: true },
    );
    if (!session) return res.json({ ok: true, reset: false });
    res.json({ ok: true, reset: true, awaitingAgent: false });
  } catch (err) {
    next(err);
  }
});

export default router;
