import { defineConfig } from '@vben/vite-config';

export default defineConfig(async () => {
  return {
    application: {},
    vite: {
      server: {
        proxy: {
          '/api': {
            changeOrigin: true,
            // 转发到本地 Express 后端（后端路由本身带 /api 前缀）
            target: 'http://localhost:5000',
            ws: true,
          },
        },
      },
    },
  };
});
