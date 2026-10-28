import axios from 'axios';

const TOKEN_KEY = 'blog_token';
const USER_KEY = 'blog_user';

const http = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

// 自动带 token
http.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 401 清 token
http.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
    return Promise.reject(err);
  },
);

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function getStoredUser(): { username: string; role?: string } | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
export function setAuth(token: string, user: { username: string; role?: string }) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export interface PublicBlogItem {
  _id: string;
  title: string;
  category: string;
  summary: string;
  tags: string[];
  coverImage: string;
  views: number;
  featured: boolean;
  // 内容声明：original 原创 / ai AI 生成
  contentType?: 'ai' | 'original';
  status: string;
  publishedAt: string;
  commentCount?: number;
  userId?: { _id: string; username: string; avatar?: string };
}

export interface PublicBlogDetail extends PublicBlogItem {
  content: string;
  author: string;
}

export interface PublicBlogListResult {
  list: PublicBlogItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CategoryCount { name: string; count: number }
export interface TagCount { name: string; count: number }
export interface ArchiveItem {
  year: number;
  month: number;
  label: string;
  count: number;
  blogs: { _id: string; title: string; publishedAt: string }[];
}

export interface PublicComment {
  _id: string;
  blogId: string;
  userId?: { _id: string; username: string; avatar?: string } | null;
  nickname: string;
  content: string;
  parentId: string | null;
  rootId: string | null;
  replyToNickname: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  replies?: PublicComment[];
  replyCount?: number;
}

export interface PublicCommentTree {
  total: number;
  rootCount: number;
  roots: PublicComment[];
}

export function getPublicBlogCommentsApi(blogId: string) {
  return http.get<PublicCommentTree>(`/public/blogs/${blogId}/comments`).then((r) => r.data);
}

export function createPublicCommentApi(blogId: string, data: {
  content: string;
  parentId?: string;
}) {
  return http.post<{ _id: string; status: string; message: string }>(
    `/public/blogs/${blogId}/comments`, data,
  ).then((r) => r.data);
}

// ---------- 登录 ----------
export const CMS_URL = 'http://localhost:5666';

/** 跳转到 CMS 登录页，登录成功后带 token 跳回当前页 */
export function goLogin() {
  const callback = encodeURIComponent(location.href);
  window.location.href = `${CMS_URL}/?callback=${callback}`;
}

/** 从 URL ?token= 参数换票：存 localStorage 并清理 URL，返回换票后的 user 信息（可能为 null） */
export function handleTokenCallback(): { token: string; username: string } | null {
  const params = new URLSearchParams(location.search);
  const token = params.get('token');
  if (!token) return null;

  // 存 token
  localStorage.setItem(TOKEN_KEY, token);

  // 清掉 URL 里的 token（安全：别留下可分享的带 token URL）
  params.delete('token');
  const cleanQuery = params.toString();
  const cleanUrl = `${location.pathname}${cleanQuery ? '?' + cleanQuery : ''}${location.hash}`;
  history.replaceState(null, '', cleanUrl);

  // 调用后端 /auth/me 拿到 username 存起来
  // （后端如果没有 /auth/me，可以直接从 JWT payload 解）
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const user = { username: payload.username || payload.sub || '用户' };
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return { token, username: user.username };
  } catch {
    return { token, username: '用户' };
  }
}

export function getPublicBlogListApi(params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  category?: string;
  tag?: string;
}) {
  return http.get<PublicBlogListResult>('/public/blogs', { params }).then((r) => r.data);
}

export function getPublicBlogDetailApi(id: string) {
  return http.get<PublicBlogDetail>(`/public/blogs/${id}`).then((r) => r.data);
}

export function getPublicCategoriesApi() {
  return http.get<CategoryCount[]>('/public/categories').then((r) => r.data);
}

export function getPublicTagsApi() {
  return http.get<TagCount[]>('/public/tags').then((r) => r.data);
}

export function getPublicArchiveApi() {
  return http.get<ArchiveItem[]>('/public/archive').then((r) => r.data);
}
