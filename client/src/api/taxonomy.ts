import { requestClient } from './request';

export interface CategoryItem {
  _id: string;
  name: string;
  nameLower: string;
  color?: string;
  useCount: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TagItem {
  _id: string;
  name: string;
  nameLower: string;
  color?: string;
  useCount: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

// ---- 分类 ----
export function getCategoriesApi() {
  return requestClient.get<CategoryItem[]>('/categories');
}

export function createCategoryApi(data: { name: string; color?: string }) {
  return requestClient.post<CategoryItem>('/categories', data);
}

export function updateCategoryApi(id: string, data: { name?: string; color?: string }) {
  return requestClient.put<CategoryItem>(`/categories/${id}`, data);
}

export function deleteCategoryApi(id: string) {
  return requestClient.delete<{ ok: boolean }>(`/categories/${id}`);
}

// ---- 标签 ----
export function getTagsApi() {
  return requestClient.get<TagItem[]>('/tags');
}

export function createTagApi(data: { name: string; color?: string }) {
  return requestClient.post<TagItem>('/tags', data);
}

export function updateTagApi(id: string, data: { name?: string; color?: string }) {
  return requestClient.put<TagItem>(`/tags/${id}`, data);
}

export function deleteTagApi(id: string) {
  return requestClient.delete<{ ok: boolean }>(`/tags/${id}`);
}
