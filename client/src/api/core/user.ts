import type { UserInfo } from '@vben/types';

import { requestClient } from '#/api/request';

/** 后端 /api/auth/me 返回的用户结构 */
interface BackendUser {
  createdAt?: string;
  email?: string;
  id: string;
  role?: string;
  username: string;
  avatar?: string;
  phone?: string;
  secretQuestion?: string;
  backupEmail?: string;
}

export interface SecurityBindings {
  phone: string;
  secretQuestion: string;
  backupEmail: string;
}

/**
 * 获取用户信息
 * 后端 GET /api/auth/me 返回 { user }，转换为 Vben 的 UserInfo
 */
export async function getUserInfoApi(): Promise<UserInfo> {
  const { user } = await requestClient.get<{ user: BackendUser }>('/auth/me');
  const role = user.role ?? 'user';
  return {
    avatar: user.avatar || '',
    desc: user.email ?? '',
    homePath: '/dashboard',
    realName: user.username,
    roles: [role],
    token: '',
    userId: String(user.id),
    username: user.username,
  } as UserInfo;
}

/** 更新当前用户资料（头像 + 安全绑定字段，部分更新） */
export async function updateProfileApi(data: {
  avatar?: string;
  phone?: string;
  secretQuestion?: string;
  secretAnswer?: string;
  backupEmail?: string;
}) {
  const { user } = await requestClient.put<{ user: BackendUser }>('/auth/profile', data);
  return {
    avatar: user.avatar || '',
    username: user.username,
    email: user.email,
    role: user.role,
    phone: user.phone || '',
    secretQuestion: user.secretQuestion || '',
    backupEmail: user.backupEmail || '',
  };
}
