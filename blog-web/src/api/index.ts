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

export interface StoredUser {
  username: string;
  role?: string;
  avatar?: string;
}

export function getStoredUser(): null | StoredUser {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
export function setAuth(token: string, user: StoredUser) {
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
// 管理后台地址：开发 http://localhost:5666、生产 http://123.57.41.200:8081
export const CMS_URL = import.meta.env.VITE_CMS_URL || 'http://localhost:5666';

/** 跳转到 CMS 登录页，登录成功后带 token 跳回当前页 */
export function goLogin() {
  const callback = encodeURIComponent(location.href);
  window.location.href = `${CMS_URL}/?callback=${callback}`;
}

/** 用当前 token 拉取后端用户信息（含角色），失败返回 null */
export async function fetchMeApi(): Promise<null | StoredUser> {
  if (!getStoredToken()) return null;
  try {
    const { data } = await http.get<{ user: StoredUser }>('/auth/me');
    return data.user;
  } catch {
    return null;
  }
}

/**
 * 启动时初始化登录态：
 *  - index.html 的内联脚本已把地址栏 token/role 暂存到 window.__PENDING_AUTH__ 并清理 URL；
 *    这里优先从该暂存取（同时兜底直接读 URL，兼容未经内联脚本的场景）
 *  - 存 token 后用 /auth/me 刷新用户名、角色、头像，保证角色信息准确（JWT 内不含 role）
 *  - 无 token 但本地已有登录态时同样刷新一次，避免角色缺失导致前台模块判断失效
 */
export async function handleTokenCallback(): Promise<void> {
  let token: null | string = null;
  let roleParam: string | undefined;

  const pending = (window as any).__PENDING_AUTH__ as
    | { role?: string; token: null | string }
    | undefined;
  if (pending) {
    delete (window as any).__PENDING_AUTH__;
    token = pending.token;
    roleParam = pending.role;
  } else {
    const params = new URLSearchParams(location.search);
    token = params.get('token');
    roleParam = params.get('role') || undefined;
    if (token || roleParam) {
      // 兜底清理地址栏（正常情况内联脚本已经清过）
      params.delete('token');
      params.delete('role');
      const cleanQuery = params.toString();
      history.replaceState(
        null,
        '',
        `${location.pathname}${cleanQuery ? `?${cleanQuery}` : ''}${location.hash}`,
      );
    }
  }

  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  const user = await fetchMeApi();
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return;
  }

  // /auth/me 不可用时兜底：从 JWT 解出用户名，角色取 URL 参数
  if (token) {
    let username = '用户';
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      username = payload.username || payload.sub || '用户';
    } catch {
      // 解析失败保持默认用户名
    }
    localStorage.setItem(USER_KEY, JSON.stringify({ role: roleParam, username }));
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

// ---------- 个人中心：我的文章（需登录，scope=mine 强制只看自己） ----------
export interface MyBlogItem {
  _id: string;
  title: string;
  category: string;
  summary: string;
  tags: string[];
  coverImage: string;
  views: number;
  featured: boolean;
  contentType?: 'ai' | 'original';
  status: 'draft' | 'published' | 'scheduled';
  publishedAt?: string;
  scheduledAt?: string;
  createdAt: string;
}

export interface MyBlogListResult {
  items: MyBlogItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function getMyBlogsApi() {
  return http
    .get<MyBlogListResult>('/blogs', { params: { pageSize: 100, scope: 'mine' } })
    .then((r) => r.data);
}
