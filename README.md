# AI Agent 博客系统

一个「博客 + 后台管理 + 智能客服」三端一体的内容平台：前台面向访客阅读文章并可使用客服对话，后台面向管理员管理内容、处理客服会话、查看接口与 AI 用量监控。

## 技术栈

| 模块 | 技术 |
|---|---|
| 后端 `server` | Node.js 22 + Express 4 + Mongoose 8 + JWT，SSE 流式输出 |
| 后台 `client` | Vue 3 + Vite + [Vben Admin 5](https://github.com/vbenjs/vue-vben-admin) + Ant Design Vue + pnpm workspace |
| 前台 `blog-web` | Vue 3 + Vite + Tailwind CSS |
| 数据库 | MongoDB（本地 mongod 或容器） |
| 部署 | Docker Compose + Nginx |

## 目录结构

```
.
├── server/                 # 后端 API（端口 5000）
│   ├── routes/             # 业务路由（auth / blogs / chat / ai / stats ...）
│   ├── models/             # Mongoose 模型
│   ├── middleware/         # 鉴权、接口埋点、操作留痕
│   └── config/apiCatalog.js# 手写维护的接口目录（同时驱动接口监控页）
├── client/                 # 后台管理 CMS（开发端口 5666）
├── blog-web/               # 前台博客（开发端口 3000）
├── nginx/
│   └── default.conf.template   # 生产网关配置（启动时 envsubst 渲染）
├── Dockerfile.web          # 三阶段构建：blog-web → client → Nginx
├── docker-compose.yml      # mongo + api + web 三个服务
└── .env.example            # 生产环境变量模板
```

## 本地开发

### 前置条件

- Node.js **≥ 22**（`client` 的 engines 要求）
- pnpm **≥ 10**（仅 `client` 需要）
- MongoDB **≥ 6**（本机安装，或用仓库自带脚本启动）

### 启动步骤

```bash
# 1. 启动本地 MongoDB（Windows，PowerShell）
./start-mongodb.ps1

# 2. 后端（端口 5000，node --watch 热重载）
cd server
cp .env.example .env        # Windows: copy .env.example .env
pnpm install
pnpm dev

# 3. 后台管理（端口 5666）
cd client
pnpm install
pnpm dev

# 4. 前台博客（端口 3000）
cd blog-web
npm install
npm run dev
```

两个前端的 Vite 都已把 `/api` 代理到 `http://localhost:5000`，无需额外配置跨域。

### 预置账号

后端首次启动会自动创建两个账号（见 [server/utils/seedDemoUser.js](server/utils/seedDemoUser.js)）：

| 用户名 | 密码 | 角色 |
|---|---|---|
| `admin` | `admin123` | 管理员，可访问全部模块 |
| `demo` | `123456` | 普通用户，仅分析页 |

`CAPTCHA_ENABLED=true` 时登录需输入图形验证码。

## 功能模块

- **博客管理**：文章 CRUD、草稿 / 定时发布 / 上下架、分类与标签、评论审核
- **媒体上传**：默认落本地 `server/uploads/`；配齐 OSS 四项后自动切换阿里云 OSS 直传
- **AI 能力**：AI 写作（SSE 流式返回）、文生图（DashScope `wan2.2-t2i-flash`）
- **智能客服**：FAQ 匹配 → 兜底回复 → 转人工；后台可实时看到访客消息并回复
  - 转人工后进入「等待人工」模式：访客后续消息**不再触发任何自动回复**，只入库
  - 该模式只能由访客**重新打开聊天弹窗**解除（调 `POST /api/chat/sessions/:id/reset`），管理员回复不会解锁
- **观测能力**：接口调用监控（`endpointMonitor` 埋点全量 HTTP 请求）、操作留痕（`auditTrail` 只记写操作）、AI 用量与费用统计
- **认证**：JWT + Token 表校验 + 图形验证码（svg-captcha）

## API 说明

- 统一前缀 `/api`，健康检查 `GET /api/health`
- 完整接口目录维护在 [server/config/apiCatalog.js](server/config/apiCatalog.js)，后台「接口监控 → 接口文档」页会读取同一份数据，新增路由后只需在此补一条
- AI 写作与智能客服使用 `text/event-stream` 流式响应，反向代理必须关闭缓冲

## 环境变量

后端变量见 [server/.env.example](server/.env.example)，关键项：

| 变量 | 说明 |
|---|---|
| `PORT` | 服务端口，默认 5000 |
| `MONGO_URI` | MongoDB 连接串 |
| `JWT_SECRET` | JWT 签名密钥，**生产必须更换** |
| `CLIENT_ORIGIN` | CORS 白名单，多个用英文逗号分隔 |
| `CAPTCHA_ENABLED` | 是否强制图形验证码 |
| `OSS_*` | 四项全填才启用 OSS，否则走本地 `uploads/` |
| `DASHSCOPE_API_KEY` | 缺失时 AI 相关接口返回 503，其余业务不受影响 |

## 生产部署（阿里云）

推荐单机 Docker Compose，一套配置起 `mongo + api + web`：

```bash
cp .env.example .env      # 编辑：MONGO_ROOT_PASSWORD、JWT_SECRET、域名、CLIENT_ORIGIN
docker compose up -d --build
docker compose ps
curl http://<你的域名>/api/health
```

要点：

- 安全组放行 `80` / `443`；`BLOG_DOMAIN`、`ADMIN_DOMAIN` 的 A 记录要指向服务器公网 IP
- 建议服务器 **≥ 2 核 4G**：Vben 后台构建吃内存，2G 机器容易 OOM
- 部署**不会读取** `server/.env`，所有变量由根目录 `.env` 注入 compose
- 首次登录后立刻修改 `admin` 密码，默认口令等于后台对外开放
- HTTPS：证书放到 `nginx/certs/`（`fullchain.pem` + `privkey.pem`），并放开 [nginx/default.conf.template](nginx/default.conf.template) 末尾注释掉的 443 配置
- SSE 流式：Nginx 已配置 `proxy_buffering off` 与 300s 超时，缺失会导致 AI/客服回复一次性吐出或中断

## 版本控制说明

`client` 已作为普通子目录并入本仓库（不再带独立的 `.git`）。如需参考 Vben 官方最新代码：

```bash
git fetch --no-tags upstream main
git show upstream/main:<路径>
```

`upstream` 为只读远程（push 地址已禁用），且目录结构与本仓库不同，**不能直接 merge**，只能逐个文件参考。
