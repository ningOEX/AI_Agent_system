export interface ChatFaq {
  _id: string;
  question: string;
  answer: string;
  category: string;
  followUps: string[];
  order: number;
}

export type ChatSource = 'option' | 'faq' | 'ai' | 'fallback' | 'handoff' | 'waiting' | 'admin';

export interface ChatResult {
  full: string;
  source: ChatSource;
  followUps: string[];
  /** true 表示后端静默处理（waiting 模式），前端不应插入 assistant 气泡 */
  silent?: boolean;
}

export interface ChatHistoryMessage {
  _id: string;
  role: 'user' | 'assistant';
  content: string;
  source?: ChatSource;
  createdAt: string;
}

const BASE = '/api/chat';
const SESSION_KEY = 'chat_session_id';

/**
 * 读取后端签发的会话 ID。
 * sessionId 由后端生成并在响应中返回，前端首次请求时传空字符串，
 * 后端返回 sessionId 后由 saveSessionId 持久化，后续请求携带以维持多轮上下文。
 */
export function getChatSessionId(): string {
  return localStorage.getItem(SESSION_KEY) || '';
}

/** 持久化后端签发的 sessionId */
function saveSessionId(id?: string) {
  if (id) localStorage.setItem(SESSION_KEY, id);
}

/** 聊天窗首屏快捷选项 */
export async function fetchFaqs(): Promise<ChatFaq[]> {
  const res = await fetch(`${BASE}/faq`);
  if (!res.ok) throw new Error('加载常见问题失败');
  const data = await res.json();
  return data.list || [];
}

/** 加载当前会话的最近历史消息（含管理员回复），打开客服时调用 */
export async function fetchHistory(): Promise<ChatHistoryMessage[]> {
  const sid = getChatSessionId();
  if (!sid) return [];
  const res = await fetch(`${BASE}/history?sessionId=${encodeURIComponent(sid)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.list || [];
}

interface SendPayload {
  message: string;
  type?: 'text' | 'option' | 'handoff';
  faqId?: string;
}

/**
 * 发送消息：
 * - 命中预设/FAQ 时后端返回 JSON，一次性给出答案
 * - 未命中时后端返回 SSE，边生成边回调 onDelta
 * 两种路径都会把后端签发的 sessionId 写入 localStorage。
 */
export async function sendChat(
  payload: SendPayload,
  onDelta?: (chunk: string) => void,
): Promise<ChatResult> {
  const res = await fetch(`${BASE}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: getChatSessionId(),
      type: payload.type || 'text',
      message: payload.message,
      faqId: payload.faqId,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: '请求失败' }));
    throw new Error(err.message || '请求失败');
  }

  const contentType = res.headers.get('content-type') || '';

  // 命中 FAQ / 选项 / 兜底：直接返回 JSON
  if (contentType.includes('application/json')) {
    const data = await res.json();
    saveSessionId(data.sessionId);
    return {
      full: data.answer || '',
      source: (data.source || 'faq') as ChatSource,
      followUps: data.followUps || [],
      silent: !!data.silent,
    };
  }

  // 流式：逐块回调
  const reader = res.body?.getReader();
  if (!reader) throw new Error('当前浏览器不支持流式响应');

  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let source: ChatSource = 'ai';

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
      if (!raw) continue;

      try {
        const json = JSON.parse(raw);
        if (json.delta) {
          full += json.delta;
          onDelta?.(json.delta);
        }
        if (json.done) {
          if (json.source) source = json.source as ChatSource;
          saveSessionId(json.sessionId);
        }
      } catch {
        // 忽略心跳/异常行
      }
    }
  }

  return { full, source, followUps: [] };
}

/** 重置会话等待模式：打开弹框时调用，清除 awaitingAgent 让自动回复恢复 */
export async function resetChatSession(): Promise<boolean> {
  const sid = getChatSessionId();
  if (!sid) return false;
  try {
    const res = await fetch(`${BASE}/sessions/${encodeURIComponent(sid)}/reset`, {
      method: 'POST',
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.ok;
  } catch {
    return false;
  }
}
