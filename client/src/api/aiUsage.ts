/**
 * 大模型 Token 成本统计 API
 * 后端：Express + MongoDB，路由前缀 /api/ai-usage（仅管理员可访问）
 */
import { requestClient } from './request';

export type AiScene = 'article' | 'chat' | 'image';

export interface AiUsageOverview {
  days: number;
  overview: {
    calls: number;
    successCalls: number;
    failedCalls: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    units: number;
    cost: number;
    avgCostPerCall: number;
    estimatedCalls: number;
    unknownModelCalls: number;
  };
  today: {
    calls: number;
    totalTokens: number;
    cost: number;
  };
}

export interface AiUsageTrendItem {
  date: string;
  calls: number;
  tokens: number;
  cost: number;
}

export interface AiUsageTrend {
  days: number;
  trend: AiUsageTrendItem[];
}

export interface AiUsageDistributionItem {
  name: string;
  label: string;
  calls: number;
  tokens: number;
  cost: number;
}

export interface AiUsageDistribution {
  by: 'model' | 'scene';
  days: number;
  items: AiUsageDistributionItem[];
}

export interface AiUsageItem {
  _id: string;
  scene: AiScene;
  model: string;
  unit: 'token' | 'image';
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  units: number;
  cost: number;
  estimated: boolean;
  unknownModel: boolean;
  user: { userId: string | null; username: string; role: string };
  sessionId: string;
  success: boolean;
  statusCode: number;
  errorMessage: string;
  durationMs: number;
  createdAt: string;
}

export interface AiUsageListResult {
  list: AiUsageItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AiUsageQuery {
  page?: number;
  pageSize?: number;
  scene?: AiScene;
  model?: string;
  success?: string;
  keyword?: string;
  startTime?: string;
  endTime?: string;
}

export interface AiPricingItem {
  model: string;
  unit: 'token' | 'image';
  label: string;
  inputPricePerK?: number;
  outputPricePerK?: number;
  pricePerImage?: number;
  note?: string;
}

export interface AiPricingResult {
  scenes: { value: AiScene; label: string }[];
  items: AiPricingItem[];
}

export function getAiUsageOverviewApi(days = 14) {
  return requestClient.get<AiUsageOverview>('/ai-usage/overview', { params: { days } });
}

export function getAiUsageTrendApi(days = 14) {
  return requestClient.get<AiUsageTrend>('/ai-usage/trend', { params: { days } });
}

export function getAiUsageDistributionApi(by: 'model' | 'scene' = 'model', days = 14) {
  return requestClient.get<AiUsageDistribution>('/ai-usage/distribution', {
    params: { by, days },
  });
}

export function getAiUsageListApi(params: AiUsageQuery = {}) {
  return requestClient.get<AiUsageListResult>('/ai-usage/list', { params });
}

export function getAiUsagePricingApi() {
  return requestClient.get<AiPricingResult>('/ai-usage/pricing');
}

/** 场景字典，与后端 config/modelPricing.js 的 SCENE_LABELS 保持一致 */
export const AI_SCENE_OPTIONS: { value: AiScene; label: string; color: string }[] = [
  { value: 'article', label: '文章生成', color: 'blue' },
  { value: 'chat', label: '智能客服', color: 'green' },
  { value: 'image', label: '文生图', color: 'purple' },
];
