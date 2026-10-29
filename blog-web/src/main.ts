import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { handleTokenCallback } from './api';
import './style.css';

/**
 * 启动前先初始化登录态：
 *  - 处理 CMS「博客前台」菜单跳转带来的 ?token=（存 localStorage 并清理 URL）
 *  - 拉 /auth/me 刷新用户名与角色，供评论登录态、智能客服显隐判断使用
 */
(async function bootstrap() {
  await handleTokenCallback();
  createApp(App).use(router).mount('#app');
})();
