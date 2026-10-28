/**
 * Comment 评论管理 API
 * 后端：Express + MongoDB，路由前缀 /api/comments（admin）+ /api/public/blogs/:id/comments（公开）
 */
import { requestClient } from './request';

export type CommentStatus = 'pending' | 'approved' | 'rejected';

export interface AdminCommentItem {
  _id: string;
  blogId: { _id: string; title: string } | null;
  userId: { _id: string; username: string; avatar?: string } | null;
  nickname: string;
  email: string;
  content: string;
  parentId: string | null;
  rootId: string | null;
  replyToNickname: string;
  status: CommentStatus;
  ip: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommentListResult {
  items: AdminCommentItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CommentListQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: CommentStatus;
  blogId?: string;
}

export function getCommentListApi(params: CommentListQuery = {}): Promise<CommentListResult> {
  return requestClient.get<CommentListResult>('/comments', { params });
}

export function getCommentStatsApi(): Promise<{
  byStatus: Record<CommentStatus, number>;
  todayCount: number;
  total: number;
}> {
  return requestClient.get('/comments/stats');
}

export function updateCommentStatusApi(
  id: string,
  status: CommentStatus,
): Promise<{ _id: string; status: string }> {
  return requestClient.put(`/comments/${id}/status`, { status });
}

export function deleteCommentApi(id: string): Promise<{ message: string; deletedCount: number }> {
  return requestClient.delete(`/comments/${id}`);
}
