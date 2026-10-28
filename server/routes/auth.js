import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import svgCaptcha from 'svg-captcha';
import User from '../models/User.js';
import Token from '../models/Token.js';
import { requireAuth } from '../middleware/auth.js';
import { registerRules, loginRules } from '../utils/validators.js';
import { saveCaptcha, verifyCaptcha } from '../utils/captchaStore.js';
import { saveSmsCode, verifySmsCode, SMS_SCENES } from '../utils/smsStore.js';

const router = Router();

/** 验证码开关：false 时登录/注册跳过验证码校验（开发调试用，生产环境请保持默认 true） */
const CAPTCHA_ENABLED = process.env.CAPTCHA_ENABLED !== 'false';

/** 签发 JWT 并落库到 tokens 集合：每个登录用户对应一条 token 记录 */
async function issueToken(user, req) {
  const token = jwt.sign(
    { id: user._id, username: user.username },
    process.env.JWT_SECRET,
    // jwtid 保证同一用户在同一秒内多次签发也能得到不同的 JWT，避免 token 唯一索引冲突
    { expiresIn: process.env.JWT_EXPIRES_IN || '2h', jwtid: crypto.randomUUID() }
  );

  const { exp } = jwt.decode(token);
  await Token.create({
    user: user._id,
    token,
    userAgent: req.headers['user-agent'] || '',
    expiresAt: new Date(exp * 1000),
  });

  return token;
}

/** GET /api/auth/captcha 获取图形验证码（防暴力破解：一次性、5 分钟过期） */
router.get('/captcha', (req, res) => {
  const captcha = svgCaptcha.create({
    size: 4,
    ignoreChars: '0oO1ilI9', // 排除易混淆字符
    noise: 2,                // 干扰线数量（过多会遮挡字符，降低可读性）
    color: true,
    // 深色背景：svg-captcha 会据此自动生成「与背景对比鲜明」的亮色字符。
    // 之前用浅灰背景(#f0f2f5)时，字符被生成为浅色系（如 #68eded/#bce73a），
    // 与背景对比度过低导致看不清、反复输错。
    background: '#3d4a5c',
    width: 132,
    height: 44,
    fontSize: 46,
  });
  const captchaId = saveCaptcha(captcha.text);
  res.json({ captchaId, svg: captcha.data });
});

/** POST /api/auth/register 注册 */
router.post('/register', registerRules, async (req, res, next) => {
  try {
    const { username, email, password, captchaId, captchaCode } = req.body;

    // 验证码校验（开发环境可通过 CAPTCHA_ENABLED=false 跳过）
    if (CAPTCHA_ENABLED && !verifyCaptcha(captchaId, captchaCode)) {
      return res.status(422).json({ message: '验证码错误或已过期，请重新输入' });
    }

    const exists = await User.findOne({ $or: [{ username }, { email }] });
    if (exists) {
      const field = exists.username === username ? '用户名' : '邮箱';
      return res.status(409).json({ message: `该${field}已被注册` });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email, password: hashed });

    return res.status(201).json({
      message: '注册成功',
      token: await issueToken(user, req),
      user: { id: user._id, username: user.username, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

/** POST /api/auth/login 登录 */
router.post('/login', loginRules, async (req, res, next) => {
  try {
    const { username, password, captchaId, captchaCode } = req.body;

    // 验证码校验（开发环境可通过 CAPTCHA_ENABLED=false 跳过）
    if (CAPTCHA_ENABLED && !verifyCaptcha(captchaId, captchaCode)) {
      return res.status(422).json({ message: '验证码错误或已过期，请重新输入' });
    }

    // 密码字段默认不返回，这里显式查出用于比对
    const user = await User.findOne({ username }).select('+password');
    if (!user) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    const matched = await bcrypt.compare(password, user.password);
    if (!matched) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    return res.json({
      message: '登录成功',
      token: await issueToken(user, req),
      user: { id: user._id, username: user.username, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/auth/me 获取当前登录用户信息 */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: '用户不存在' });

    return res.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar || '',
        // 安全绑定字段
        phone: user.phone || '',
        secretQuestion: user.secretQuestion || '',
        backupEmail: user.backupEmail || '',
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

/** PUT /api/auth/profile 更新当前用户资料（头像 + 安全绑定字段）
 *
 * 前端可以传以下任意字段（部分更新）：
 *   { avatar, phone, secretQuestion, secretAnswer, backupEmail }
 *
 * 解绑方式：传空字符串（例如 { phone: '' } 即清除绑定）
 * 不允许传：username / email / password / role（这些有独立接口或不可修改）
 */
router.put('/profile', requireAuth, async (req, res, next) => {
  try {
    const { avatar, phone, secretQuestion, secretAnswer, backupEmail } = req.body || {};
    const fields = {};

    // —— avatar ——
    if (typeof avatar === 'string') {
      if (avatar.length > 500) return res.status(422).json({ message: '头像 URL 过长' });
      fields.avatar = avatar.trim();
    }

    // —— phone —— 中国手机号正则；空串=解绑
    if (phone !== undefined) {
      const p = String(phone).trim();
      if (p === '') {
        fields.phone = '';
      } else if (!/^1[3-9]\d{9}$/.test(p)) {
        return res.status(422).json({ message: '手机号格式不正确' });
      } else {
        fields.phone = p;
      }
    }

    // —— secretQuestion + secretAnswer —— 两个一起设或一起清空
    if (secretQuestion !== undefined || secretAnswer !== undefined) {
      const q = String(secretQuestion ?? '').trim();
      const a = String(secretAnswer ?? '').trim();
      if (q === '' && a === '') {
        fields.secretQuestion = '';
        fields.secretAnswer = '';
      } else if (q === '' || a === '') {
        return res.status(422).json({ message: '密保问题和答案必须同时设置' });
      } else if (q.length > 100) {
        return res.status(422).json({ message: '密保问题过长' });
      } else if (a.length > 200) {
        return res.status(422).json({ message: '密保答案过长' });
      } else {
        fields.secretQuestion = q;
        fields.secretAnswer = a;
      }
    }

    // —— backupEmail —— 邮箱正则；空串=解绑
    if (backupEmail !== undefined) {
      const e = String(backupEmail).trim().toLowerCase();
      if (e === '') {
        fields.backupEmail = '';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        return res.status(422).json({ message: '邮箱格式不正确' });
      } else {
        fields.backupEmail = e;
      }
    }

    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ message: '没有可更新的字段' });
    }

    const user = await User.findByIdAndUpdate(req.user.id, fields, { new: true });
    return res.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar || '',
        phone: user.phone || '',
        secretQuestion: user.secretQuestion || '',
        backupEmail: user.backupEmail || '',
      },
    });
  } catch (err) {
    // Mongoose schema match 校验失败也会走到这里
    if (err?.errors) {
      const msgs = Object.values(err.errors).map((e) => e.message).join('；');
      return res.status(422).json({ message: msgs });
    }
    next(err);
  }
});

/**
 * POST /api/auth/logout 退出登录：删除当前 token 记录，使其立即失效
 * 退出登录必须幂等：无论是否携带凭证、凭证是否有效/已清除，都返回成功。
 * 否则前端在 token 已失效或已清空时调用登出会收到 401「未提供登录凭证」的报错提示。
 */
router.post('/logout', async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (token) {
      await Token.deleteOne({ token });
    }
    return res.json({ message: '已退出登录' });
  } catch (err) {
    next(err);
  }
});

/** GET /api/auth/tokens 查看当前用户所有有效登录记录（token 已脱敏） */
router.get('/tokens', requireAuth, async (req, res, next) => {
  try {
    const list = await Token.find({ user: req.user.id }).sort({ createdAt: -1 });
    return res.json({
      tokens: list.map((item) => ({
        id: item._id,
        token: `${item.token.slice(0, 18)}...`, // 仅展示前缀，避免完整凭证泄露
        userAgent: item.userAgent,
        current: item.token === req.authToken,
        expiresAt: item.expiresAt,
        createdAt: item.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ================================================================
//                        密码修改 / 找回
// ================================================================

const PHONE_REGEX = /^1[3-9]\d{9}$/;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 100;

/**
 * POST /api/auth/send-sms
 *
 * 发送 6 位数字验证码到手机号（开发环境直接在响应里把 code 明文返回，
 * 省掉真实 SMS 服务；生产环境把 return 里的 code 删掉即可）。
 *
 * Body: { phone, scene: 'change' | 'reset' }
 *   scene=change → 已登录改密码（需要用户 phone 字段已绑定且匹配）
 *   scene=reset  → 未登录找回密码（手机号需存在于用户表）
 */
router.post('/send-sms', async (req, res, next) => {
  try {
    const { phone, scene } = req.body || {};
    if (!phone || !PHONE_REGEX.test(phone)) {
      return res.status(422).json({ message: '手机号格式不正确' });
    }
    if (!scene || !Object.values(SMS_SCENES).includes(scene)) {
      return res.status(422).json({ message: 'scene 无效' });
    }

    // scene 校验：手机号必须存在且场景匹配
    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ message: '该手机号未绑定任何账号' });
    }

    // 已登录改密码场景：额外要求当前登录用户就是这个手机的所有者
    if (scene === SMS_SCENES.CHANGE) {
      // 可选：如果带了 token，校验一下；没带也允许（比如刚绑定完手机马上就发）
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : null;
      if (token) {
        try {
          const payload = jwt.verify(token, process.env.JWT_SECRET);
          if (payload.id !== String(user._id)) {
            return res.status(403).json({ message: '该手机号与当前登录账号不匹配' });
          }
        } catch { /* token 无效不阻止发送——用户可能正准备找回 */ }
      }
    }

    const { code, expiresIn } = saveSmsCode(phone, scene);

    // 开发模式（SMS_ENABLED 未开启）直接把 code 告诉前端，便于本地调试；
    // 生产环境开启 SMS_ENABLED=true 后不再返回 code
    const devHint = process.env.SMS_ENABLED !== 'true';
    res.json({
      message: '验证码已发送',
      expiresIn,
      ...(devHint ? { devCode: code } : {}),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/change-password
 *
 * 已登录用户修改密码。两种方式二选一：
 *   A. 旧密码：{ oldPassword, newPassword, confirmPassword }
 *   B. 手机验证码：{ phone, smsCode, newPassword, confirmPassword }
 *
 * Header: Authorization: Bearer <token>  （必须，已登录）
 */
router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { oldPassword, phone, smsCode, newPassword, confirmPassword } = req.body || {};

    // 基础校验
    if (!newPassword || typeof newPassword !== 'string') {
      return res.status(422).json({ message: '请输入新密码' });
    }
    if (newPassword.length < PASSWORD_MIN || newPassword.length > PASSWORD_MAX) {
      return res.status(422).json({ message: `密码长度 ${PASSWORD_MIN}-${PASSWORD_MAX} 位` });
    }
    if (newPassword !== confirmPassword) {
      return res.status(422).json({ message: '两次密码不一致' });
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user) return res.status(401).json({ message: '用户不存在' });

    let verified = false;

    if (oldPassword) {
      // 方式 A：旧密码验证
      const matched = await bcrypt.compare(oldPassword, user.password);
      if (!matched) {
        return res.status(422).json({ message: '旧密码错误' });
      }
      verified = true;
    } else if (phone && smsCode) {
      // 方式 B：手机验证码
      if (user.phone !== phone) {
        return res.status(422).json({ message: '手机号与账号绑定的不一致' });
      }
      if (!verifySmsCode(phone, smsCode, SMS_SCENES.CHANGE)) {
        return res.status(422).json({ message: '验证码错误或已过期' });
      }
      verified = true;
    } else {
      return res.status(422).json({ message: '请提供旧密码或手机验证码' });
    }

    if (!verified) return res.status(422).json({ message: '验证失败' });

    // 更新密码
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    // 强制所有现有 token 失效（密码改了就该重新登录）
    await Token.deleteMany({ user: user._id });

    return res.json({ message: '密码修改成功，请重新登录' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/reset-password
 *
 * 未登录用户通过手机号 + 验证码重置密码。
 * Body: { phone, smsCode, newPassword, confirmPassword }
 */
router.post('/reset-password', async (req, res, next) => {
  try {
    const { phone, smsCode, newPassword, confirmPassword } = req.body || {};

    if (!phone || !PHONE_REGEX.test(phone)) {
      return res.status(422).json({ message: '手机号格式不正确' });
    }
    if (!smsCode) {
      return res.status(422).json({ message: '请输入验证码' });
    }
    if (!newPassword || typeof newPassword !== 'string') {
      return res.status(422).json({ message: '请输入新密码' });
    }
    if (newPassword.length < PASSWORD_MIN || newPassword.length > PASSWORD_MAX) {
      return res.status(422).json({ message: `密码长度 ${PASSWORD_MIN}-${PASSWORD_MAX} 位` });
    }
    if (newPassword !== confirmPassword) {
      return res.status(422).json({ message: '两次密码不一致' });
    }

    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ message: '该手机号未绑定任何账号' });

    if (!verifySmsCode(phone, smsCode, SMS_SCENES.RESET)) {
      return res.status(422).json({ message: '验证码错误或已过期' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    // 踢掉所有已有登录
    await Token.deleteMany({ user: user._id });

    return res.json({ message: '密码重置成功，请用新密码登录' });
  } catch (err) {
    next(err);
  }
});

export default router;
