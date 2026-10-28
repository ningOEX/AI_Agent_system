# ============================================================
# 本地构建两个前端，产出到仓库根目录 dist/，供服务器直接挂载
#   dist/blog  ← blog-web/dist
#   dist/admin ← client/dist
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts\build-frontend.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\build-frontend.ps1 -Server root@1.2.3.4
#     （带 -Server 时构建完自动打包上传并重启 web 容器，需本机有 ssh/scp）
# ============================================================
param(
    [string]$Server = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Invoke-Step {
    param([string]$Title, [scriptblock]$Action)
    Write-Host "`n==> $Title" -ForegroundColor Cyan
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "$Title 失败（退出码 $LASTEXITCODE）"
    }
}

# ---------------- 1. 前台博客 blog-web ----------------
Push-Location (Join-Path $root 'blog-web')
try {
    if (-not (Test-Path 'node_modules')) {
        Invoke-Step '安装 blog-web 依赖' { npm.cmd ci --no-audit --no-fund }
    }
    Invoke-Step '构建 blog-web' { npm.cmd run build }
} finally {
    Pop-Location
}

# ---------------- 2. 后台管理 client ----------------
# 生产接口地址走同源 /api（由 Nginx 反代），覆盖 .env.production 里的 mock 地址
$env:VITE_GLOB_API_URL = '/api'
# 不生成 dist.zip，避免占空间
$env:VITE_ARCHIVER = 'false'

Push-Location (Join-Path $root 'client')
try {
    if (-not (Test-Path 'node_modules')) {
        Invoke-Step '安装 client 依赖' { pnpm.cmd install --frozen-lockfile }
    }
    Invoke-Step '构建 client' { pnpm.cmd build }
} finally {
    Pop-Location
}

# ---------------- 3. 汇总到根目录 dist/ ----------------
$distRoot = Join-Path $root 'dist'
New-Item -ItemType Directory -Force -Path $distRoot | Out-Null

$pairs = @(
    @{ From = 'blog-web\dist'; To = 'blog' },
    @{ From = 'client\dist'; To = 'admin' }
)

foreach ($p in $pairs) {
    $src = Join-Path $root $p.From
    if (-not (Test-Path $src)) {
        throw "未找到构建产物：$src（请确认构建命令是否成功）"
    }
    $dst = Join-Path $distRoot $p.To
    if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
    Copy-Item -Recurse -Path $src -Destination $dst
    Write-Host "  $($p.From) → dist\$($p.To)" -ForegroundColor Green
}

Write-Host "`n构建完成：$distRoot" -ForegroundColor Green

# Vben 构建会额外生成 client/dist.zip（压缩插件无法通过 env 关闭），删掉避免占空间
$zip = Join-Path $root 'client\dist.zip'
if (Test-Path $zip) { Remove-Item -Force $zip }

# ---------------- 4. 可选：上传并重启 ----------------
if ($Server) {
    $tar = Join-Path $root 'dist.tar.gz'
    if (Test-Path $tar) { Remove-Item -Force $tar }
    Invoke-Step '打包 dist' { tar -czf $tar -C $root dist }
    Invoke-Step "上传到 $Server" { scp $tar "${Server}:/opt/ai-agent/" }
    Invoke-Step '服务器解压并启动 web' {
        ssh $Server "cd /opt/ai-agent && tar -xzf dist.tar.gz && rm -f dist.tar.gz && docker compose up -d web"
    }
    Remove-Item -Force $tar
    Write-Host "`n已部署到 $Server" -ForegroundColor Green
} else {
    Write-Host @"

手动上传（在仓库根目录执行）：
  tar -czf dist.tar.gz dist
  scp dist.tar.gz root@<公网IP>:/opt/ai-agent/
  ssh root@<公网IP> "cd /opt/ai-agent && tar -xzf dist.tar.gz && rm -f dist.tar.gz && docker compose restart web"
"@ -ForegroundColor Yellow
}
