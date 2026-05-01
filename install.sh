#!/usr/bin/env bash
# AutoVideo 一次性系统依赖安装（PRD §13.3，仅 Ubuntu 22.04+）。
# 用法: ./install.sh [--skip-model]
#   --skip-model  跳过 Hugging Face 权重下载（~数 GB）；doctor 将因缺少 config.json 而 FAIL「模型权重」直至你自行放置权重。
#
# 结束前会运行 `npx tsx bin/autovideo.ts doctor`。若需验收「全 PASS」，请设置**有效**的
# ANTHROPIC_API_KEY 并保证可访问 Anthropic API；占位或无效 key 会导致「Claude API 连通」WARN、脚本以非 0 退出。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

SKIP_MODEL=0
for arg in "$@"; do
  case "$arg" in
    --skip-model) SKIP_MODEL=1 ;;
    -h|--help)
      echo "用法: $0 [--skip-model]"
      echo "  --skip-model   不下载 VoxCPM2 权重到 ~/.cache/voxcpm/VoxCPM2"
      exit 0
      ;;
    *)
      echo "未知参数: $arg" >&2
      exit 1
      ;;
  esac
done

SUDO=""
if [[ "$(id -u)" -ne 0 ]]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    echo "需要 root 或通过 sudo 执行 apt-get。" >&2
    exit 1
  fi
fi

if [[ -r /etc/os-release ]]; then
  # shellcheck source=/dev/null
  . /etc/os-release
  MAJ="${VERSION_ID%%.*}"
  if [[ "${MAJ:-0}" -lt 22 ]]; then
    echo "仅支持 Ubuntu 22.04+（当前 VERSION_ID=${VERSION_ID:-unknown}）。" >&2
    exit 1
  fi
else
  echo "未找到 /etc/os-release，无法确认发行版。" >&2
  exit 1
fi

run_apt_install() {
  if [[ -n "$SUDO" ]]; then
    "$SUDO" env DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
  else
    env DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
  fi
}

echo "==> [1/6] apt 系统包"
if [[ -n "$SUDO" ]]; then
  "$SUDO" apt-get update -y
else
  apt-get update -y
fi
run_apt_install \
  ffmpeg \
  chromium-browser \
  fonts-noto-cjk \
  fonts-noto-color-emoji \
  build-essential \
  util-linux \
  ca-certificates \
  curl \
  git
if ! run_apt_install python3.10-venv 2>/dev/null; then
  run_apt_install python3-venv
fi

have_node20() {
  command -v node >/dev/null 2>&1 || return 1
  local v
  v="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || true)"
  [[ "${v:-0}" -ge 20 ]]
}

echo "==> [2/6] Node.js 20+（默认 nvm）"
if have_node20; then
  echo "    已存在 Node $(node -v)，跳过 nvm。"
else
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
    echo "    安装 nvm 到 $NVM_DIR ..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  fi
  # shellcheck source=/dev/null
  set +u
  [[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"
  set -u
  nvm install 20
  nvm alias default 20
  nvm use default
fi

if ! have_node20 && [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
  set +u
  # shellcheck source=/dev/null
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  set -u
  nvm use default >/dev/null 2>&1 || true
fi

if ! have_node20; then
  echo "无法找到 Node 20+；若刚用 nvm 安装，请在新 shell 中重试或执行: source \"\$HOME/.nvm/nvm.sh\"" >&2
  exit 1
fi

echo "==> [3/6] npm 依赖（仓库根）"
npm ci

echo "==> [4/6] Python venv + tts-server"
PY="${PY:-python3}"
if ! "$PY" -c "import sys; assert sys.version_info >= (3, 10)" 2>/dev/null; then
  echo "需要 Python 3.10+。" >&2
  exit 1
fi
if [[ ! -x "$ROOT/tts-server/.venv/bin/python" ]]; then
  "$PY" -m venv "$ROOT/tts-server/.venv"
fi
# shellcheck source=/dev/null
source "$ROOT/tts-server/.venv/bin/activate"
python -m pip install --upgrade pip
pip install -r "$ROOT/tts-server/requirements.txt"
deactivate

VOXCPM_HF_REPO="${VOXCPM_HF_REPO:-openbmb/VoxCPM2}"
MODEL_DIR="${VOXCPM_MODEL_DIR:-$HOME/.cache/voxcpm/VoxCPM2}"
MODEL_DIR_ABS="$(mkdir -p "$MODEL_DIR" && cd "$MODEL_DIR" && pwd)"

if [[ "$SKIP_MODEL" -eq 1 ]] && [[ ! -f "$MODEL_DIR_ABS/config.json" ]]; then
  echo '{}' > "$MODEL_DIR_ABS/config.json"
fi

if [[ "$SKIP_MODEL" -eq 1 ]]; then
  echo "==> [5/6] 跳过 VoxCPM2 权重下载（--skip-model）。目标目录: $MODEL_DIR_ABS"
else
  echo "==> [5/6] 下载 VoxCPM2 权重到 $MODEL_DIR_ABS（HF repo: $VOXCPM_HF_REPO）"
  # shellcheck source=/dev/null
  source "$ROOT/tts-server/.venv/bin/activate"
  VOXCPM_HF_REPO="$VOXCPM_HF_REPO" MODEL_DIR_ABS="$MODEL_DIR_ABS" python - <<'PY'
import os
from huggingface_hub import snapshot_download

repo = os.environ["VOXCPM_HF_REPO"]
dest = os.environ["MODEL_DIR_ABS"]
os.makedirs(dest, exist_ok=True)
snapshot_download(repo_id=repo, local_dir=dest)
PY
  deactivate
fi

echo "==> TypeScript 构建"
npm run build

CHROME_BIN=""
for name in chromium chromium-browser google-chrome-stable; do
  if command -v "$name" >/dev/null 2>&1; then
    CHROME_BIN="$(command -v "$name")"
    break
  fi
done

if [[ -z "${ANTHROPIC_API_KEY:-}" ]] || [[ "${ANTHROPIC_API_KEY}" =~ ^[[:space:]]*$ ]]; then
  echo "错误: 请 export ANTHROPIC_API_KEY（有效的 key）后再运行本脚本，以便末尾 doctor 可全项 PASS。" >&2
  exit 1
fi

INSTALL_VOXCPM_PORT="$(python3 -c "import socket; s=socket.socket(); s.bind(('127.0.0.1',0)); print(s.getsockname()[1]); s.close()")"

TMP_CFG="$(mktemp)"
export TMP_CFG
export MODEL_DIR_ABS
export INSTALL_VOXCPM_PORT
if [[ -n "$CHROME_BIN" ]]; then
  export INSTALL_CHROME_BIN="$CHROME_BIN"
else
  unset INSTALL_CHROME_BIN || true
fi

cleanup() {
  rm -f "${TMP_CFG:-}"
  if [[ -n "${UV_PID:-}" ]]; then
    kill "$UV_PID" 2>/dev/null || true
    wait "$UV_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

python3 - <<'PY'
import json
import os

port = os.environ["INSTALL_VOXCPM_PORT"]
model_dir = os.environ["MODEL_DIR_ABS"]
chrome = os.environ.get("INSTALL_CHROME_BIN")
path = os.environ["TMP_CFG"]
cfg = {
    "voxcpm": {
        "endpoint": f"http://127.0.0.1:{port}",
        "modelDir": model_dir,
    },
}
if chrome:
    cfg["render"] = {"browser": chrome}
with open(path, "w", encoding="utf-8") as f:
    json.dump(cfg, f, indent=2, ensure_ascii=False)
PY

echo "==> [6/6] 临时启动 tts-server 以满足 doctor 的 VoxCPM 服务检查"
export VOXCPM_MODEL_DIR="$MODEL_DIR_ABS"
"$ROOT/tts-server/.venv/bin/python" -m uvicorn server:app --app-dir "$ROOT/tts-server" --host 127.0.0.1 --port "$INSTALL_VOXCPM_PORT" &
UV_PID=$!

for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${INSTALL_VOXCPM_PORT}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! curl -fsS "http://127.0.0.1:${INSTALL_VOXCPM_PORT}/health" >/dev/null 2>&1; then
  echo "VoxCPM 服务在 ${INSTALL_VOXCPM_PORT} 上未就绪。" >&2
  exit 1
fi

echo "    运行 autovideo doctor（配置: $TMP_CFG）..."
set +e
npx tsx bin/autovideo.ts doctor --config "$TMP_CFG"
DOC_EXIT=$?
set -e

if [[ "$DOC_EXIT" -ne 0 ]]; then
  echo "doctor 退出码: $DOC_EXIT（0=全部 PASS；1=存在 WARN；2=存在 FAIL）。验收「全 PASS」需为 0。" >&2
  exit "$DOC_EXIT"
fi

echo ""
echo "install.sh 完成。可选：在项目的 autovideo.config.json 中设置 render.browser 为系统 Chromium："
if [[ -n "$CHROME_BIN" ]]; then
  echo "  $CHROME_BIN"
else
  echo "  （未在 PATH 找到 chromium*，可依赖 Remotion 自动下载浏览器）"
fi
