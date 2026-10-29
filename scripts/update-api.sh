#!/bin/bash
# ============================================================
# 一键重建并更新 api 服务（在服务器 /opt/ai-agent 下运行）
#
# 流程：拉取 GitHub 最新代码 → 同步 server 目录（保留 .env/uploads）
#       → 重建 api 镜像 → 强制重建容器 → 健康检查
#
# 用法：
#   ./update-api.sh              # 常规更新（利用 Docker 构建缓存，速度快）
#   ./update-api.sh --no-cache   # 全量重建（新增依赖不生效时使用，耗时较长）
#
# 注意：脚本不使用 docker compose down -v，不会删除 MongoDB 数据卷
# ============================================================
set -e

DEPLOY_DIR="/opt/ai-agent"
REPO_TARBALL="https://codeload.github.com/ningOEX/AI_Agent_system/tar.gz/refs/heads/main"
TMP_DIR="/tmp/ai-agent-update"
TARBALL="/tmp/ai-agent-latest.tar.gz"
NO_CACHE=""

if [ "$1" = "--no-cache" ]; then
  NO_CACHE="--no-cache"
  echo ">> 模式：全量重建（--no-cache）"
fi

cd "$DEPLOY_DIR"

echo "==> 1/6 拉取 GitHub 最新代码..."
curl -L "$REPO_TARBALL" -o "$TARBALL"

echo "==> 2/6 解压到临时目录..."
/bin/rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"
tar -xzf "$TARBALL" -C "$TMP_DIR"
SRC="$TMP_DIR/AI_Agent_system-main"

if [ ! -d "$SRC/server" ]; then
  echo "❌ 解压结果中未找到 server 目录，中止"
  exit 1
fi

echo "==> 3/6 同步 server 代码（保留 .env、uploads、node_modules）..."
if ! command -v rsync >/dev/null 2>&1; then
  echo ">> rsync 未安装，正在安装..."
  (command -v dnf >/dev/null 2>&1 && dnf install -y rsync) || yum install -y rsync
fi
rsync -av --delete \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='uploads/' \
  --exclude='node_modules/' \
  "$SRC/server/" "$DEPLOY_DIR/server/"

echo "==> 4/6 重建 api 镜像..."
docker compose build $NO_CACHE api

echo "==> 5/6 强制重建 api 容器（确保最新环境变量生效）..."
docker compose up -d --force-recreate api

echo "==> 6/6 健康检查..."
sleep 5
if docker compose ps api --status running 2>/dev/null | grep -q "api"; then
  echo "✅ api 容器运行正常"
  echo "------------------------------------------------------------"
  docker compose logs --tail=20 api
  echo "------------------------------------------------------------"
  echo "✅ 更新完成"
else
  echo "❌ api 容器未正常运行，最近 50 行日志："
  docker compose logs --tail=50 api
  exit 1
fi

# 清理临时文件（/bin/rm 绕过 rm -i 交互别名）
/bin/rm -rf "$TMP_DIR" "$TARBALL"
