import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { body, validationResult } from 'express-validator';

import { requireAuth } from '../middleware/auth.js';
import { extractUsage, recordAiUsage } from '../utils/aiUsage.js';
import { uploadToOss, hasOss } from '../utils/oss.js';

const router = express.Router();

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const ARTICLE_DASHSCOPE_URL =
  'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

// 文生图模型：按张计费，埋点与请求体共用同一个常量避免写串
const IMAGE_MODEL = 'wan2.2-t2i-flash';

// 文章生成可选模型（均在百炼兼容模式 /v1/models 中可用）
const ARTICLE_MODELS = {
  'qwen3.7-plus': '均衡（推荐，速度与文笔平衡）',
  'qwen3.8-max': '高质量（长文结构与文笔更好，耗时更长）',
  'qwen3.8-flash': '快速（出稿快，适合列提纲/初稿）',
};

const ARTICLE_TONES = {
  technical: '技术严谨：术语准确、逻辑清晰，必要时给出代码示例与注意事项。',
  popular: '通俗易懂：少用术语，多用类比与生活化例子，让非专业读者也能看懂。',
  deep: '深度解析：从原理、实现、取舍与最佳实践层层展开，体现思考深度。',
  casual: '轻松活泼：语气亲切有节奏感，适度使用短句和轻量吐槽，但不失信息量。',
};

const ARTICLE_LENGTHS = {
  short: { words: 800, maxTokens: 1800 },
  medium: { words: 1500, maxTokens: 3200 },
  long: { words: 2600, maxTokens: 5200 },
};

/**
 * POST /api/ai/generate
 *
 * 调用阿里云百炼 DashScope 的 wan2.2-t2i-flash 文生图模型（0.14 元/张，100 张免费）。
 * 后端中转，Key 存 .env，前端不接触密钥。
 *
 * Request body: { prompt: string }
 * Response: { url: string, key?: string, oss: boolean, source: 'ai' }
 */
router.post(
  '/generate',
  requireAuth,
  [body('prompt').trim().notEmpty().withMessage('请输入提示词').isLength({ max: 500 })],
  async (req, res, next) => {
    const startedAt = Date.now();
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        message: '参数校验失败',
        errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
      });
    }

    if (!DASHSCOPE_API_KEY) {
      return res.status(500).json({ message: 'AI 服务未配置：缺少 DASHSCOPE_API_KEY' });
    }

    const { prompt } = req.body;

    try {
      // 同步调用（去掉 X-DashScope-Async）：wan2.2-t2i-flash 同步直接返回结果，
      // 省掉异步模式的 task_id + 轮询往返，整体快 ~2 秒
      const submitRes = await fetch(
        'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: IMAGE_MODEL,
            input: { prompt },
            parameters: { size: '1024*1024', n: 1 },
          }),
        },
      );

      if (!submitRes.ok) {
        const text = await submitRes.text();
        console.error('[ai] DashScope 调用失败:', submitRes.status, text);
        const message = 'AI 服务调用失败：' + (JSON.parse(text)?.message || '请稍后再试');
        res.status(502).json({ message });
        await recordAiUsage({
          scene: 'image',
          model: IMAGE_MODEL,
          usage: { units: 0 },
          req,
          startedAt,
          success: false,
          statusCode: submitRes.status,
          errorMessage: message,
        });
        return;
      }

      const submitData = await submitRes.json();
      const results = submitData?.output?.results || [];
      const imageUrl = results[0]?.url;
      if (!imageUrl) {
        console.error('[ai] DashScope 返回异常:', JSON.stringify(submitData));
        res.status(502).json({ message: 'AI 服务返回异常' });
        await recordAiUsage({
          scene: 'image',
          model: IMAGE_MODEL,
          usage: { units: 0 },
          req,
          startedAt,
          success: false,
          statusCode: 502,
          errorMessage: 'AI 服务返回异常',
        });
        return;
      }

      // 下载 DashScope 生成的图片 → Buffer → 上传到 OSS（统一存储）
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) {
        res.status(502).json({ message: '下载 AI 图片失败' });
        await recordAiUsage({
          scene: 'image',
          model: IMAGE_MODEL,
          usage: { units: 0 },
          req,
          startedAt,
          success: false,
          statusCode: 502,
          errorMessage: '下载 AI 图片失败',
        });
        return;
      }
      const imgBuf = Buffer.from(await imgRes.arrayBuffer());

      let finalUrl, ossKey, ossFlag = false;
      const filename = `ai_${Date.now()}.png`;

      if (hasOss) {
        const { fileUrl, key } = await uploadToOss(imgBuf, filename, { folder: 'blog/covers' });
        finalUrl = fileUrl;
        ossKey = key;
        ossFlag = true;
      } else {
        // 本地模式
        const dir = path.resolve('uploads', 'blog', 'covers');
        fs.mkdirSync(dir, { recursive: true });
        const localName = `ai_${Date.now()}.png`;
        const localPath = path.join(dir, localName);
        fs.writeFileSync(localPath, imgBuf);
        finalUrl = `/uploads/blog/covers/${localName}`;
        ossKey = `blog/covers/${localName}`;
      }

      res.json({ url: finalUrl, key: ossKey, oss: ossFlag, source: 'ai' });
      // 响应已发完再落库，客户端感知延迟为 0
      await recordAiUsage({
        scene: 'image',
        model: IMAGE_MODEL,
        usage: { units: results.length || 1 },
        req,
        startedAt,
        success: true,
        statusCode: 200,
      });
    } catch (err) {
      console.error('[ai] generate error:', err);
      res.status(500).json({ message: 'AI 生成服务异常：' + err.message });
      await recordAiUsage({
        scene: 'image',
        model: IMAGE_MODEL,
        usage: { units: 0 },
        req,
        startedAt,
        success: false,
        statusCode: 500,
        errorMessage: err.message,
      });
    }
  },
);

/**
 * POST /api/ai/article
 *
 * 根据提示词生成文章正文（Markdown），SSE 流式返回，前端边生成边渲染进编辑器。
 *
 * Request body:
 * { prompt: string, title?: string, category?: string,
 *   tone?: 'technical' | 'popular' | 'deep' | 'casual',
 *   length?: 'short' | 'medium' | 'long',
 *   model?: 'qwen3.7-plus' | 'qwen3.8-max' | 'qwen3.8-flash' }
 *
 * Response: text/event-stream
 *   data: {"delta":"..."}  逐段正文
 *   data: {"done":true}    结束标记
 */
router.post('/article', requireAuth, async (req, res) => {
  const startedAt = Date.now();
  const {
    prompt = '',
    title = '',
    category = '',
    tone = 'technical',
    length = 'medium',
    model = 'qwen3.7-plus',
  } = req.body || {};

  const text = String(prompt).trim();
  if (!text) return res.status(422).json({ message: '请输入写作提示词' });
  if (text.length > 2000) return res.status(422).json({ message: '提示词请控制在 2000 字以内' });

  if (!DASHSCOPE_API_KEY) {
    return res.status(503).json({ message: 'AI 服务未配置：缺少 DASHSCOPE_API_KEY' });
  }

  const useModel = ARTICLE_MODELS[model] ? model : 'qwen3.7-plus';
  const toneRule = ARTICLE_TONES[tone] || ARTICLE_TONES.technical;
  const size = ARTICLE_LENGTHS[length] || ARTICLE_LENGTHS.medium;

  // 已有标题/分类时作为写作上下文，避免模型另起一个不相关的主题
  const contextLines = [];
  if (String(title).trim()) contextLines.push(`文章标题：${String(title).trim()}`);
  if (String(category).trim()) contextLines.push(`文章分类：${String(category).trim()}`);

  const systemPrompt = `你是「AI · Pulse」博客站点的资深技术作者，擅长写中文技术博客。
站点主题：AI Agent、前端工程、大模型应用与产品设计。

写作要求：
1. 只输出文章正文的 Markdown，不要重复文章标题，不要输出 H1 标题，不要任何寒暄或解释。
2. 结构完整：开头引入 → 2~4 个二级标题（##）小节 → 必要的代码块/列表/表格 → 结尾总结。
3. 代码块必须标注语言；表格仅在有对比信息时使用，不要为了排版而堆表格。
4. 语言专业、具体、有信息量，避免"随着时代发展"这类空话套话。
5. 不编造具体数据、引用和版本号；不确定的内容用概括性表述。
6. 全文简体中文，篇幅约 ${size.words} 字，段落之间空一行。
7. 语气风格：${toneRule}
${contextLines.length ? `\n${contextLines.join('\n')}` : ''}`;

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // 前端点"停止生成"会断开连接，这里同步中断上游请求，避免白白消耗 token
  const controller = new AbortController();
  req.on('close', () => controller.abort());

  // 埋点用：流式 usage 只出现在最后一个 chunk；拿不到时用字符数兜底估算
  let streamUsage = null;
  let pushedChars = 0;

  try {
    const upstream = await fetch(ARTICLE_DASHSCOPE_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: useModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        stream: true,
        // 流式模式下必须显式声明，否则最后一个 chunk 不带 usage 统计
        stream_options: { include_usage: true },
        temperature: 0.85,
        max_tokens: size.maxTokens,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '');
      console.error('[ai] 文章生成上游异常:', upstream.status, detail.slice(0, 300));
      res.write(
        `data: ${JSON.stringify({ delta: `\n\n> AI 生成失败（${upstream.status}），请稍后重试。` })}\n\n`,
      );
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
      await recordAiUsage({
        scene: 'article',
        model: useModel,
        usage: { promptChars: systemPrompt.length + text.length, completionChars: pushedChars },
        req,
        startedAt,
        success: false,
        statusCode: upstream.status,
        errorMessage: detail.slice(0, 300) || `upstream ${upstream.status}`,
      });
      return;
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
          // 只取正文，忽略推理模型可能返回的 reasoning_content
          const delta = json?.choices?.[0]?.delta?.content || '';
          if (delta) {
            pushedChars += delta.length;
            res.write(`data: ${JSON.stringify({ delta })}\n\n`);
          }
        } catch {
          // 忽略无法解析的心跳行
        }
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
    // 响应已发完再落库，客户端感知延迟为 0；拿不到真实 usage 时用字符数估算
    await recordAiUsage({
      scene: 'article',
      model: useModel,
      usage: streamUsage || {
        promptChars: systemPrompt.length + text.length,
        completionChars: pushedChars,
      },
      req,
      startedAt,
      success: true,
      statusCode: 200,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      // 用户主动停止，直接结束；已消耗的 token 仍要记一笔
      try {
        res.end();
      } catch {
        // 连接已关闭
      }
      await recordAiUsage({
        scene: 'article',
        model: useModel,
        usage: { promptChars: systemPrompt.length + text.length, completionChars: pushedChars },
        req,
        startedAt,
        success: false,
        statusCode: 499,
        errorMessage: '用户取消生成',
      });
      return;
    }
    console.error('[ai] 文章生成失败:', err.message);
    try {
      res.write(
        `data: ${JSON.stringify({ delta: '\n\n> AI 生成异常，请稍后重试。' })}\n\n`,
      );
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch {
      // 连接已关闭
    }
    await recordAiUsage({
      scene: 'article',
      model: useModel,
      usage: streamUsage || {
        promptChars: systemPrompt.length + text.length,
        completionChars: pushedChars,
      },
      req,
      startedAt,
      success: false,
      statusCode: 500,
      errorMessage: err.message,
    });
  }
});

export default router;
