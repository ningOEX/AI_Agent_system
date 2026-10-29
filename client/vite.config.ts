import { defineConfig } from '@vben/vite-config';

export default defineConfig(async () => {
  return {
    application: {},
    vite: {
      resolve: {
        // 修复 vue-router 多副本问题：pnpm 的 .pnpm 目录中存在两份
        // vue-router@5.4.0（peer 解析不同），生产构建时不同 chunk 会各自
        // 打包一份。vue-router 的 routerKey 是模块级 Symbol，两份实例会
        // 导致 useRouter() 注入不到路由，返回 undefined，进而触发
        // "Cannot read properties of undefined (reading 'beforeEach')"。
        dedupe: ['vue-router'],
      },
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
