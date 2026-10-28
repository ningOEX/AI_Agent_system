/**
 * Blog 文章管理 API
 * 后端：Express + MongoDB，路由前缀 /api/blogs
 */
import { requestClient } from './request';

export interface BlogItem {
  _id: string;
  title: string;
  category: string;
  summary: string;
  content: string;
  tags: string[];
  coverImage: string;
  status: 'draft' | 'scheduled' | 'published';
  scheduledAt: string | null;
  publishedAt: string | null;
  author: string;
  views: number;
  featured: boolean;
  // 内容声明：original 原创 / ai AI 生成
  contentType: 'ai' | 'original';
  createdAt: string;
  updatedAt: string;
}

export interface BlogListResult {
  items: BlogItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface BlogCreateParams {
  title: string;
  category: string;
  summary: string;
  content: string;
  tags?: string[];
  coverImage?: string;
  status?: 'draft' | 'scheduled' | 'published';
  scheduledAt?: string | null;
  author?: string;
  contentType?: 'ai' | 'original';
  featured?: boolean;
}

export interface BlogUpdateParams extends Partial<BlogCreateParams> {}

export interface BlogListQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: 'draft' | 'scheduled' | 'published';
  category?: string;
  featured?: boolean;
}

/** 列表（分页） */
export function getBlogListApi(params: BlogListQuery = {}): Promise<BlogListResult> {
  return requestClient.get<BlogListResult>('/blogs', { params });
}

/** 详情 */
export function getBlogByIdApi(id: string): Promise<BlogItem> {
  return requestClient.get<BlogItem>(`/blogs/${id}`);
}

/** 新建 */
export function createBlogApi(data: BlogCreateParams): Promise<BlogItem> {
  return requestClient.post<BlogItem>('/blogs', data);
}

/** 更新 */
export function updateBlogApi(id: string, data: BlogUpdateParams): Promise<BlogItem> {
  return requestClient.put<BlogItem>(`/blogs/${id}`, data);
}

/** 删除 */
export function deleteBlogApi(id: string): Promise<{ message: string }> {
  return requestClient.delete<{ message: string }>(`/blogs/${id}`);
}

/** 一键切换精选 */
export function toggleBlogFeaturedApi(
  id: string,
  featured: boolean,
): Promise<{ _id: string; featured: boolean }> {
  return requestClient.put(`/blogs/${id}/featured`, { featured });
}

export interface BlogBatchResult {
  matched: number;
  modified: number;
}

/** 批量上架 / 下架（仅 admin） */
export function batchUpdateBlogStatusApi(
  ids: string[],
  status: 'draft' | 'published',
): Promise<BlogBatchResult & { status: string }> {
  return requestClient.put('/blogs/batch/status', { ids, status });
}

/** 批量修改分类（仅 admin） */
export function batchUpdateBlogCategoryApi(
  ids: string[],
  category: string,
): Promise<BlogBatchResult & { category: string }> {
  return requestClient.put('/blogs/batch/category', { ids, category });
}
