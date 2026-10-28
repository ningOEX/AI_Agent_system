import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

import { uploadToOss, hasOss, deleteFromOss, urlToKey } from '../utils/oss.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// ---------- multer 基础配置 ----------
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const uploadsDir = path.resolve('uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const multerOptions = {
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    const isImg = file.mimetype.startsWith('image/');
    if (!isImg) return cb(new Error('只允许图片文件'));
    cb(null, true);
  },
};

// ---------- POST /api/upload/file ----------
/**
 * 统一上传接口：有 OSS 配就传阿里云，没配就落本地 uploads/ 目录。
 * 前端用 FormData 提交字段名 "file"。
 *
 * Response: { url: string, key?: string, oss?: boolean }
 */
const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.bin';
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const diskUpload = multer({ storage: diskStorage, ...multerOptions });

// multer 的 fileFilter 错误默认会被 express 吞掉变成 500，要单独 catch
const handleUpload = (req, res, next) => {
  diskUpload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: '图片不能超过 10MB' });
      }
      if (err.message === '只允许图片文件') {
        return res.status(400).json({ message: '只允许上传图片' });
      }
      return res.status(400).json({ message: err.message || '上传参数错误' });
    }
    next();
  });
};

router.post('/file', handleUpload, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: '没有文件' });

    // 前端可传的可选字段（都通过 FormData 一起传）：
    //   folder    自定义 OSS 目录，比如 'blog/covers'；留空自动 {type}/YYYY/MM
    //   type      'image'（默认）| 'file'，自动目录时作为顶层前缀
    //   keepName  '1' 保留原文件名，其他情况用时间戳+随机串
    const { folder, type = 'image', keepName } = req.body;
    const opts = {
      folder: typeof folder === 'string' && folder.trim() ? folder.trim() : undefined,
      type: type === 'file' ? 'file' : 'image',
      keepName: keepName === '1',
    };

    // 有 OSS → 读磁盘 buffer 上传到云
    if (hasOss) {
      const buf = fs.readFileSync(req.file.path);
      const { fileUrl, key } = await uploadToOss(buf, req.file.originalname, opts);
      // 清理本地临时文件
      fs.promises.unlink(req.file.path).catch(() => {});
      return res.json({ url: fileUrl, key, oss: true });
    }

    // 无 OSS → 按 folder 也分本地目录（uploads/blog/covers/xxx）
    let localDir = uploadsDir;
    let localName = req.file.filename;
    if (opts.folder) {
      localDir = path.join(uploadsDir, opts.folder);
      fs.mkdirSync(localDir, { recursive: true });
      // multer 已经落到 uploads/ 根了，移过去
      fs.renameSync(req.file.path, path.join(localDir, req.file.filename));
      localName = `${opts.folder}/${req.file.filename}`;
    }
    res.json({ url: `/uploads/${localName.replace(/\\/g, '/')}`, oss: false });
  } catch (err) {
    console.error('[upload]', err);
    res.status(500).json({ message: err.message || '上传失败' });
  }
});

// ---------- POST /api/upload/local （旧接口兼容） ----------
router.post('/local', diskUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: '没有文件' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ---------- DELETE /api/upload/object （删 OSS/本地文件） ----------
/**
 * 删除 OSS 对象或本地 uploads/ 下的文件。
 * Body: { url: string }  （完整 URL 或 /uploads/xxx 相对路径，后端自动解析 key）
 */
router.delete('/object', requireAuth, async (req, res, next) => {
  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ message: '缺少 url' });
    const key = urlToKey(url);
    if (!key) return res.status(400).json({ message: '无法解析 key' });
    await deleteFromOss(key);
    res.json({ message: '删除成功', key });
  } catch (err) {
    next(err);
  }
});

export default router;
