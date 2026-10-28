import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { handleTokenCallback } from './api';
import './style.css';

// 启动前处理 CMS 登录回跳带回来的 ?token= 参数（一次性换票，清理 URL）
handleTokenCallback();

createApp(App).use(router).mount('#app');
