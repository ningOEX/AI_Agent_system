/**
 * 文件上传 API —— 走后端中转上传（后端内部用 ali-oss client.put 算正确签名）
 * 响应：{ url: string, key?: string, oss?: boolean }
 */
import { requestClient } from './request';

export interface UploadResult {
  url: string;          // 最终可访问的图片 URL（OSS 公网地址 或 本地 /uploads/xxx）
  key?: string;         // OSS 对象 key
  oss?: boolean;        // true=阿里云 OSS, false=本地存储
}

export interface UploadOptions {
  /** 自定义 OSS 目录前缀，比如 'blog/covers'。留空则按 image/YYYY/MM 自动分层 */
  folder?: string;
  /** 'image'（默认）| 'file' */
  type?: 'image' | 'file';
  /** 是否保留原文件名（默认 false，用时间戳+随机串避免重名） */
  keepName?: boolean;
}

/**
 * 上传图片到后端，后端再转发到阿里云 OSS（无 OSS 配置时存本地）
 */
export async function uploadImageApi(file: File, opts: UploadOptions = {}): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  if (opts.folder) formData.append('folder', opts.folder);
  if (opts.type) formData.append('type', opts.type);
  if (opts.keepName) formData.append('keepName', '1');

  // 必须覆盖 requestClient 的默认 'application/json' 头：
  // axios 1.x 遇到「JSON 头 + FormData」会把 FormData 序列化成 JSON（formDataToJSON），
  // 后端 multer 就收不到文件了。设成 multipart 后 axios 会交给浏览器补 boundary。
  return requestClient.post<UploadResult>('/upload/file', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

/**
 * 删除 OSS 对象或本地 uploads/ 下的文件。
 * @param url 完整 OSS URL 或 /uploads/xxx 相对路径
 */
export async function deleteImageApi(url: string): Promise<{ message: string; key: string }> {
  return requestClient.delete('/upload/object', { data: { url } });
}

/**
 * AI 文生图（阿里云百炼 wan2.2-t2i-flash）。
 * 后端下载 DashScope 结果图 → 上传到 OSS → 返回统一的 { url, key, oss }
 *
 * 关于「第一次生成 502、第二次就成功」：开发环境后端由 `node --watch` 启动，
 * 保存任意 server 文件都会硬杀掉子进程并重启，此时正在进行的请求（AI 生成要 10~20 秒）
 * 会被直接重置，Vite 代理据此返回 502 Bad Gateway。这类失败发生在请求真正到达后端之前，
 * 等后端重启完成后重试一次即可成功，所以这里自动重试一次。
 */
export async function aiGenerateImageApi(prompt: string): Promise<UploadResult & { source: 'ai' }> {
  // AI 生成需要 20-40 秒，覆盖 Vben requestClient 默认 10 秒超时；
  // 错误提示由调用方（CoverUploader）负责，避免代理层 502 重试成功后仍弹全局错误提示
  const request = () =>
    requestClient.post(
      '/ai/generate',
      { prompt },
      { skipErrorMessage: true, timeout: 120_000 } as any,
    );

  try {
    return await request();
  } catch (error: any) {
    const status = error?.response?.status;
    // 502/503/504 是代理层/网关层合成的失败（请求没真正到达后端），重试不会产生额外生成费用
    if (status !== 502 && status !== 503 && status !== 504) {
      throw error;
    }
    // 后端重启一般 1 秒内完成，稍等一下再试
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return request();
  }
}
