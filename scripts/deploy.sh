#!/usr/bin/env bash
# ==========================================
# 自动部署脚本
# 用法: ./scripts/deploy.sh [environment]
# environment: staging | production (默认: staging)
# ==========================================

set -euo pipefail

# ---- 配置 ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV="${1:-staging}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="/tmp/doge-deploy-${TIMESTAMP}.log"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"; }
success() { echo -e "${GREEN}[✓]${NC} $1" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[!]${NC} $1" | tee -a "$LOG_FILE"; }
error() { echo -e "${RED}[✗]${NC} $1" | tee -a "$LOG_FILE"; exit 1; }

# ---- 环境配置 ----
case "$ENV" in
  staging)
    DEPLOY_HOST="${DEPLOY_HOST_STAGING:-staging.example.com}"
    DEPLOY_PATH="${DEPLOY_PATH_STAGING:-/opt/doge-code-staging}"
    ;;
  production)
    DEPLOY_HOST="${DEPLOY_HOST_PRODUCTION:-prod.example.com}"
    DEPLOY_PATH="${DEPLOY_PATH_PRODUCTION:-/opt/doge-code}"
    ;;
  *)
    error "未知环境: $ENV. 可选: staging | production"
    ;;
esac

echo "========================================" | tee -a "$LOG_FILE"
echo "  doge-code 自动部署" | tee -a "$LOG_FILE"
echo "  环境: $ENV" | tee -a "$LOG_FILE"
echo "  时间: $(date)" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"

# ---- 前置检查 ----
log "执行前置检查..."

# 检查必要命令
command -v bun >/dev/null 2>&1 || error "未安装 Bun"
command -v git >/dev/null 2>&1 || error "未安装 Git"

# 检查是否在 git 仓库中
[ -d "$PROJECT_DIR/.git" ] || error "当前目录不是 Git 仓库"

# 检查是否有未提交更改
if [ -n "$(git -C "$PROJECT_DIR" status --porcelain)" ]; then
  warn "存在未提交的更改:"
  git -C "$PROJECT_DIR" status --short | tee -a "$LOG_FILE"
  error "请先提交或暂存更改后再部署"
fi

success "前置检查通过"

# ---- 拉取最新代码 ----
log "拉取最新代码..."
cd "$PROJECT_DIR"
git pull origin "$(git branch --show-current)" 2>&1 | tee -a "$LOG_FILE"
success "代码已更新"

# ---- 安装依赖 ----
log "安装依赖..."
bun install --frozen-lockfile 2>&1 | tee -a "$LOG_FILE"
success "依赖安装完成"

# ---- 代码检查 ----
log "运行代码检查..."
if bunx biome check src/ 2>&1 | tee -a "$LOG_FILE"; then
  success "代码检查通过"
else
  error "代码检查失败"
fi

# ---- 运行测试 ----
log "运行自动化测试..."
if bun run test:unit 2>&1 | tee -a "$LOG_FILE"; then
  success "测试通过"
else
  error "测试失败"
fi

# ---- 构建 ----
log "执行构建..."
bun run build 2>&1 | tee -a "$LOG_FILE"
success "构建完成"

# ---- 部署 ----
log "部署到 $ENV ($DEPLOY_HOST)..."

if [ "$ENV" = "production" ]; then
  # 生产环境：创建备份
  log "创建生产环境备份..."
  BACKUP_NAME="backup-${TIMESTAMP}.tar.gz"
  ssh "$DEPLOY_HOST" "cd $DEPLOY_PATH && tar -czf /tmp/$BACKUP_NAME . && echo '备份创建成功'" 2>&1 | tee -a "$LOG_FILE"
fi

# 同步文件到服务器
log "同步文件..."
rsync -avz --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='tests' \
  --exclude='*.log' \
  "$PROJECT_DIR/" "$DEPLOY_HOST:$DEPLOY_PATH/" 2>&1 | tee -a "$LOG_FILE"

# 重启服务
log "重启服务..."
ssh "$DEPLOY_HOST" "cd $DEPLOY_PATH && systemctl restart doge-code" 2>&1 | tee -a "$LOG_FILE"

success "部署完成! 环境: $ENV"
echo "日志文件: $LOG_FILE"
