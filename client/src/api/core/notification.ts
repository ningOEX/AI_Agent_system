import { requestClient } from '#/api/request';

export interface NotificationItem {
  _id: string;
  title: string;
  content: string;
  publisherId: string;
  publisherName: string;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationListResult {
  list: NotificationItem[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getNotificationListApi(params?: {
  page?: number;
  pageSize?: number;
}) {
  return requestClient.get<NotificationListResult>('/notifications', { params });
}

export async function getNotificationByIdApi(id: string) {
  return requestClient.get<NotificationItem>(`/notifications/${id}`);
}

export async function createNotificationApi(data: { title: string; content: string }) {
  return requestClient.post<NotificationItem>('/notifications', data);
}

export async function updateNotificationApi(id: string, data: { title?: string; content?: string }) {
  return requestClient.put<NotificationItem>(`/notifications/${id}`, data);
}

export async function deleteNotificationApi(id: string) {
  return requestClient.delete<{ message: string }>(`/notifications/${id}`);
}

/** 标记单条已读 */
export async function markNotificationReadApi(id: string) {
  return requestClient.put<{ message: string }>(`/notifications/${id}/read`);
}

/** 全部已读 */
export async function markAllNotificationsReadApi() {
  return requestClient.put<{ message: string; count: number }>('/notifications/read-all');
}

/** 获取未读数（顶栏小红点用） */
export async function getUnreadNotificationCountApi() {
  return requestClient.get<{ count: number }>('/notifications/unread-count');
}
