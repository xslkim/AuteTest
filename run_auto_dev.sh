#!/usr/bin/env bash
# 从 cursor_key.txt / github.txt 加载环境并启动 auto_dev.py（Cursor Cloud Agent 模式）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [[ ! -f cursor_key.txt ]]; then
  echo "缺少 cursor_key.txt（请放入 Cursor API Key，单行）" >&2
  exit 1
fi

export CURSOR_API_KEY="$(tr -d ' \r\n' < "$ROOT/cursor_key.txt")"
export CURSOR_GITHUB_REPO="${CURSOR_GITHUB_REPO:-https://github.com/xslkim/AuteTest}"
# Cursor Cloud Agent 固定模型（覆盖：启动前 export CURSOR_AGENT_MODEL=其它id）
export CURSOR_AGENT_MODEL="${CURSOR_AGENT_MODEL:-composer-2}"
# 未设置时默认 startingRef=main（GitHub 集成正常后即可）；需要时用 export CURSOR_GITHUB_REF=...

# 可选：从 github.txt 提取 classic PAT，启动前 pull 一次，让本地 git log 能尽快看到云端 Agent 的提交
if [[ -f "$ROOT/github.txt" ]]; then
  # 支持 GITHUB_TOKEN=... 或行内任意 ghp_ 开头 token
  TOKEN=""
  if grep -q '^GITHUB_TOKEN=' "$ROOT/github.txt" 2>/dev/null; then
    TOKEN="$(grep '^GITHUB_TOKEN=' "$ROOT/github.txt" | head -1 | cut -d= -f2- | tr -d ' \r\n"')"
  fi
  if [[ -z "${TOKEN}" ]]; then
    TOKEN="$(grep -oE 'ghp_[A-Za-z0-9_]+' "$ROOT/github.txt" | head -1 || true)"
  fi
  if [[ -n "${TOKEN}" ]] && git rev-parse --git-dir >/dev/null 2>&1; then
    git -C "$ROOT" pull --quiet "https://oauth2:${TOKEN}@github.com/xslkim/AuteTest.git" main 2>/dev/null || true
  fi
fi

export PYTHONUNBUFFERED=1
exec python3 -u "$ROOT/auto_dev.py" "$@"
