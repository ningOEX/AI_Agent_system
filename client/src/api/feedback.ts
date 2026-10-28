import { requestClient } from './request';

export type FeedbackStatus = 'pending' | 'processing' | 'resolved';
export type FeedbackType = 'bug' | 'content' | 'experience' | 'feature' | 'other';

export interface FeedbackItem {
  _id: string;
  userId: string;
  username: string;
  type: FeedbackType;
  title: string;
  content: string;
  status: FeedbackStatus;
  reply: string;
  repliedBy: string;
  repliedAt?: null | string;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackCounts {
  pending: number;
  processing: number;
  resolved: number;
}

export interface FeedbackListResult {
  list: FeedbackItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: FeedbackCounts;
}

export interface FeedbackListQuery {
  page?: number;
  pageSize?: number;
  status?: FeedbackStatus;
  keyword?: string;
}

export interface FeedbackCreateParams {
  title: string;
  content: string;
  type?: FeedbackType;
}

export interface FeedbackReplyParams {
  status: FeedbackStatus;
  reply?: string;
}

/** 提交问题反馈 */
export function createFeedbackApi(data: FeedbackCreateParams) {
  return requestClient.post<FeedbackItem>('/feedback', data);
}

/** 我的反馈列表 */
export function getMyFeedbacksApi(params: FeedbackListQuery) {
  return requestClient.get<FeedbackListResult>('/feedback/mine', { params });
}

/** 全部反馈（管理员） */
export function getAllFeedbacksApi(params: FeedbackListQuery) {
  return requestClient.get<FeedbackListResult>('/feedback', { params });
}

/** 管理员处理并回复反馈 */
export function replyFeedbackApi(id: string, data: FeedbackReplyParams) {
  return requestClient.put<FeedbackItem>(`/feedback/${id}/reply`, data);
}
