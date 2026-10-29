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

## 生产部署（阿里云，暂不申请域名）

没有域名也能部署：直接用「公网 IP + 端口」访问，不需要 DNS，也不涉及 ICP 备案。

| 入口 | 地址 |
|---|---|
| 前台博客 | `http://<公网IP>:80` |
| 后台管理 | `http://<公网IP>:8081` |
| 后端 API | 两个站点的 `/api` 都由 Nginx 同源反代，不单独暴露端口 |

### 操作流程

**1. 买服务器**：ECS 或轻量应用服务器，**2 核 2G 即可**（前端在本地构建，服务器只跑 Node + Mongo + Nginx），系统选 Alibaba Cloud Linux 3 或 Ubuntu 22.04。

**2. 安全组放行端口**：`80`、`8081`（如以后上 HTTPS 再加 `443`），授权对象 `0.0.0.0/0`。

**3. 装 Docker**（Alibaba Cloud Linux / CentOS）：

```bash
sudo dnf install -y docker docker-compose-plugin
sudo systemctl enable --now docker
docker compose version     # 确认能输出 2.x 版本
```

Ubuntu 用 `sudo apt install -y docker.io docker-compose-v2`。

**4. 拉代码并配置**：

```bash
sudo mkdir -p /opt && cd /opt
sudo git clone https://github.com/ningOEX/AI_Agent_system.git ai-agent
cd ai-agent
cp .env.example .env
vi .env
```

`.env` 里必须改这几项：

| 变量 | 说明 |
|---|---|
| `MONGO_ROOT_PASSWORD` | 随机强密码，仅用字母数字 |
| `JWT_SECRET` | 随机长字符串，≥ 32 位 |
| `CLIENT_ORIGIN` | 改成 `http://<公网IP>,http://<公网IP>:8081` |
| `DASHSCOPE_API_KEY` | 想要 AI 写作 / 智能客服就填，不填则相关接口返回 503 |

**5. 本地构建前端**（在你自己的 Windows 机器上执行，服务器不参与前端构建）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-frontend.ps1
```

产物汇总到仓库根目录：`dist/blog`（前台）、`dist/admin`（后台）。

带参数可一步完成构建 + 上传 + 重启：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-frontend.ps1 -Server root@<公网IP>
```

**6. 上传产物并启动服务**（服务器执行）：

```bash
# 本机：打包上传（未用 -Server 参数时）
tar -czf dist.tar.gz dist
scp dist.tar.gz root@<公网IP>:/opt/ai-agent/

# 服务器：解压 + 启动
cd /opt/ai-agent
tar -xzf dist.tar.gz && rm -f dist.tar.gz
docker compose up -d          # 只构建后端镜像，1-2 分钟
docker compose ps
docker compose logs -f api
```

**7. 验证**：

```bash
curl http://127.0.0.1/api/health          # {"status":"ok"}
curl -I http://127.0.0.1:8081             # HTTP/1.1 200 OK
```

浏览器打开 `http://<公网IP>` 看博客，`http://<公网IP>:8081` 进后台。

**8. 立刻改默认密码**：`admin` / `admin123` 是启动时自动创建的，进后台第一件事就是改掉。

### 日常更新命令（服务器执行）

**后端代码更新 —— 一键重建 api 镜像**：

```bash
cd /opt/ai-agent
./update-api.sh              # 常规更新（走 Docker 缓存，快）
./update-api.sh --no-cache   # 新增依赖不生效时全量重建（慢）
```

脚本来自仓库 [scripts/update-api.sh](scripts/update-api.sh)，首次上传到 `/opt/ai-agent/` 后需执行一次 `chmod +x update-api.sh`。流程：拉取 main 分支最新 tarball → rsync 同步 `server/`（自动保留 `.env`、`uploads/`、`node_modules/`）→ 重建镜像 → 强制重建容器 → 健康检查并输出日志。**不使用 `down -v`，不会删除 MongoDB 数据卷**。

**前端静态资源更新 —— 重启 web 容器**：

Xftp 覆盖 `/opt/ai-agent/dist` 下对应子目录（`blog` 或 `admin`，权限 755/644）后执行：

```bash
/opt/ai-agent/restart-web.sh
```

该脚本为服务器端一键脚本，自动重启 nginx 容器并探测前台（80）、后台（8081）端口可用性。前端更新**无需重建任何镜像**。

### 注意事项

- 部署**不会读取** `server/.env`，所有变量由根目录 `.env` 注入 compose
- 前端构建在本地完成，服务器只挂载 `./dist` 静态目录；改前端后重跑 `scripts\build-frontend.ps1` 再 `docker compose restart web` 即可，**不需要重建后端镜像**
- 若坚持在服务器构建前端（内存 ≥ 4G），用 `docker build -f Dockerfile.web -t ai-agent-web:local .` 后以 `WEB_IMAGE=ai-agent-web:local docker compose up -d` 启动
- SSE 流式：Nginx 已配 `proxy_buffering off` 与 300s 超时，去掉会导致 AI/客服回复一次性吐出或中断
- 上传图片默认落 `server/uploads/`（已挂载到宿主机），换服务器记得一起迁移
- 以后拿到域名：把 `nginx/default.conf.template` 里的 `server_name _` 改成域名、放开末尾注释的 443 段，再改 `.env` 的 `CLIENT_ORIGIN` 即可。国内服务器**绑定域名提供 Web 服务需要 ICP 备案**，用 IP 访问则不需要

## 版本控制说明

`client` 已作为普通子目录并入本仓库（不再带独立的 `.git`）。如需参考 Vben 官方最新代码：

```bash
git fetch --no-tags upstream main
git show upstream/main:<路径>
```

`upstream` 为只读远程（push 地址已禁用），且目录结构与本仓库不同，**不能直接 merge**，只能逐个文件参考。
