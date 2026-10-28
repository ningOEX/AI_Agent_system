import { calcCost } from '../config/modelPricing.js';
import AiUsageLog from '../models/AiUsageLog.js';

/**
 * 从 SSE chunk 中提取 token 用量。
 * OpenAI 兼容模式下 usage 只出现在最后一个 chunk（该 chunk 的 choices 为空数组），
 * 且字段名是 snake_case，与同一个 chunk 里的 delta.content 风格不同，注意别写成 camelCase。
 * @returns {{ promptTokens: number, completionTokens: number, totalTokens: number } | null}
 */
export function extractUsage(json) {
  const usage = json?.usage;
  if (!usage) return null;

  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: usage.total_tokens || promptTokens + completionTokens,
  };
}

/** 解析调用者：有登录用户就用它，否则回落为匿名访客（前台客服接口免登录） */
export function resolveActor(req) {
  if (req?.user?.id) {
    return {
      userId: req.user.id,
      username: req.user.username || '',
      role: req.user.role || '',
    };
  }
  return { userId: null, username: '匿名访客', role: 'guest' };
}

/**
 * 记录一次大模型调用。
 *
 * 约定：调用方务必在 res.json() / res.end() 之后再 await 本函数，客户端感知延迟为 0；
 * 埋点失败只打日志，绝不影响业务（与留痕中间件同策略）。
 */
export async function recordAiUsage({
  scene,
  model,
  usage = {},
  req,
  sessionId = '',
  startedAt,
  success = true,
  statusCode = 0,
  errorMessage = '',
}) {
  try {
    const result = calcCost(model, usage);
    const promptTokens = Number(usage.promptTokens) || 0;
    const completionTokens = Number(usage.completionTokens) || 0;

    await AiUsageLog.create({
      scene,
      model,
      unit: result.unit,
      promptTokens,
      completionTokens,
      totalTokens: Number(usage.totalTokens) || promptTokens + completionTokens,
      units: Number(usage.units) || 0,
      pricing: result.pricing || {},
      // 上游失败的调用不计费，避免虚增成本
      cost: success ? result.cost : 0,
      estimated: result.estimated,
      unknownModel: result.unknownModel,
      user: resolveActor(req),
      sessionId,
      success,
      statusCode,
      errorMessage: String(errorMessage || '').slice(0, 300),
      durationMs: startedAt ? Date.now() - startedAt : 0,
      ip: req?.ip || '',
    });
  } catch (err) {
    console.error('[aiUsage] 埋点写入失败:', err.message);
  }
}
