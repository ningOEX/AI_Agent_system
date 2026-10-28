/**
 * 内容安全中间件：文章新建/编辑时做敏感词校验，命中直接拦截（422，不落库）。
 * 通过 CONTENT_FILTER_ENABLED 环境变量控制开关（默认开启）。
 */
import { checkContent } from '../utils/contentFilter.js';

export default function contentGuard(req, res, next) {
  const { ok, hits } = checkContent({
    title: req.body?.title,
    summary: req.body?.summary,
    content: req.body?.content,
    category: req.body?.category,
    tags: req.body?.tags,
  });

  if (ok) return next();

  const detail = hits.map((h) => `${h.fieldLabel}：${h.word}（${h.category}）`).join('；');
  return res.status(422).json({
    message: `内容包含敏感词，已被拦截 → ${detail}`,
    errors: hits.map((h) => ({
      field: h.field,
      message: `命中敏感词「${h.word}」（${h.category}）`,
    })),
  });
}
