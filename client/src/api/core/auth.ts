import { requestClient } from '#/api/request';

export namespace AuthApi {
  /** 登录接口参数 */
  export interface LoginParams {
    /** 图形验证码字符（由 /auth/captcha 生成的图片中读取） */
    captchaCode?: string;
    /** 图形验证码 id（由 /auth/captcha 返回） */
    captchaId?: string;
    password?: string;
    username?: string;
  }

  /** 登录接口返回值（已转换为前端结构） */
  export interface LoginResult {
    accessToken: string;
    user?: any;
  }

  /** 图形验证码 */
  export interface CaptchaResult {
    captchaId: string;
    svg: string;
  }

  /** 注册接口参数 */
  export interface RegisterParams {
    /** 图形验证码字符 */
    captchaCode?: string;
    /** 图形验证码 id */
    captchaId?: string;
    email?: string;
    password?: string;
    username?: string;
  }

  export interface RefreshTokenResult {
    data: string;
    status: number;
  }
}

/**
 * 获取图形验证码
 * 后端返回 { captchaId, svg }
 */
export async function getCaptchaApi() {
  return requestClient.get<AuthApi.CaptchaResult>('/auth/captcha');
}

/**
 * 登录
 * 后端返回 { message, token, user }，这里转换为 Vben 约定的 { accessToken, user }
 */
export async function loginApi(data: AuthApi.LoginParams) {
  const result = await requestClient.post<{
    message: string;
    token: string;
    user: any;
  }>('/auth/login', data);
  return {
    accessToken: result.token,
    user: result.user,
  } as AuthApi.LoginResult;
}

/**
 * 注册
 * 后端返回 { message, token, user }（201），转换为 { accessToken, user }
 */
export async function registerApi(data: AuthApi.RegisterParams) {
  const result = await requestClient.post<{
    message: string;
    token: string;
    user: any;
  }>('/auth/register', data);
  return {
    accessToken: result.token,
    user: result.user,
  } as AuthApi.LoginResult;
}

/**
 * 刷新 accessToken
 * 现有后端未提供该接口，保留占位（enableRefreshToken 已关闭，不会触发）
 */
export async function refreshTokenApi() {
  return requestClient.post<AuthApi.RefreshTokenResult>('/auth/refresh');
}

/**
 * 退出登录
 * 后端会删除当前 token 的数据库记录
 */
export async function logoutApi() {
  return requestClient.post('/auth/logout');
}

/**
 * 获取用户权限码
 * 后端 /auth/me 返回 { user: { role } }
 * admin → ['admin', 'user'] 全权限
 * user  → ['user'] 仅普通权限
 */
export async function getAccessCodesApi(): Promise<string[]> {
  const { user } = await requestClient.get<{ user: { role?: string } }>('/auth/me');
  const role = user.role ?? 'user';
  return role === 'admin' ? ['admin', 'user'] : ['user'];
}

/** 发送短信验证码 */
export async function sendSmsApi(data: { phone: string; scene: 'change' | 'reset' }) {
  return requestClient.post<{ message: string; expiresIn: number; devCode?: string }>(
    '/auth/send-sms',
    data,
  );
}

/** 已登录修改密码（旧密码方式） */
export async function changePasswordApi(data: {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}) {
  return requestClient.post<{ message: string }>('/auth/change-password', data);
}

/** 已登录修改密码（手机验证码方式） */
export async function changePasswordBySmsApi(data: {
  phone: string;
  smsCode: string;
  newPassword: string;
  confirmPassword: string;
}) {
  return requestClient.post<{ message: string }>('/auth/change-password', data);
}

/** 未登录找回密码 */
export async function resetPasswordApi(data: {
  phone: string;
  smsCode: string;
  newPassword: string;
  confirmPassword: string;
}) {
  return requestClient.post<{ message: string }>('/auth/reset-password', data);
}
