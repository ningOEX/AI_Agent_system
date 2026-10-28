/**
 * AI 写作助手 API
 * 后端：POST /api/ai/article（SSE 流式返回 Markdown 正文）
 */
import { useAccessStore } from '@vben/stores';

export type ArticleModel = 'qwen3.7-plus' | 'qwen3.8-flash' | 'qwen3.8-max';
export type ArticleTone = 'casual' | 'deep' | 'popular' | 'technical';
export type ArticleLength = 'long' | 'medium' | 'short';

export interface ArticleGeneratePayload {
  prompt: string;
  title?: string;
  category?: string;
  tone?: ArticleTone;
  length?: ArticleLength;
  model?: ArticleModel;
}

const API_BASE = import.meta.env.VITE_GLOB_API_URL || '/api';

/**
 * 请求生成文章正文，边生成边通过 onDelta 回调追加内容。
 * @returns 完整 Markdown 正文
 */
export async function generateArticleStream(
  payload: ArticleGeneratePayload,
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const accessStore = useAccessStore();

  const res = await fetch(`${API_BASE}/ai/article`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: accessStore.accessToken ? `Bearer ${accessStore.accessToken}` : '',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: '请求失败' }));
    throw new Error(err.message || `请求失败（${res.status}）`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('当前浏览器不支持流式响应');

  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

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
      const raw = line.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;

      try {
        const json = JSON.parse(raw);
        if (json.delta) {
          full += json.delta;
          onDelta(json.delta);
        }
      } catch {
        // 忽略心跳/异常行
      }
    }
  }

  return full;
}
