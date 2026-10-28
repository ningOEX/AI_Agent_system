# ============================================================
# 后端镜像：Express + Mongoose
# 构建上下文：./server
# ============================================================
FROM node:22-alpine

WORKDIR /app

# pnpm 是项目使用的包管理器（存在 pnpm-lock.yaml）
RUN npm i -g pnpm@10 --registry=https://registry.npmmirror.com

# 先只装依赖，利用 Docker 层缓存：源码改动不会触发重装
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --registry=https://registry.npmmirror.com

# 再拷贝源码
COPY . .

# 运行期需要的目录（上传文件通过 volume 挂载覆盖，这里保证目录存在）
RUN mkdir -p /app/uploads

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

CMD ["node", "index.js"]
