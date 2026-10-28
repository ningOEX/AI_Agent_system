import OSS from 'ali-oss';
import fs from 'fs';
import path from 'path';

const ACCESS_KEY_ID = process.env.OSS_ACCESS_KEY_ID;
const ACCESS_KEY_SECRET = process.env.OSS_ACCESS_KEY_SECRET;
const ENDPOINT = process.env.OSS_ENDPOINT || 'oss-cn-hangzhou.aliyuncs.com';
const BUCKET = process.env.OSS_BUCKET;

export const hasOss = !!(ACCESS_KEY_ID && ACCESS_KEY_SECRET && BUCKET);

let client = null;
if (hasOss) {
  try {
    client = new OSS({
      accessKeyId: ACCESS_KEY_ID,
      accessKeySecret: ACCESS_KEY_SECRET,
      endpoint: ENDPOINT,
      bucket: BUCKET,
    });
    console.log(`[oss] bucket=${BUCKET} endpoint=${ENDPOINT} 初始化成功`);
  } catch (err) {
    console.error('[oss] 初始化失败:', err.message);
  }
} else {
  console.log('[oss] 未配置 OSS 环境变量，上传将保存到本地 uploads/ 目录');
}

/**
 * 把 Buffer/Stream 上传到阿里云 OSS（后端中转，走 client.put 内部正确签名）。
 *
 * @param {Buffer|Uint8Array|ArrayBuffer|Stream} fileData  文件二进制
 * @param {string} filename     原始文件名（取扩展名）
 * @param {object} [opts]
 * @param {string} [opts.folder]    自定义目录前缀，比如 'blog/covers'。留空则按 {type}/YYYY/MM 自动分层
 * @param {'image'|'file'} [opts.type='image']  上传类型，决定自动分层时的前缀
 * @param {boolean} [opts.keepName=false]   是否保留原文件名（默认用时间戳+随机串，避免重名覆盖）
 * @returns {{ fileUrl: string, key: string }}
 */
export async function uploadToOss(fileData, filename, opts = {}) {
  const { folder, type = 'image', keepName = false } = opts;
  const ext = (filename.split('.').pop() || 'bin').toLowerCase();

  // 目录：自定义 folder 优先，否则 {type}/YYYY/MM 自动分层
  let prefix;
  if (folder && /^[\w\-/.]+$/.test(folder)) {
    prefix = folder.replace(/\/+$/, ''); // 去掉结尾多余 /
  } else {
    const date = new Date();
    const ym = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`;
    prefix = `${type}/${ym}`;
  }

  const baseName = keepName
    ? filename.replace(/\.[^.]+$/, '')
    : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const key = `${prefix}/${baseName}.${ext}`;

  if (!hasOss || !client) {
    throw new Error('OSS 未配置');
  }

  const res = await client.put(key, fileData);

  // Bucket 需设为"公共读"才能直接访问
  const fileUrl = `https://${BUCKET}.${ENDPOINT}/${key}`;
  return { fileUrl, key, ossRes: res };
}

/**
 * 删除 OSS 对象。
 * @param {string} key  对象 key（如 blog/covers/xxx.png），注意不是完整 URL
 */
export async function deleteFromOss(key) {
  if (!key) return;
  if (!hasOss || !client) {
    // 本地模式：从 /uploads/ 里找
    const localPath = path.resolve('uploads', key);
    try { await fs.promises.unlink(localPath); } catch { /* noop */ }
    return;
  }
  try {
    await client.delete(key);
    console.log(`[oss] 已删除 ${key}`);
  } catch (err) {
    console.error(`[oss] 删除失败 ${key}:`, err.message);
  }
}

/**
 * 从完整 OSS URL 中提取 key，用于 deleteFromOss。
 * 例：https://ai-agent-cover.oss-cn-hangzhou.aliyuncs.com/blog/covers/xxx.png → blog/covers/xxx.png
 */
export function urlToKey(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    // pathname 开头有 /
    return u.pathname.replace(/^\/+/, '');
  } catch {
    // 本地 /uploads/xxx 也兼容
    return url.replace(/^\/+/, '');
  }
}
