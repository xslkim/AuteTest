#!/usr/bin/env python3
"""
auto_dev.py — 全自动驱动 Cursor/Claude Agent 完成 AutoVideo 开发

工作原理
─────────
1. 解析 PROGRESS.md，定位下一个 pending/in_progress 任务
2. 从 PRD.md + TASKS.md 提取该任务的完整上下文，拼成结构化 prompt
3. 调用 Agent（支持 Cursor Background API 或直接调 Anthropic Claude API）
4. 轮询 git log，等待出现 "chore(Tx.y): done" commit，确认任务完成
5. 自动进入下一任务，直到全部 done

使用方式
─────────
# 模式 A：Cursor Background Agent（需要 Cursor API Key）
    export CURSOR_API_KEY=sk-...
    python auto_dev.py

# 模式 B：直接 Claude API（无需 Cursor，效果完全等同）
    export ANTHROPIC_API_KEY=sk-ant-...
    python auto_dev.py --mode claude

# 其他选项
    python auto_dev.py --task T1.2          # 从指定任务开始
    python auto_dev.py --max-tasks 5        # 最多执行 5 个任务后停止
    python auto_dev.py --dry-run            # 只打印 prompt，不实际调用 Agent
    python auto_dev.py --poll-interval 30   # 轮询间隔（秒）
    python auto_dev.py --timeout 3600       # 单任务超时（秒，默认 1h）
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

# ─── 路径常量 ───────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).parent.resolve()
PRD_FILE = REPO_ROOT / "PRD.md"
TASKS_FILE = REPO_ROOT / "TASKS.md"
PROGRESS_FILE = REPO_ROOT / "PROGRESS.md"

# ─── ANSI 颜色（终端输出更清晰）────────────────────────────────────────────
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

def c(color: str, text: str) -> str:
    return f"{color}{text}{RESET}"


# ════════════════════════════════════════════════════════════════════════════
# 1. 解析 PROGRESS.md
# ════════════════════════════════════════════════════════════════════════════

class TaskState:
    """PROGRESS.md 中单条任务的状态"""
    def __init__(self, id_: str, title: str, status: str):
        self.id = id_          # 例如 "T0.1"
        self.title = title     # 例如 "仓库骨架"
        self.status = status   # pending / in_progress / done / blocked / skipped


def parse_progress() -> list[TaskState]:
    """解析 PROGRESS.md 任务表，返回所有任务状态列表"""
    content = PROGRESS_FILE.read_text(encoding="utf-8")
    tasks: list[TaskState] = []

    # 匹配任务表格行：| T0.1 | 仓库骨架 | pending | ...
    row_re = re.compile(
        r"^\|\s*(T\d+\.\d+)\s*\|\s*([^|]+?)\s*\|\s*(pending|in_progress|done|blocked|skipped)\s*\|",
        re.MULTILINE,
    )
    for m in row_re.finditer(content):
        tasks.append(TaskState(m.group(1), m.group(2).strip(), m.group(3)))
    return tasks


def next_task(tasks: list[TaskState], start_from: Optional[str] = None) -> Optional[TaskState]:
    """返回下一个需要执行的任务（in_progress 优先，其次 pending）"""
    # 如果指定了起始任务，先跳到那个位置
    if start_from:
        ids = [t.id for t in tasks]
        if start_from not in ids:
            print(c(RED, f"[错误] 任务 {start_from} 不存在于 PROGRESS.md"))
            sys.exit(1)
        # 找到起始任务，返回它（不管当前状态）
        for t in tasks:
            if t.id == start_from:
                return t

    # 优先返回 in_progress（上次中断的任务）
    for t in tasks:
        if t.status == "in_progress":
            return t

    # 其次返回第一个 pending
    for t in tasks:
        if t.status == "pending":
            return t

    return None  # 全部完成


def get_current_header(tasks: list[TaskState]) -> str:
    done = sum(1 for t in tasks if t.status == "done")
    total = len(tasks)
    blocked = sum(1 for t in tasks if t.status == "blocked")
    return f"进度 {done}/{total}  阻塞: {blocked}"


# ════════════════════════════════════════════════════════════════════════════
# 2. 提取任务详情（从 TASKS.md）
# ════════════════════════════════════════════════════════════════════════════

def extract_task_section(task_id: str) -> str:
    """从 TASKS.md 中提取指定任务的完整段落（从 ### Tx.y 到下一个 ### 或 ## 为止）"""
    content = TASKS_FILE.read_text(encoding="utf-8")
    # 匹配 "### T0.1 仓库骨架" 这类标题
    pattern = re.compile(
        rf"(###\s+{re.escape(task_id)}\b.*?)(?=\n###\s+T|\n##\s+|\Z)",
        re.DOTALL,
    )
    m = pattern.search(content)
    if not m:
        return f"[警告] 在 TASKS.md 中未找到任务 {task_id} 的详细描述"
    return m.group(1).strip()


def extract_execution_rules() -> str:
    """提取 TASKS.md 末尾的"给 AI agent 的执行规则"部分"""
    content = TASKS_FILE.read_text(encoding="utf-8")
    m = re.search(r"(## 给 AI agent 的执行规则.*)", content, re.DOTALL)
    if m:
        return m.group(1).strip()
    return ""


# ════════════════════════════════════════════════════════════════════════════
# 3. 构造 Agent Prompt
# ════════════════════════════════════════════════════════════════════════════

SYSTEM_PROMPT = """\
你是一个资深全栈工程师，正在独立完成 AutoVideo 项目的开发。
AutoVideo 是一个把 Markdown 教学口播稿编译为 MP4 视频的命令行工具（TypeScript + Python）。

你必须严格遵守以下规则：
1. **按 TASKS.md 中的"给 AI agent 的执行规则"操作**，逐步完成当前任务。
2. 每个任务必须先把 PROGRESS.md 对应行 status 改为 in_progress，提交 chore(Tx.y): start commit。
3. 实现完成后按"验收"逐项验收，全部通过后提交 feat(Tx.y): <描述> commit。
4. 最后把 PROGRESS.md 对应行 status 改为 done，提交 chore(Tx.y): done commit。
5. 遇到 PRD 模糊点：有合理默认值就自决并写入决策日志；无合理默认值就写入"阻塞/待决策"并停下。
6. 不允许跳过验收；不允许在任务失败时降级/掩盖问题。
7. 所有文件操作的 cwd = /home/xsl/AutoVideo（repo 根）。
"""

def build_prompt(task: TaskState, tasks: list[TaskState]) -> str:
    """构造完整的 agent prompt（context + 当前任务 + 执行规则）"""
    prd_content = PRD_FILE.read_text(encoding="utf-8")
    progress_content = PROGRESS_FILE.read_text(encoding="utf-8")
    task_section = extract_task_section(task.id)
    exec_rules = extract_execution_rules()

    # 统计已完成任务列表（供 agent 了解已有哪些文件/commit）
    done_tasks = [t.id for t in tasks if t.status == "done"]
    done_str = "、".join(done_tasks) if done_tasks else "（无）"

    prompt = f"""
# 当前任务：{task.id} — {task.title}

---

## 已完成的任务（对应 commit 已在 git 中）
{done_str}

---

## PROGRESS.md 当前内容
```
{progress_content}
```

---

## 当前任务详细说明（来自 TASKS.md）
```
{task_section}
```

---

## 执行规则（来自 TASKS.md 末尾）
{exec_rules}

---

## PRD.md（产品需求文档，视为合同）
{prd_content}

---

## 你现在要做的事

请严格按照上述执行规则，完成任务 **{task.id} — {task.title}**。

具体步骤：
1. 先更新 PROGRESS.md（active_task={task.id}，status=in_progress）并提交 `chore({task.id}): start`
2. 按"做什么"逐项实现
3. 按"验收"逐项验证（跑命令、检查输出）
4. 完成后更新 PROGRESS.md（status=done，填完成时间和 commit hash），提交 `chore({task.id}): done`

现在开始执行。
""".strip()

    return prompt


# ════════════════════════════════════════════════════════════════════════════
# 4. 调用 Agent
# ════════════════════════════════════════════════════════════════════════════

# ─── 4A. Cursor Background Agent API ────────────────────────────────────────
# Cursor 官方 API 文档：https://www.cursor.com/api-docs（如有）
# 此处使用 Cursor 的 background agent REST API

CURSOR_API_BASE = "https://api.cursor.com"

def _cursor_basic_auth(api_key: str) -> str:
    """Cursor API 使用 Basic Auth：API Key 作为用户名，密码留空"""
    import base64
    token = base64.b64encode(f"{api_key}:".encode()).decode()
    return f"Basic {token}"


def cursor_api_request(method: str, path: str, body: dict | None = None, timeout: int = 30) -> dict:
    """通用 Cursor API 请求（Basic Auth）"""
    import urllib.request
    import urllib.error

    api_key = os.environ.get("CURSOR_API_KEY", "")
    if not api_key:
        raise RuntimeError("未设置 CURSOR_API_KEY 环境变量")

    url = f"{CURSOR_API_BASE}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={
            "Authorization": _cursor_basic_auth(api_key),
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        raise RuntimeError(f"Cursor API {e.code}: {body_text}")


def call_cursor_agent(task: TaskState, prompt: str, github_repo_url: str) -> str:
    """
    通过 Cursor Cloud Agents API 创建一个 Agent 并启动首次 Run。

    ⚠️  Cursor Cloud Agent 基于 GitHub 仓库工作，需要：
        1. 在 cursor.com/dashboard/integrations 生成 API Key
        2. 将仓库推送到 GitHub（public 或已授权 private）
        3. 环境变量 CURSOR_GITHUB_REPO=https://github.com/你/仓库
           或通过 --github-repo 参数传入

    返回 agent_id（用于轮询状态）。
    """
    data = cursor_api_request("POST", "/v1/agents", body={
        "prompt": {"text": prompt},
        "repos": [{"url": github_repo_url, "startingRef": "main"}],
        "autoCreatePR": False,          # 不自动建 PR，让 agent 直接 push commit
    })
    agent_id = data.get("id", "")
    if not agent_id:
        raise RuntimeError(f"Cursor API 未返回 agent id，响应: {data}")
    return agent_id


def poll_cursor_agent(agent_id: str) -> dict:
    """轮询 Cursor Cloud Agent 的状态"""
    return cursor_api_request("GET", f"/v1/agents/{agent_id}")


# ─── 4B. 直接 Claude API（工具调用模式）────────────────────────────────────

# Claude 的工具定义：让 Claude 能读写文件、执行 shell 命令、查看 git
CLAUDE_TOOLS = [
    {
        "name": "bash",
        "description": (
            "在 /home/xsl/AutoVideo 目录下执行 shell 命令（bash -c）。"
            "可用于：git 操作、npm install、tsc、写文件（cat heredoc）、读文件（cat）等一切终端操作。"
            "命令在真实终端中执行，输出实时返回。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "要执行的 bash 命令（字符串）",
                },
                "cwd": {
                    "type": "string",
                    "description": "命令的工作目录，默认 /home/xsl/AutoVideo",
                    "default": "/home/xsl/AutoVideo",
                },
                "timeout": {
                    "type": "integer",
                    "description": "超时秒数，默认 120",
                    "default": 120,
                },
            },
            "required": ["command"],
        },
    },
    {
        "name": "read_file",
        "description": "读取文件内容，返回文本。大文件可指定行号范围。",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "绝对路径或相对 /home/xsl/AutoVideo 的路径"},
                "start_line": {"type": "integer", "description": "起始行（1-indexed），省略则从头"},
                "end_line": {"type": "integer", "description": "结束行（含），省略则到尾"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": "写入（或覆盖）文件内容。",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "绝对路径或相对 /home/xsl/AutoVideo 的路径"},
                "content": {"type": "string", "description": "文件完整内容"},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "str_replace",
        "description": "在文件中做精确字符串替换（类似 sed，但匹配字面字符串）。old_string 必须在文件中唯一存在。",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "old_string": {"type": "string", "description": "要替换的原始字符串（必须唯一）"},
                "new_string": {"type": "string", "description": "替换后的新字符串"},
            },
            "required": ["path", "old_string", "new_string"],
        },
    },
]


def _resolve_path(path: str) -> Path:
    p = Path(path)
    if not p.is_absolute():
        p = REPO_ROOT / p
    return p


def execute_tool(tool_name: str, tool_input: dict) -> str:
    """在本机执行 Claude 请求的工具调用，返回结果字符串"""

    if tool_name == "bash":
        cmd = tool_input["command"]
        cwd = tool_input.get("cwd", str(REPO_ROOT))
        timeout = tool_input.get("timeout", 120)
        print(c(CYAN, f"  $ {cmd[:120]}{'...' if len(cmd) > 120 else ''}"))
        try:
            result = subprocess.run(
                ["bash", "-c", cmd],
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            out = result.stdout + result.stderr
            status = f"\n[exit {result.returncode}]"
            return (out + status)[:8000]  # 截断超长输出
        except subprocess.TimeoutExpired:
            return f"[超时 {timeout}s]"
        except Exception as e:
            return f"[执行错误] {e}"

    elif tool_name == "read_file":
        path = _resolve_path(tool_input["path"])
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
            start = tool_input.get("start_line")
            end = tool_input.get("end_line")
            if start is not None:
                lines = lines[start - 1 : end]
            content = "\n".join(lines)
            return content[:12000]
        except FileNotFoundError:
            return f"[文件不存在] {path}"
        except Exception as e:
            return f"[读取错误] {e}"

    elif tool_name == "write_file":
        path = _resolve_path(tool_input["path"])
        content = tool_input["content"]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        print(c(GREEN, f"  ✓ 写入 {path.relative_to(REPO_ROOT)}"))
        return f"成功写入 {path}（{len(content)} 字节）"

    elif tool_name == "str_replace":
        path = _resolve_path(tool_input["path"])
        old = tool_input["old_string"]
        new = tool_input["new_string"]
        try:
            text = path.read_text(encoding="utf-8")
            count = text.count(old)
            if count == 0:
                return f"[错误] 在 {path} 中未找到 old_string（首 100 字符: {old[:100]!r}）"
            if count > 1:
                return f"[错误] old_string 在 {path} 中出现 {count} 次，不唯一，请提供更多上下文"
            new_text = text.replace(old, new, 1)
            path.write_text(new_text, encoding="utf-8")
            print(c(GREEN, f"  ✓ 替换 {path.relative_to(REPO_ROOT)}"))
            return f"成功替换"
        except FileNotFoundError:
            return f"[文件不存在] {path}"

    else:
        return f"[未知工具] {tool_name}"


def call_claude_agent(
    task: TaskState,
    prompt: str,
    max_turns: int = 80,
    verbose: bool = False,
) -> bool:
    """
    用 Anthropic Claude API（工具调用循环）执行任务。
    返回 True 表示任务成功完成（检测到 done commit）。
    """
    try:
        import anthropic
    except ImportError:
        print(c(RED, "[错误] 缺少 anthropic 包，请运行：pip install anthropic"))
        sys.exit(1)

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise RuntimeError("未设置 ANTHROPIC_API_KEY 环境变量")

    client = anthropic.Anthropic(api_key=api_key)

    messages = [{"role": "user", "content": prompt}]
    turn = 0

    print(c(CYAN, f"\n[Claude Agent] 开始执行 {task.id}，最多 {max_turns} 轮工具调用"))

    while turn < max_turns:
        turn += 1
        print(c(YELLOW, f"\n──── Turn {turn}/{max_turns} ────"))

        response = client.messages.create(
            model="claude-opus-4-5",        # 使用最强模型保证代码质量
            max_tokens=8192,
            system=SYSTEM_PROMPT,
            tools=CLAUDE_TOOLS,
            messages=messages,
        )

        # 打印文字内容
        text_parts = [b.text for b in response.content if hasattr(b, "text")]
        if text_parts:
            text = "\n".join(text_parts)
            if verbose or len(text) < 500:
                print(text)
            else:
                print(text[:300] + f"\n  ... (共 {len(text)} 字)")

        # 如果没有工具调用，说明 agent 认为任务完成
        tool_calls = [b for b in response.content if b.type == "tool_use"]
        if not tool_calls:
            print(c(GREEN, "\n[Agent] 无更多工具调用，任务执行完毕"))
            break

        # 执行工具调用
        tool_results = []
        for tc in tool_calls:
            print(c(CYAN, f"\n[Tool] {tc.name}"))
            result = execute_tool(tc.name, tc.input)
            if verbose:
                print(f"  → {result[:200]}")
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tc.id,
                "content": result,
            })

        # 追加 assistant 消息和工具结果到对话
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})

        # 检测任务是否已完成（git log 中出现 done commit）
        if check_task_done_in_git(task.id):
            print(c(GREEN, f"\n✅ 检测到 chore({task.id}): done commit，任务完成！"))
            return True

        # stop_reason == end_turn 且无工具调用，退出
        if response.stop_reason == "end_turn" and not tool_calls:
            break

    # 最终再检查一次
    return check_task_done_in_git(task.id)


# ════════════════════════════════════════════════════════════════════════════
# 5. 监控任务完成（git log 检测）
# ════════════════════════════════════════════════════════════════════════════

def check_task_done_in_git(task_id: str) -> bool:
    """检查 git log 中是否存在 chore(Tx.y): done 的 commit"""
    result = subprocess.run(
        ["git", "log", "--oneline", "-50"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    pattern = rf"chore\({re.escape(task_id)}\):\s*done"
    return bool(re.search(pattern, result.stdout, re.IGNORECASE))


def wait_for_cursor_agent_done(
    agent_id: str,
    task: TaskState,
    poll_interval: int,
    timeout: int,
) -> bool:
    """
    轮询 Cursor agent 状态，同时检测 git log。
    返回 True 表示任务完成。
    """
    start = time.time()
    print(c(CYAN, f"\n[轮询] Cursor agent ID: {agent_id}"))

    while time.time() - start < timeout:
        elapsed = int(time.time() - start)
        print(f"  [{elapsed}s] 检查状态...", end="\r")

        # 优先检查 git（更可靠）
        if check_task_done_in_git(task.id):
            print(c(GREEN, f"\n✅ 任务 {task.id} 已通过 git 确认完成"))
            return True

        # 检查 Cursor API 状态
        try:
            status = poll_cursor_agent(agent_id)
            state = status.get("state", status.get("status", "unknown"))
            print(f"  [{elapsed}s] Cursor Agent 状态: {state}", end="\r")
            if state in ("completed", "done", "finished", "success"):
                # 再等 5s 让 git commit 落盘
                time.sleep(5)
                return check_task_done_in_git(task.id)
            if state in ("failed", "error", "cancelled"):
                print(c(RED, f"\n❌ Cursor Agent 报告失败: {status}"))
                return False
        except Exception as e:
            print(c(YELLOW, f"\n  [警告] 轮询 Cursor API 失败: {e}，继续等待..."))

        time.sleep(poll_interval)

    print(c(RED, f"\n❌ 任务 {task.id} 超时（{timeout}s）"))
    return False


# ════════════════════════════════════════════════════════════════════════════
# 6. 主循环
# ════════════════════════════════════════════════════════════════════════════

def print_banner(tasks: list[TaskState]) -> None:
    done = sum(1 for t in tasks if t.status == "done")
    total = len(tasks)
    pending = sum(1 for t in tasks if t.status == "pending")
    in_prog = sum(1 for t in tasks if t.status == "in_progress")
    blocked = sum(1 for t in tasks if t.status == "blocked")

    print()
    print(c(BOLD, "╔═══════════════════════════════════════════════╗"))
    print(c(BOLD, "║       AutoVideo — 自动开发驱动脚本            ║"))
    print(c(BOLD, "╚═══════════════════════════════════════════════╝"))
    print(f"  总任务: {total}  ✅ done: {done}  🔄 in_progress: {in_prog}"
          f"  ⏳ pending: {pending}  🚫 blocked: {blocked}")
    print()


def print_task_start(task: TaskState, mode: str, task_num: int, total_tasks_to_run: int) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    print()
    print(c(BOLD + GREEN, f"┌─ [{ts}] 任务 {task_num}/{total_tasks_to_run}: {task.id} — {task.title}"))
    print(c(GREEN, f"│  模式: {mode}"))
    print(c(GREEN, "└" + "─" * 50))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="全自动驱动 Cursor/Claude Agent 完成 AutoVideo 开发",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--mode",
        choices=["cursor", "claude", "auto"],
        default="auto",
        help="Agent 调用模式：cursor=Cursor API，claude=直接 Claude API，auto=自动检测（默认）",
    )
    parser.add_argument(
        "--task",
        metavar="TX.Y",
        help="从指定任务开始（例如 --task T1.2）",
    )
    parser.add_argument(
        "--max-tasks",
        type=int,
        default=0,
        help="最多执行几个任务后停止（0=不限制）",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只打印 prompt，不实际调用 Agent",
    )
    parser.add_argument(
        "--poll-interval",
        type=int,
        default=20,
        help="Cursor 模式下轮询间隔（秒，默认 20）",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=3600,
        help="单任务超时秒数（默认 3600=1h）",
    )
    parser.add_argument(
        "--max-turns",
        type=int,
        default=80,
        help="Claude 模式下单任务最多工具调用轮次（默认 80）",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="打印工具调用的详细输出",
    )
    parser.add_argument(
        "--prompt-only",
        action="store_true",
        help="只打印第一个任务的 prompt 然后退出（用于调试 prompt 内容）",
    )
    args = parser.parse_args()

    # 检测可用模式
    mode = args.mode
    if mode == "auto":
        if os.environ.get("CURSOR_API_KEY"):
            mode = "cursor"
            print(c(GREEN, "[自动检测] 使用 Cursor Background Agent API"))
        elif os.environ.get("ANTHROPIC_API_KEY"):
            mode = "claude"
            print(c(GREEN, "[自动检测] 使用 Claude API（直接工具调用模式）"))
        else:
            print(c(RED, "[错误] 未找到 CURSOR_API_KEY 或 ANTHROPIC_API_KEY"))
            print("请先设置其中一个环境变量：")
            print("  export CURSOR_API_KEY=sk-...      # Cursor API Key")
            print("  export ANTHROPIC_API_KEY=sk-ant-... # Anthropic API Key")
            sys.exit(1)

    # 解析任务状态
    tasks = parse_progress()
    if not tasks:
        print(c(RED, "[错误] 无法从 PROGRESS.md 解析任务列表"))
        sys.exit(1)

    print_banner(tasks)

    # 统计待执行任务（用于进度显示）
    pending_tasks = [t for t in tasks if t.status in ("pending", "in_progress")]
    if args.task:
        # 从指定任务开始，只关心从那之后的任务
        ids = [t.id for t in tasks]
        start_idx = ids.index(args.task) if args.task in ids else 0
        pending_tasks = [t for t in tasks[start_idx:] if t.status in ("pending", "in_progress")]
    if args.max_tasks > 0:
        pending_tasks = pending_tasks[: args.max_tasks]

    total_to_run = len(pending_tasks)
    if total_to_run == 0:
        print(c(GREEN, "🎉 所有任务已完成！"))
        # 打印最终统计
        done = sum(1 for t in tasks if t.status == "done")
        print(f"   共 {done}/{len(tasks)} 个任务已 done")
        return

    print(c(CYAN, f"准备执行 {total_to_run} 个任务（模式: {mode}）"))

    # ─── 主循环 ────────────────────────────────────────────────────────────
    task_num = 0
    current_start = args.task  # 第一次用 --task 指定

    for run_idx in range(total_to_run):
        # 重新读取 PROGRESS.md（agent 可能已更新它）
        tasks = parse_progress()
        task = next_task(tasks, current_start)
        current_start = None  # 后续迭代不再指定起点

        if task is None:
            print(c(GREEN, "\n🎉 所有任务已完成！"))
            break

        task_num += 1
        print_task_start(task, mode, task_num, total_to_run)

        # 构造 prompt
        tasks_fresh = parse_progress()
        prompt = build_prompt(task, tasks_fresh)

        # --prompt-only：仅打印 prompt
        if args.prompt_only:
            print(c(CYAN, "\n─── SYSTEM PROMPT ───"))
            print(SYSTEM_PROMPT)
            print(c(CYAN, "\n─── USER PROMPT ───"))
            print(prompt[:3000], "..." if len(prompt) > 3000 else "")
            print(c(YELLOW, f"\n[prompt-only 模式] prompt 总长度: {len(prompt)} 字符"))
            return

        # --dry-run：打印简要信息但不调用
        if args.dry_run:
            print(c(YELLOW, f"[dry-run] 跳过实际调用，prompt 长度: {len(prompt)} 字符"))
            continue

        # ─── 调用 Agent ───────────────────────────────────────────────────
        success = False

        if mode == "cursor":
            try:
                github_repo = os.environ.get("CURSOR_GITHUB_REPO", "")
                if not github_repo:
                    raise RuntimeError(
                        "Cursor Cloud Agent 需要设置 CURSOR_GITHUB_REPO 环境变量\n"
                        "  例如：export CURSOR_GITHUB_REPO=https://github.com/你/AutoVideo"
                    )
                agent_id = call_cursor_agent(task, prompt, github_repo)
                print(c(CYAN, f"[Cursor Agent] Agent ID: {agent_id}"))
                success = wait_for_cursor_agent_done(
                    agent_id, task, args.poll_interval, args.timeout
                )
            except RuntimeError as e:
                print(c(RED, f"\n[Cursor API 错误] {e}"))
                print(c(YELLOW, "尝试降级到 Claude API 模式..."))
                if os.environ.get("ANTHROPIC_API_KEY"):
                    mode = "claude"
                    success = call_claude_agent(
                        task, prompt, max_turns=args.max_turns, verbose=args.verbose
                    )
                else:
                    print(c(RED, "无 ANTHROPIC_API_KEY，无法降级，退出"))
                    sys.exit(1)

        elif mode == "claude":
            success = call_claude_agent(
                task, prompt, max_turns=args.max_turns, verbose=args.verbose
            )

        # ─── 结果处理 ────────────────────────────────────────────────────
        if success:
            print(c(GREEN, f"\n✅ 任务 {task.id} 完成"))
            # 重新统计进度
            tasks = parse_progress()
            done_count = sum(1 for t in tasks if t.status == "done")
            print(c(GREEN, f"   总进度: {done_count}/{len(tasks)}"))
        else:
            print(c(RED, f"\n❌ 任务 {task.id} 未能在规定时间内完成"))
            tasks = parse_progress()
            task_state = next((t for t in tasks if t.id == task.id), None)
            if task_state and task_state.status == "blocked":
                print(c(YELLOW, "   任务状态为 blocked，需要人工介入"))
                print(c(YELLOW, '   请查看 PROGRESS.md 的"阻塞/待决策"部分'))
            print(c(YELLOW, f"   可用以下命令重试：python auto_dev.py --task {task.id}"))
            break

        # 任务间短暂暂停（让 agent 侧效果落盘）
        if run_idx < total_to_run - 1:
            print(c(CYAN, "\n[暂停 3s 后继续下一任务...]"))
            time.sleep(3)

    # ─── 最终摘要 ──────────────────────────────────────────────────────────
    print()
    print(c(BOLD, "═" * 52))
    tasks = parse_progress()
    done = sum(1 for t in tasks if t.status == "done")
    total = len(tasks)
    blocked = sum(1 for t in tasks if t.status == "blocked")
    print(c(BOLD, f"最终进度: {done}/{total} done，{blocked} blocked"))

    if done == total:
        print(c(GREEN + BOLD, "🎉 AutoVideo 全量开发完成！"))
    else:
        remaining = [t.id for t in tasks if t.status in ("pending", "in_progress")]
        print(c(YELLOW, f"剩余任务: {', '.join(remaining[:10])}{'...' if len(remaining) > 10 else ''}"))
        print(c(YELLOW, "继续开发：python auto_dev.py"))


# ════════════════════════════════════════════════════════════════════════════
# 入口
# ════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    main()
