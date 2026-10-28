import type { Recordable, UserInfo } from '@vben/types';

import { ref } from 'vue';
import { useRouter } from 'vue-router';

import { LOGIN_PATH } from '@vben/constants';
import { preferences } from '@vben/preferences';
import { resetAllStores, useAccessStore, useUserStore } from '@vben/stores';

import { notification } from 'ant-design-vue';
import { defineStore } from 'pinia';

import { getAccessCodesApi, getUserInfoApi, loginApi, logoutApi, registerApi } from '#/api';
import { $t } from '#/locales';

export const useAuthStore = defineStore('auth', () => {
  const accessStore = useAccessStore();
  const userStore = useUserStore();
  const router = useRouter();

  const loginLoading = ref(false);

  /**
   * 登录 / 注册后自动登录共用的主流程：
   *  - loginApi：账号密码登录（params 直接传给后端）
   *  - registerApi：注册（参数需拆 email/password/username + captchaId/code）
   *  两个接口都返回 { accessToken, user }，拿到 token 后走完全相同的 store 初始化链路。
   */
  async function authLogin(
    params: Recordable<any>,
    options?: {
      /** 注册场景：带上 email */
      isRegister?: boolean;
      onSuccess?: () => Promise<void> | void;
    },
  ) {
    let userInfo: null | UserInfo = null;
    let accessToken = '';
    try {
      loginLoading.value = true;

      if (options?.isRegister) {
        // 注册分支：调 registerApi 后后端自动签发 token
        const { captchaCode, captchaId, email, password, username } = params;
        const res = await registerApi({ captchaCode, captchaId, email, password, username });
        accessToken = res.accessToken;
      } else {
        accessToken = (await loginApi(params)).accessToken;
      }

      if (accessToken) {
        accessStore.setAccessToken(accessToken);

        const [fetchUserInfoResult, accessCodes] = await Promise.all([
          fetchUserInfo(),
          getAccessCodesApi(),
        ]);

        userInfo = fetchUserInfoResult;

        userStore.setUserInfo(userInfo);
        accessStore.setAccessCodes(accessCodes);

        if (accessStore.loginExpired) {
          accessStore.setLoginExpired(false);
        } else {
          // 优先走外部 callback（blog-web 等前台站点登录后回跳）
          const callback = router.currentRoute.value.query.callback as string | undefined;
          if (callback) {
            const finalUrl = `${decodeURIComponent(callback)}${callback.includes('?') ? '&' : '?'}token=${accessToken}`;
            // 跳回前台并带 token 做一次性换票
            window.location.href = finalUrl;
            return;
          }
          options?.onSuccess
            ? await options.onSuccess()
            : await router.push(
                userInfo.homePath || preferences.app.defaultHomePath,
              );
        }

        if (userInfo?.realName) {
          notification.success({
            description: `${$t('authentication.loginSuccessDesc')}:${userInfo?.realName}`,
            duration: 3,
            message: options?.isRegister
              ? '注册成功，已自动登录'
              : $t('authentication.loginSuccess'),
          });
        }
      }
    } finally {
      loginLoading.value = false;
    }

    return { userInfo };
  }

  async function logout(redirect: boolean = true) {
    try {
      await logoutApi();
    } catch {
      // 不做任何处理
    }
    resetAllStores();
    accessStore.setLoginExpired(false);

    // 已经在登录页时不能再带 redirect：此时 currentRoute.fullPath 就是登录页本身，
    // 再编码一层会得到「登录页?redirect=编码后的登录页」，下一次又在这个基础上再包一层，
    // 反复登出会让 URL 逐跳变长，且没有上限。
    // On the login page the current route is the login page itself, so carrying it as
    // `redirect` would nest one more encoded layer on every repeat.
    const currentRoute = router.currentRoute.value;
    const alreadyOnLogin = currentRoute.path === LOGIN_PATH;

    // 回登录页带上当前路由地址
    await router.replace({
      path: LOGIN_PATH,
      query:
        redirect && !alreadyOnLogin
          ? { redirect: encodeURIComponent(currentRoute.fullPath) }
          : {},
    });
  }

  async function fetchUserInfo() {
    const userInfo = await getUserInfoApi();
    userStore.setUserInfo(userInfo);
    return userInfo;
  }

  function $reset() {
    loginLoading.value = false;
  }

  return {
    $reset,
    authLogin,
    fetchUserInfo,
    loginLoading,
    logout,
  };
});
