# dsh-plugin-chat-menu 一键安装脚本（Windows PowerShell 5.1+ / pwsh）
# 等价于 scripts/install.sh：官方 CLI 安装 + bundle 自动挂载。
# 用法：irm https://raw.githubusercontent.com/ChocoLZS/dsh-plugin-chat-menu/main/scripts/install.ps1 | iex
# 可选参数：-Version <版本>  -Restart  -DryRun

param(
  [string]$Version = 'latest',
  [switch]$Restart,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Say  { Write-Host "[install] $args" -ForegroundColor Green }
function Warn { Write-Host "[warn] $args" -ForegroundColor Yellow }
function Die  { Write-Host "[error] $args" -ForegroundColor Red; exit 1 }

$DSH_HOME = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
$PROFILE_DIR = Join-Path $DSH_HOME 'profiles\web'
$WS_YML = Join-Path $PROFILE_DIR 'pnpm-workspace.yaml'
$PATCH_YML = Join-Path $PROFILE_DIR 'cordis.patch.yml'
$REGISTRY = if ($env:REGISTRY) { $env:REGISTRY } else { 'https://registry.npmjs.org' }
$PKG = 'dsh-plugin-chat-menu'
$DSH_CMD = if ($env:DSH_CMD) { $env:DSH_CMD } else { 'dsh' }

if (-not (Test-Path $PROFILE_DIR)) { Die "找不到 profile 目录：$PROFILE_DIR（请先安装并运行过一次 dsh web）" }
if (-not (Test-Path $WS_YML)) { Die "找不到 $WS_YML（请先初始化 web profile）" }

# 解析版本 -> npm spec
$SPEC = $Version
if ($Version -eq 'latest') {
  try {
    $v = npm view $PKG version --registry=$REGISTRY 2>$null
    if ($v) { $SPEC = $v } else { Warn '无法解析最新版本，回退 latest' }
  } catch { Warn '无法解析最新版本，回退 latest' }
}

# dsh CLI：优先 PATH，缺省 npx 拉官方包
function Get-DshCli {
  if (Get-Command $DSH_CMD -ErrorAction SilentlyContinue) { return $DSH_CMD }
  if (Get-Command npx -ErrorAction SilentlyContinue) { return 'npx -y --package @deepseek-ai/dsh dsh' }
  Die '未找到 dsh 或 npx，请先安装 DSH'
}
$CLI = Get-DshCli
Say "目标：$CLI plugin --profile web add $PKG@$SPEC"

if ($DryRun) {
  Say '[dry-run] 步骤 1：确保 pnpm-workspace.yaml 含 minimumReleaseAgeExclude'
  Say "[dry-run] 步骤 2：$CLI plugin --profile web add $PKG@$SPEC"
  Say '[dry-run] 步骤 3：校验 dsh.profile.bundles 含 dsh-plugin-chat-menu'
  Say '[dry-run] 步骤 4：幂等移除 cordis.patch.yml 旧挂载行'
  Say "[dry-run] 步骤 5：$([bool]$Restart ? 'pm2 restart dsh-web' : '提示手动重启')"
  exit 0
}

# 步骤 1：放行发布 <24h 的新版本（幂等）
$wsText = Get-Content $WS_YML -Raw
$wsChanged = $false
if ($wsText -notmatch '(?m)^\s*-\s+dsh-plugin-chat-menu\s*$') {
  if ($wsText -match '(?m)^\s*minimumReleaseAgeExclude:\s*$') {
    $wsText = [regex]::Replace($wsText, '(?m)^(\s*minimumReleaseAgeExclude:\s*)$', "`$1`n  - $PKG")
  } else {
    $wsText += "`nminimumReleaseAgeExclude:`n  - $PKG`n"
  }
  $wsChanged = $true
}
if ($wsChanged) { Set-Content -Path $WS_YML -Value $wsText; Say "已确保 pnpm-workspace.yaml 含 minimumReleaseAgeExclude（$PKG）" }
else { Say 'workspace 设置已就绪，跳过' }

# 步骤 2：官方 CLI 安装 + bundle 自动注册
Say "执行 $CLI plugin --profile web add $PKG@$SPEC ..."
Invoke-Expression "$CLI plugin --profile web add $PKG@$SPEC"
if ($LASTEXITCODE -ne 0) { Warn 'dsh plugin add 失败，请检查网络/登录后重试'; exit 1 }

# 步骤 3：校验 bundle 已注册
$pkgJson = Get-Content (Join-Path $PROFILE_DIR 'package.json') -Raw | ConvertFrom-Json
if ($pkgJson.dsh.profile.bundles -notcontains $PKG) {
  Warn 'dsh-plugin-chat-menu 未出现在 dsh.profile.bundles 中——挂载未注册。'
  exit 1
}
Say "bundle 已注册：dsh.profile.bundles 包含 $PKG（下次启动自动挂载）"

# 步骤 4：幂等移除旧的 manual 挂载行（避免双挂载）
$patchText = Get-Content $PATCH_YML -Raw
if ($patchText -match '(?m)^[ \t]*- insert:\s*$[\s\S]*?id:\s*chat-menu\b') {
  $patchText = [regex]::Replace($patchText, '(?m)^[ \t]*- insert:[ \t]*\r?\n(?:[ \t]*#.*\r?\n)*[ \t]*[ \t]*-[ \t]*id:[ \t]*chat-menu\b[^\r\n]*\r?\n(?:[ \t]+[^\r\n]*\r?\n)*', '')
  Set-Content -Path $PATCH_YML -Value $patchText.TrimEnd() + "`n"
  Say '已移除 cordis.patch.yml 旧的 chat-menu 手动挂载行（bundle 通道接管挂载）'
} else {
  Say '无旧手动挂载行，跳过'
}

Say "安装完成：$PKG@$SPEC"
if ($Restart) {
  if (Get-Command pm2 -ErrorAction SilentlyContinue) {
    Say '重启 dsh-web（pm2）...'
    pm2 restart dsh-web
  } else {
    Warn '未找到 pm2，请手动重启 DSH'
  }
} else {
  Say '下一步：重启 DSH 并硬刷新（Cmd/Ctrl+Shift+R）使新副本生效。'
}
