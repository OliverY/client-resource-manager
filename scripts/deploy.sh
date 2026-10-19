#!/usr/bin/env bash
# 发布 client-resource-manager 到远程服务器（局域网 Mac mini）：
#   SSH 免密检查 → rsync 同步代码 → 服务器 npm install → 重启服务 → 健康检查
#
# 用法：
#   bash scripts/deploy.sh              # 正常发布
#   bash scripts/deploy.sh --setup      # 首次部署：允许在服务器上自动安装缺失的 node / pm2 / rsync
#   RESTART=pm2 bash scripts/deploy.sh  # 强制用 pm2 管理（默认 auto：launchd 优先，pm2 兜底）
#
# 目标可用环境变量覆盖：
#   DEPLOY_HOST=<host>                     # 必填：目标机器的主机名或 IP
#   DEPLOY_USER=<user>                     # 默认当前用户（macOS 默认禁 root SSH）
#   DEPLOY_DIR=client-resource-manager DEPLOY_PORT=5173
#   RESTART=auto|launchd|pm2  LAUNCHD_LABEL=com.company.design.resource-manager

set -euo pipefail

HOST="${DEPLOY_HOST:-}"
USER_NAME="${DEPLOY_USER:-$(whoami)}"
REMOTE_DIR="${DEPLOY_DIR:-client-resource-manager}"  # 相对远程 home；也可填绝对路径
PORT="${DEPLOY_PORT:-5173}"
APP_NAME="client-resource-manager"
LAUNCHD_LABEL="${LAUNCHD_LABEL:-com.company.design.resource-manager}"
RESTART="${RESTART:-auto}"
SETUP=0
[[ "${1:-}" == "--setup" ]] && SETUP=1

log()  { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[deploy]\033[0m %s\n' "$*" >&2; exit 1; }

[[ -n "$HOST" ]] || fail "请先指定目标机器：DEPLOY_HOST=<host> bash scripts/deploy.sh（或用 --setup 首次部署）"

SSH_TARGET="${USER_NAME}@${HOST}"

log()  { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[deploy]\033[0m %s\n' "$*" >&2; exit 1; }

ssh_run() { ssh -o BatchMode=yes -o ConnectTimeout=8 "$SSH_TARGET" "$@"; }

# 1. 连通性（BatchMode：未配免密时立即失败并给出指引）
log "检查 SSH 免密：${SSH_TARGET}"
ssh_run 'true' 2>/dev/null || fail "SSH 免密登录未配置。请先在本机执行一次（输入密码）：
  ssh-copy-id ${SSH_TARGET}
然后重新发布。"

# 2. 服务器依赖：node>=18 / npm / rsync（launchd 是 macOS 自带，无需检查）
log "检查服务器环境（node>=18 / npm / rsync）"
MISSING="$(ssh_run 'for c in node npm rsync; do command -v $c >/dev/null 2>&1 || echo $c; done' | tr -d '[:space:]')"
if [[ -n "$MISSING" ]]; then
  if [[ $SETUP -eq 1 ]]; then
    log "服务器缺少：${MISSING}，尝试自动安装（Homebrew）…"
    ssh_run '
      set -e
      if ! command -v rsync >/dev/null || ! command -v node >/dev/null; then
        if command -v brew >/dev/null; then
          brew install -q rsync node
        else
          echo "NO_BREW：请先装 Homebrew 或手动安装 Node.js>=18 与 rsync" >&2; exit 1
        fi
      fi
    '
  else
    fail "服务器缺少：${MISSING}
运行 bash scripts/deploy.sh --setup 自动安装（Homebrew），或手动安装后重试。"
  fi
fi

NODE_MAJOR="$(ssh_run 'node -p "process.versions.node.split(\".\")[0]"')"
[[ "$NODE_MAJOR" -ge 18 ]] || fail "服务器 node 版本过低（v${NODE_MAJOR}），本工程需要 >=18"

# 3. 同步代码。data/ 是服务器的运行数据（db.json / uploads / output），
#    排除后 rsync --delete 也不会动它（未加 --delete-excluded，排除项在接收端受保护）
log "同步代码到 ${SSH_TARGET}:~/${REMOTE_DIR}"
rsync -az --delete \
  --exclude .git/ \
  --exclude node_modules/ \
  --exclude data/ \
  --exclude data.backup-before-migration/ \
  --exclude data.backup-before-wipe-20261016/ \
  --exclude .zcode/ \
  --exclude .workbuddy/ \
  --exclude .workbuddy-ai/ \
  --exclude reference/apk-icons/ \
  --exclude logs/ \
  --exclude "*.log" \
  --exclude .DS_Store \
  ./ "${SSH_TARGET}:${REMOTE_DIR}/"

# 4. 安装依赖
log "服务器安装依赖…"
ssh_run "cd ~/${REMOTE_DIR} && npm install --omit=dev --no-audit --no-fund --loglevel=error"

# 5. 重启服务：
#    auto    —— 服务器已有同名 launchd 服务就用它（KeepAlive 拉起），否则用 pm2（没有就装）
#    launchd —— 只用 launchd；pm2 —— 只用 pm2
log "重启服务（策略：${RESTART}）…"
ssh_run "
  set -e
  cd ~/${REMOTE_DIR}
  has_launchd=\$(launchctl list 2>/dev/null | awk -v l=${LAUNCHD_LABEL} '\$3==l{print 1}')
  has_pm2app=0
  if command -v pm2 >/dev/null 2>&1 && pm2 describe ${APP_NAME} >/dev/null 2>&1; then has_pm2app=1; fi
  if [ \"${RESTART}\" = launchd ] || { [ \"${RESTART}\" = auto ] && [ -n \"\$has_launchd\" ]; }; then
    launchctl kickstart -k \"gui/\$(id -u)/${LAUNCHD_LABEL}\"
    echo 'restart: launchd ('${LAUNCHD_LABEL}')'
  elif [ \"${RESTART}\" = pm2 ] || { [ \"${RESTART}\" = auto ] && [ \"\$has_pm2app\" = 1 ]; }; then
    pm2 restart ${APP_NAME} --update-env >/dev/null
    pm2 save >/dev/null
    echo 'restart: pm2 (existing app)'
  else
    command -v pm2 >/dev/null 2>&1 || npm install -g pm2 --silent
    pm2 start server/index.js --name ${APP_NAME} --time >/dev/null
    pm2 save >/dev/null
    echo 'start: pm2 (new app)'
  fi
"

# 6. 健康检查
log "健康检查 http://${HOST}:${PORT}/healthz"
for _ in $(seq 1 10); do
  if curl -fsS -m 3 "http://${HOST}:${PORT}/healthz" >/dev/null 2>&1; then
    log "✅ 发布成功：http://${HOST}:${PORT}"
    log "查看日志：ssh ${SSH_TARGET} 'tail -50 ~/${REMOTE_DIR}/logs/service.log'"
    exit 0
  fi
  sleep 1
done

fail "服务未通过健康检查，查看日志定位：
  ssh ${SSH_TARGET} 'tail -50 ~/${REMOTE_DIR}/logs/service.error.log'"
