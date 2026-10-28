/**
 * 大模型价目表与费用换算
 *
 * 单位统一为「元」：
 * - token 类模型：元 / 千 token（与阿里云百炼的账单口径一致，便于对账）
 * - 图像类模型：元 / 张
 *
 * ⚠️ 下面的单价是按百炼公开档位填写的初始值，请按自己的百炼控制台实际计费核对后修正。
 *    调价只需改本文件：每条埋点记录里保存了「下单当刻的单价快照」，历史费用不会被追溯改写。
 */

export const PRICING_UNIT = { TOKEN: 'token', IMAGE: 'image' };

// 单位说明：token 类为 元/千 token；image 类为 元/张
export const MODEL_PRICING = {
  // ---- 文本生成 ----
  'qwen-plus': {
    unit: PRICING_UNIT.TOKEN,
    label: '通义千问 Plus',
    inputPricePerK: 0.0008,
    outputPricePerK: 0.002,
    note: '智能客服默认模型（CHAT_MODEL）',
  },
  'qwen-turbo': {
    unit: PRICING_UNIT.TOKEN,
    label: '通义千问 Turbo',
    inputPricePerK: 0.0003,
    outputPricePerK: 0.0006,
    note: '客服备选模型',
  },
  'qwen-max': {
    unit: PRICING_UNIT.TOKEN,
    label: '通义千问 Max',
    inputPricePerK: 0.0024,
    outputPricePerK: 0.0096,
    note: '客服备选模型',
  },
  'qwen3.7-plus': {
    unit: PRICING_UNIT.TOKEN,
    label: '写作 · 均衡',
    inputPricePerK: 0.0008,
    outputPricePerK: 0.002,
    note: 'AI 写作默认模型',
  },
  'qwen3.8-max': {
    unit: PRICING_UNIT.TOKEN,
    label: '写作 · 高质量',
    inputPricePerK: 0.0024,
    outputPricePerK: 0.0096,
  },
  'qwen3.8-flash': {
    unit: PRICING_UNIT.TOKEN,
    label: '写作 · 快速',
    inputPricePerK: 0.0003,
    outputPricePerK: 0.0006,
  },
  // ---- 图像生成（按张计价）----
  'wan2.2-t2i-flash': {
    unit: PRICING_UNIT.IMAGE,
    label: '文生图 Flash',
    pricePerImage: 0.14,
    note: '文生图模型，按张计费',
  },
};

export const SCENE_LABELS = {
  article: '文章生成',
  chat: '智能客服',
  image: '文生图',
};

/** 中文粗略换算系数：1 token ≈ 1.6 个字符，仅在拿不到 usage 时用于兜底估算 */
export const CHARS_PER_TOKEN = 1.6;

/** 读取某个模型的价目，未收录返回 null */
export function getPricing(model) {
  return MODEL_PRICING[model] || null;
}

/** 价目表列表化，供后台接口返回给前端展示 / 计算器取初值 */
export function listPricing() {
  return Object.entries(MODEL_PRICING).map(([model, price]) => ({ model, ...price }));
}

/** 数值清洗：负数、NaN、非有限数一律归 0 */
function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 金额精度：保留 6 位小数，避免浮点尾巴写进库 */
function money(value) {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * 计算单次调用的费用
 * @param {string} model 模型名
 * @param {{ units?: number, promptTokens?: number, completionTokens?: number,
 *           totalTokens?: number, promptChars?: number, completionChars?: number }} usage
 * @returns {{ cost: number, estimated: boolean, unknownModel: boolean,
 *             unit: string, pricing: object|null, reason: string }}
 */
export function calcCost(model, usage = {}) {
  const price = getPricing(model);

  // 未知模型：不猜价格，记 0 并在明细里标出来，提示补价目
  if (!price) {
    return {
      cost: 0,
      estimated: true,
      unknownModel: true,
      unit: PRICING_UNIT.TOKEN,
      pricing: null,
      reason: '价目表未收录该模型，暂不计费',
    };
  }

  const snapshot = {
    unit: price.unit,
    inputPricePerK: price.inputPricePerK ?? 0,
    outputPricePerK: price.outputPricePerK ?? 0,
    pricePerImage: price.pricePerImage ?? 0,
  };

  // 图像类：按张计价，张数来自上游返回，属于确定值而非估算
  if (price.unit === PRICING_UNIT.IMAGE) {
    const units = num(usage.units) || 1;
    return {
      cost: money(snapshot.pricePerImage * units),
      estimated: false,
      unknownModel: false,
      unit: PRICING_UNIT.IMAGE,
      pricing: snapshot,
      reason: '',
    };
  }

  // token 类：优先用上游返回的真实 usage
  let promptTokens = num(usage.promptTokens);
  let completionTokens = num(usage.completionTokens);

  if (!promptTokens && !completionTokens) {
    // 拿不到 usage（流式被中断 / 兼容层不支持 include_usage）→ 按字符数兜底
    const promptChars = num(usage.promptChars);
    const completionChars = num(usage.completionChars);
    if (!promptChars && !completionChars) {
      return {
        cost: 0,
        estimated: true,
        unknownModel: false,
        unit: PRICING_UNIT.TOKEN,
        pricing: snapshot,
        reason: 'usage 缺失且无文本可估算',
      };
    }
    promptTokens = Math.ceil(promptChars / CHARS_PER_TOKEN);
    completionTokens = Math.ceil(completionChars / CHARS_PER_TOKEN);
    const cost = (promptTokens / 1000) * snapshot.inputPricePerK
      + (completionTokens / 1000) * snapshot.outputPricePerK;
    return {
      cost: money(cost),
      estimated: true,
      unknownModel: false,
      unit: PRICING_UNIT.TOKEN,
      pricing: snapshot,
      reason: 'usage 缺失，按字符数估算',
    };
  }

  const cost = (promptTokens / 1000) * snapshot.inputPricePerK
    + (completionTokens / 1000) * snapshot.outputPricePerK;

  return {
    cost: money(cost),
    estimated: false,
    unknownModel: false,
    unit: PRICING_UNIT.TOKEN,
    pricing: snapshot,
    reason: '',
  };
}
