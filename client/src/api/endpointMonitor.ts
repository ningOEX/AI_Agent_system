/**
 * 接口调用监控 API
 * 后端：Express + MongoDB，路由前缀 /api/endpoint-monitor（仅管理员可访问）
 */
import { requestClient } from './request';

export interface EndpointCallItem {
  _id: string;
  method: string;
  routeKey: string;
  path: string;
  statusCode: number;
  durationMs: number;
  success: boolean;
  catalogId: string;
  user: { userId: string | null; username: string; role: string };
  ip: string;
  createdAt: string;
}

export interface EndpointOverview {
  days: number;
  overview: {
    calls: number;
    successCalls: number;
    failedCalls: number;
    successRate: number;
    error4xx: number;
    error5xx: number;
    avgMs: number;
    maxMs: number;
    uniqueRoutes: number;
    catalogCovered: number;
    catalogCoverage: number;
  };
  today: { calls: number; failedCalls: number };
}

export interface EndpointTrendItem {
  date: string;
  calls: number;
  failedCalls: number;
  avgMs: number;
  maxMs: number;
}

export interface EndpointDistributionItem {
  routeKey?: string;
  name: string;
  group?: string;
  method?: string;
  path?: string;
  auth?: string;
  description?: string;
  calls: number;
  successCalls?: number;
  successRate: number;
  avgMs: number;
}

export interface EndpointListResult {
  list: EndpointCallItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface EndpointCallQuery {
  page?: number;
  pageSize?: number;
  routeKey?: string;
  statusCode?: number;
  success?: string;
  keyword?: string;
  startTime?: string;
  endTime?: string;
}

export interface EndpointCatalogItem {
  method: string;
  path: string;
  group: string;
  name: string;
  description: string;
  auth: string;
  params?: {
    path?: { name: string; type: string; required?: boolean; desc?: string }[];
    query?: { name: string; type: string; required?: boolean; desc?: string }[];
    body?: { name: string; type: string; required?: boolean; desc?: string }[];
  };
  response?: string;
  notes?: string;
}

export interface EndpointRouteDetail {
  routeKey: string;
  days: number;
  catalog: EndpointCatalogItem | null;
  stats: {
    calls: number;
    successCalls: number;
    failedCalls: number;
    successRate: number;
    avgMs: number;
    minMs: number;
    maxMs: number;
    error4xx: number;
    error5xx: number;
  } | null;
  recent: EndpointCallItem[];
}

export interface CatalogResult {
  groups: { value: string; label: string }[];
  items: (EndpointCatalogItem & { id: string })[];
}

export function getEndpointOverviewApi(days = 14) {
  return requestClient.get<EndpointOverview>('/endpoint-monitor/overview', { params: { days } });
}

export function getEndpointTrendApi(days = 14) {
  return requestClient.get<{ days: number; trend: EndpointTrendItem[] }>('/endpoint-monitor/trend', {
    params: { days },
  });
}

export function getEndpointDistributionApi(
  by: 'route' | 'group' | 'status' = 'route',
  days = 14,
) {
  return requestClient.get<{ by: string; days: number; items: EndpointDistributionItem[] }>(
    '/endpoint-monitor/distribution',
    { params: { by, days } },
  );
}

export function getEndpointListApi(params: EndpointCallQuery = {}) {
  return requestClient.get<EndpointListResult>('/endpoint-monitor/list', { params });
}

export function getEndpointCatalogApi() {
  return requestClient.get<CatalogResult>('/endpoint-monitor/catalog');
}

export function getEndpointRouteDetailApi(routeKey: string, days = 14) {
  return requestClient.get<EndpointRouteDetail>(
    `/endpoint-monitor/route/${encodeURIComponent(routeKey)}`,
    { params: { days } },
  );
}
