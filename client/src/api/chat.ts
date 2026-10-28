/**
 * 智能客服管理 API
 * 后端：/api/chat（FAQ 公开读取；FAQ 管理与会话记录仅 admin）
 */
import { requestClient } from './request';

export interface FaqItem {
  _id: string;
  question: string;
  answer: string;
  category: string;
  keywords: string[];
  followUps: string[];
  order: number;
  enabled: boolean;
  hitCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FaqPayload {
  question: string;
  answer: string;
  category?: string;
  keywords?: string[];
  followUps?: string[];
  order?: number;
  enabled?: boolean;
}

export interface ChatSessionItem {
  _id: string;
  sessionId: string;
  unhandled: boolean;
  lastMessageAt: string;
  createdAt: string;
  messageCount: number;
  lastMessage: string;
}

export interface ChatSessionDetail {
  _id: string;
  sessionId: string;
  unhandled: boolean;
  lastMessageAt: string;
  createdAt: string;
  messages: {
    _id: string;
    role: 'user' | 'assistant';
    content: string;
    source?: string;
    createdAt: string;
  }[];
}

export async function getFaqListApi() {
  return requestClient.get<{ list: FaqItem[] }>('/chat/faqs');
}

export async function createFaqApi(data: FaqPayload) {
  return requestClient.post<FaqItem>('/chat/faqs', data);
}

export async function updateFaqApi(id: string, data: Partial<FaqPayload>) {
  return requestClient.put<FaqItem>(`/chat/faqs/${id}`, data);
}

export async function deleteFaqApi(id: string) {
  return requestClient.delete<{ ok: boolean }>(`/chat/faqs/${id}`);
}

export async function getChatSessionsApi(params: {
  page?: number;
  pageSize?: number;
  unhandled?: boolean;
}) {
  return requestClient.get<{
    list: ChatSessionItem[];
    total: number;
    page: number;
    pageSize: number;
  }>('/chat/sessions', { params });
}

export async function getChatSessionDetailApi(sessionId: string) {
  return requestClient.get<ChatSessionDetail>(`/chat/sessions/${sessionId}`);
}

export async function markSessionHandledApi(sessionId: string) {
  return requestClient.put<{ ok: boolean }>(`/chat/sessions/${sessionId}/handled`);
}

export async function deleteChatSessionApi(sessionId: string) {
  return requestClient.delete<{ ok: boolean }>(`/chat/sessions/${sessionId}`);
}

export async function batchDeleteChatSessionsApi(sessionIds: string[]) {
  return requestClient.delete<{ ok: boolean; deleted: number }>('/chat/sessions', {
    data: { sessionIds },
  });
}

export async function replyChatSessionApi(sessionId: string, reply: string) {
  return requestClient.post<{ ok: boolean }>(`/chat/sessions/${sessionId}/reply`, { reply });
}
