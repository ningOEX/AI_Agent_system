/**
 * 操作留痕（审计日志）管理 API
 * 后端：Express + MongoDB，路由前缀 /api/audit-logs
 */
import { requestClient } from './request';

export type AuditAction = 'create' | 'delete' | 'update';

export interface AuditOperator {
  userId: string | null;
  username: string;
  role: string;
}

export interface AuditLogItem {
  _id: string;
  action: AuditAction;
  module: string;
  moduleLabel: string;
  method: string;
  path: string;
  targetId: string;
  targetIds: string[];
  targetLabel: string;
  operator: AuditOperator;
  ip: string;
  statusCode: number;
  success: boolean;
  errorMessage: string;
  restored: boolean;
  restoredAt: string | null;
  restoredBy: string;
  /** 同一操作对象的改动总次数（列表按对象聚合后附加，仅在列表接口返回） */
  changeCount?: number;
  createdAt: string;
  updatedAt: string;
}

/** 详情比列表多出变更前/后的完整快照 */
export interface AuditLogDetail extends AuditLogItem {
  before: unknown;
  after: unknown;
}

export interface AuditLogListResult {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AuditLogQuery {
  page?: number;
  pageSize?: number;
  module?: string;
  action?: AuditAction;
  keyword?: string;
  startTime?: string;
  endTime?: string;
}

/** 留痕列表（分页 + 筛选） */
export function getAuditLogListApi(params: AuditLogQuery = {}): Promise<AuditLogListResult> {
  return requestClient.get<AuditLogListResult>('/audit-logs', { params });
}

/** 留痕详情（含变更前/后快照） */
export function getAuditLogDetailApi(id: string): Promise<AuditLogDetail> {
  return requestClient.get<AuditLogDetail>(`/audit-logs/${id}`);
}

/** 同一操作对象的全部改动记录（时间倒序，不含快照） */
export function getAuditLogHistoryApi(id: string): Promise<AuditLogItem[]> {
  return requestClient.get<AuditLogItem[]>(`/audit-logs/${id}/history`);
}

/** 一键恢复到变更前 */
export function restoreAuditLogApi(id: string): Promise<{ message: string }> {
  return requestClient.post<{ message: string }>(`/audit-logs/${id}/restore`);
}

/** 前端筛选用模块字典，与后端 middleware/auditTrail.js 保持一致 */
export const AUDIT_MODULES: { label: string; value: string }[] = [
  { label: '博客文章', value: 'blog' },
  { label: '分类', value: 'category' },
  { label: '标签', value: 'tag' },
  { label: '评论', value: 'comment' },
  { label: '通知公告', value: 'notification' },
  { label: '问题反馈', value: 'feedback' },
  { label: '用户', value: 'user' },
  { label: '客服问答', value: 'faq' },
  { label: '客服会话', value: 'chatSession' },
  { label: '文件上传', value: 'upload' },
];

export const AUDIT_ACTIONS: { color: string; label: string; value: AuditAction }[] = [
  { color: 'green', label: '新增', value: 'create' },
  { color: 'blue', label: '修改', value: 'update' },
  { color: 'red', label: '删除', value: 'delete' },
];
