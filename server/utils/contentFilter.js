/**
 * 内容敏感词校验工具
 *
 * 能力：
 * - normalize：归一化文本，抵御「代 开 发 票」「代*开*发*票」「全角字符」等常见绕过写法
 * - 去噪骨架：剥离所有非汉字字符，抵御插入字母/数字/emoji 等垃圾字符的绕过
 * - 有界间隔匹配：容忍字与字之间插入填充字符，抵御「听一话一水」这类笔画/汉字插字绕过
 * - 首字分桶：按敏感词首字建索引，只扫描正文里实际出现过的首字，避免大词库下逐词扫全篇
 * - 白名单豁免：敏感词的每一处出现都被白名单长词覆盖时才视为误报
 * - checkContent：按字段批量校验，返回命中的 { field, fieldLabel, word, category } 列表
 *
 * 开关：环境变量 CONTENT_FILTER_ENABLED !== 'false' 时启用（默认开启）。
 * 注意：本地词库方案能显著抬高绕过门槛，但无法穷举拼音/谐音/拆字等对抗手法。
 */
import { ALLOW_WORDS, SENSITIVE_GROUPS } from '../config/sensitiveWords.js';

const FIELD_LABELS = {
  title: '标题',
  summary: '摘要',
  content: '正文',
  category: '分类',
  tags: '标签',
};

export const contentFilterEnabled = process.env.CONTENT_FILTER_ENABLED !== 'false';

/**
 * 归一化：去零宽字符 → 全角转半角 → 转小写 → 去空白/常见分隔符。
 * 目的是让「代 开 发 票」「代*开*发*票」都能归一到「代开发票」后再匹配。
 */
function normalize(text) {
  return String(text ?? '')
    // 兼容字符归一：全角→半角、①→1、㈱→(株)、带圈/上标字符等一次性归位
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .toLowerCase()
    .replace(/[\s·•*~_\-./\\|,、。，：:；;！!？?"'“”‘’()（）[\]【】<>《》]+/g, '');
}

/**
 * 去噪骨架：只保留汉字，剥离拉丁字母/数字/符号/emoji 等插入型噪声。
 * 对抗「erere听ereren话rerere水rearaer」「听😀话😀水」这类在敏感词字间插垃圾字符的绕过写法。
 * 与 normalize 结果一起做双通道匹配，避免影响正常含英文的正文（如技术文章）。
 */
function toSkeleton(text) {
  return normalize(text).replace(/[^\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g, '');
}

// 白名单归一化（用于「合法语境豁免」判定）
const normalizedAllowWords = ALLOW_WORDS.map(normalize).filter(Boolean);

// 首字分桶：首字 → [{ word, category }]
const BUCKETS = new Map();
for (const group of SENSITIVE_GROUPS) {
  for (const raw of group.words) {
    const word = normalize(raw);
    if (!word) continue;
    const key = word[0];
    if (!BUCKETS.has(key)) BUCKETS.set(key, []);
    BUCKETS.get(key).push({ word, category: group.label });
  }
}

// 有界间隔通道：只对长度 >= 3 的词启用。
// 2 字词容忍插字会误伤正常短语（如「刷一单」被判为「刷单」），得不偿失。
const GAP_MAX = 1; // 相邻两字之间最多允许插入的字符数
const GAP_BUCKETS = new Map();
for (const bucket of BUCKETS.values()) {
  for (const entry of bucket) {
    if (entry.word.length < 3) continue;
    const key = entry.word[0];
    if (!GAP_BUCKETS.has(key)) GAP_BUCKETS.set(key, []);
    GAP_BUCKETS.get(key).push(entry);
  }
}

/**
 * 从 text[start] 开始，按 pattern 逐字匹配，允许相邻两字之间插入 <= maxGap 个任意字符。
 * @returns {number} 匹配成功返回结束下标（不含），失败返回 -1
 */
function matchWithGap(text, start, pattern, maxGap) {
  if (text[start] !== pattern[0]) return -1;
  let pos = start;
  for (let k = 1; k < pattern.length; k++) {
    let next = -1;
    for (let g = 1; g <= maxGap + 1; g++) {
      const cand = pos + g;
      if (cand >= text.length) break;
      if (text[cand] === pattern[k]) {
        next = cand;
        break;
      }
    }
    if (next === -1) return -1;
    pos = next;
  }
  return pos + 1;
}

/**
 * 判断某个敏感词是否属于「合法语境」误报：
 * 该词在文本中的每一处出现，都必须落在某个白名单长词的区间内。
 */
function isAllowed(normalizedText, word) {
  let idx = normalizedText.indexOf(word);
  while (idx !== -1) {
    const covered = normalizedAllowWords.some((allow) => {
      let p = normalizedText.indexOf(allow);
      while (p !== -1) {
        if (p <= idx && idx + word.length <= p + allow.length) return true;
        p = normalizedText.indexOf(allow, p + 1);
      }
      return false;
    });
    if (!covered) return false;
    idx = normalizedText.indexOf(word, idx + 1);
  }
  return true;
}

/**
 * 白名单豁免（有界间隔版）：命中片段 skeleton[start, end) 是否落在某个白名单长词的覆盖范围内。
 * 白名单本身同样容忍插字，例如「电一信诈骗防范」仍可豁免「电信诈骗」。
 */
function gapAllowed(skeleton, start, end) {
  return normalizedAllowWords.some((allow) => {
    if (allow.length <= end - start) return false; // 白名单词必须比命中片段更长才算语境覆盖
    for (let i = 0; i <= skeleton.length - allow.length; i++) {
      const e = matchWithGap(skeleton, i, allow, GAP_MAX);
      if (e !== -1 && i <= start && end <= e) return true;
    }
    return false;
  });
}

/**
 * 在单段文本中查找敏感词。
 * 三通道匹配，任一命中即算命中（同一个词只报一次）：
 *   1/2. normalize 文本 + 去噪骨架  → 精确匹配
 *   3.   骨架 + 有界间隔子序列      → 容忍字间插入填充字符
 * @returns {{ word: string, category: string }[]}
 */
export function findHits(text) {
  const base = normalize(text);
  if (!base) return [];

  const skeleton = toSkeleton(text);
  const variants = skeleton && skeleton !== base ? [base, skeleton] : [base];

  const seen = new Set();
  const hits = [];

  // 通道 1/2：精确匹配
  for (const variant of variants) {
    // 只遍历文本里真实出现过的字符，命中桶才做 includes 判定
    for (const ch of new Set(variant)) {
      const bucket = BUCKETS.get(ch);
      if (!bucket) continue;
      for (const { word, category } of bucket) {
        if (seen.has(word) || !variant.includes(word)) continue;
        if (isAllowed(variant, word)) continue;
        seen.add(word);
        hits.push({ word, category });
      }
    }
  }

  // 通道 3：容忍插字的近似匹配（仅 >= 3 字的词）
  for (let i = 0; i < skeleton.length; i++) {
    const bucket = GAP_BUCKETS.get(skeleton[i]);
    if (!bucket) continue;
    for (const { word, category } of bucket) {
      if (seen.has(word)) continue;
      const end = matchWithGap(skeleton, i, word, GAP_MAX);
      if (end === -1) continue;
      // 命中片段本身越过了插字（比原词更长）时，才需要走白名单语境判定
      if (end - i > word.length && gapAllowed(skeleton, i, end)) continue;
      seen.add(word);
      hits.push({ word, category });
    }
  }

  return hits;
}

/**
 * 批量校验多个字段。
 * @param {{ title?: string, summary?: string, content?: string, category?: string, tags?: string[] }} fields
 * @returns {{ ok: boolean, hits: { field: string, fieldLabel: string, word: string, category: string }[] }}
 */
export function checkContent(fields) {
  if (!contentFilterEnabled) return { ok: true, hits: [] };

  const hits = [];
  for (const [field, fieldLabel] of Object.entries(FIELD_LABELS)) {
    const value = fields?.[field];
    if (value == null) continue;
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      for (const hit of findHits(item)) {
        hits.push({ field, fieldLabel, word: hit.word, category: hit.category });
      }
    }
  }

  return { ok: hits.length === 0, hits };
}
