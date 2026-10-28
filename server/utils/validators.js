import { body, validationResult } from 'express-validator';

/** 验证码开关：false 时登录/注册跳过验证码校验（开发调试用，生产环境请保持默认 true） */
const CAPTCHA_ENABLED = process.env.CAPTCHA_ENABLED !== 'false';

/** 统一处理校验结果：有错误则返回 422 + 字段级错误信息 */
export function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      message: errors.array()[0].msg,
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

export const registerRules = [
  body('username')
    .trim()
    .notEmpty().withMessage('用户名不能为空')
    .isLength({ min: 3, max: 20 }).withMessage('用户名长度需为 3-20 个字符')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('用户名只能包含字母、数字和下划线'),
  body('email')
    .trim()
    .notEmpty().withMessage('邮箱不能为空')
    .isEmail().withMessage('邮箱格式不正确'),
  body('password')
    .notEmpty().withMessage('密码不能为空')
    .isLength({ min: 6, max: 32 }).withMessage('密码长度需为 6-32 个字符'),
  ...(CAPTCHA_ENABLED
    ? [
        body('captchaId').notEmpty().withMessage('验证码缺失，请刷新页面'),
        body('captchaCode').trim().notEmpty().withMessage('验证码不能为空'),
      ]
    : []),
  handleValidation,
];

export const loginRules = [
  body('username').trim().notEmpty().withMessage('用户名不能为空'),
  body('password').notEmpty().withMessage('密码不能为空'),
  ...(CAPTCHA_ENABLED
    ? [
        body('captchaId').notEmpty().withMessage('验证码缺失，请刷新页面'),
        body('captchaCode').trim().notEmpty().withMessage('验证码不能为空'),
      ]
    : []),
  handleValidation,
];
