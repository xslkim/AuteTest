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


def git_try_resolve_origin_head_sha() -> str:
    """
    本地 git 解析 origin/main（或 master）顶端 SHA。当前 Cursor Cloud API 对 SHA 作为
    startingRef 的校验不稳定（曾返回 “Branch '<sha>' does not exist”），默认请勿依赖；
    仅在用户显式需要时配合 CURSOR_GITHUB_REF / --github-ref 使用。
    """
    for ref in ("origin/main", "origin/master"):
        r = subprocess.run(
            ["git", "rev-parse", ref],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=15,
        )
        if r.returncode == 0:
            sha = r.stdout.strip()
            if len(sha) >= 7:
                return sha
    return ""


def compute_cursor_starting_ref_raw(args: argparse.Namespace) -> str:
    """
    决定传给 Cursor 的 startingRef 原始字符串（再经 resolve_starting_ref 处理）。

    优先级：命令行 --github-ref > 环境变量 CURSOR_GITHUB_REF > 默认 ``main``。

    GitHub 集成配置正确时，使用 ``main`` 即可；省略 startingRef 曾在服务端报
    “Failed to determine repository default branch”；自动填 SHA 曾被 API 误拒。
    """
    if hasattr(args, "github_ref"):
        return args.github_ref
    if "CURSOR_GITHUB_REF" in os.environ:
        return os.environ["CURSOR_GITHUB_REF"]
    return "main"


def resolve_starting_ref(spec: Optional[str]) -> Optional[str]:
    """
    repos[0].startingRef 为可选字段；省略时由 Cursor 使用仓库默认分支。
    若显式写 main 但 Cursor↔GitHub 集成未授权该仓库，可能报「无法验证分支」。
    """
    if spec is None:
        return None
    s = spec.strip()
    if not s:
        return None
    if s.lower() in ("omit", "default", "auto"):
        return None
    return s


def resolve_cursor_model_id(spec: Optional[str]) -> Optional[str]:
    """
    Cloud Agents API 不接受 model.id=\"auto\"；文档要求省略 model 字段以使用
    「用户默认 → 团队默认 → 系统默认」解析链（等同 IDE 里交给 Cursor 选默认）。

    显式模型须为 GET https://api.cursor.com/v1/models 返回的 id（如 composer-2）。
    """
    if spec is None:
        return None
    s = spec.strip()
    if not s:
        return None
    if s.lower() in ("auto", "default", "omit"):
        return None
    return s


def call_cursor_agent(
    task: TaskState,
    prompt: str,
    github_repo_url: str,
    model_id: Optional[str] = None,
    starting_ref: Optional[str] = None,
) -> str:
    """
    通过 Cursor Cloud Agents API 创建一个 Agent 并启动首次 Run。

    ⚠️  Cursor Cloud Agent 基于 GitHub 仓库工作，需要：
        1. 在 cursor.com/dashboard/integrations 生成 API Key
        2. 将仓库推送到 GitHub（public 或已授权 private）
        3. 环境变量 CURSOR_GITHUB_REPO=https://github.com/你/仓库
           或通过 --github-repo 参数传入
        4. GitHub 集成需能访问该仓库（Integrations → GitHub），否则分支校验会失败

    model_id：None / \"\" / auto / default → 请求体不传 model（官方默认链）；否则传入 {\"model\": {\"id\": ...}}。
    starting_ref：None / \"\" / omit → 不传 startingRef；否则传入分支名或 commit SHA。

    返回 agent_id（用于轮询状态）。
    """
    repo_cfg: dict = {"url": github_repo_url}
    ref = resolve_starting_ref(starting_ref)
    if ref:
        repo_cfg["startingRef"] = ref

    body: dict = {
        "prompt": {"text": prompt},
        "repos": [repo_cfg],
        "autoCreatePR": False,          # 不自动建 PR，让 agent 直接 push commit
    }
    explicit = resolve_cursor_model_id(model_id)
    if explicit:
        body["model"] = {"id": explicit}

    data = cursor_api_request("POST", "/v1/agents", body=body)
    agent = data.get("agent") if isinstance(data.get("agent"), dict) else {}
    agent_id = (agent.get("id") or data.get("id") or "").strip()
    if not agent_id:
        raise RuntimeError(f"Cursor API 未返回 agent id，响应: {data}")
    return agent_id


def poll_cursor_agent(agent_id: str) -> dict:
    """轮询 Cursor Cloud Agent 的状态（底层 GET agent）"""
    return cursor_api_request("GET", f"/v1/agents/{agent_id}")


def poll_cursor_latest_run(agent_id: str) -> tuple[str, dict]:
    """
    读取当前 Agent 最近一次 Run 的状态（文档：执行状态在 run 上，不在 agent 根对象）。
    返回 (status 大写字符串或 unknown, 合并后的调试 dict)。
    """
    try:
        ag = cursor_api_request("GET", f"/v1/agents/{agent_id}")
    except Exception as e:
        return ("unknown", {"error": str(e)})
    agent = ag.get("agent") if isinstance(ag.get("agent"), dict) else ag
    rid = (agent or {}).get("latestRunId") or ag.get("latestRunId")
    if not rid:
        return ("unknown", ag)
    try:
        run = cursor_api_request("GET", f"/v1/agents/{agent_id}/runs/{rid}")
    except Exception as e:
        return ("unknown", {"agent": ag, "run_error": str(e)})
    st = run.get("status")
    if not st and isinstance(run.get("run"), dict):
        st = run["run"].get("status")
    return ((st or "unknown").strip(), run)


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

    # 最终再检查一次（Claude 模式下不需要 exclude_hashes，Agent 在本机执行不会有旧分支问题）
    return check_task_done_in_git(task.id)


# ════════════════════════════════════════════════════════════════════════════
# 5. 监控任务完成（git log 检测）
# ════════════════════════════════════════════════════════════════════════════

def refresh_local_from_origin_main() -> None:
    """云端 Agent 更新 PROGRESS.md 在 GitHub 上，本地需快进合并才能解析下一任务。"""
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    subprocess.run(
        ["git", "fetch", "origin", "main"],
        cwd=REPO_ROOT,
        capture_output=True,
        timeout=120,
        env=env,
    )
    r = subprocess.run(
        ["git", "merge", "--ff-only", "origin/main"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=60,
        env=env,
    )
    if r.returncode != 0:
        print(
            c(
                YELLOW,
                f"[警告] 未能 ff-only 合并 origin/main（请先提交或处理本地改动）: "
                f"{(r.stderr or r.stdout or '')[:220]}",
            )
        )


def snapshot_done_commit_hashes(task_id: str) -> set[str]:
    """
    快照当前所有分支上已存在的 chore(Tx.y): done commit hash 集合。
    在调用 Agent 之前调用，用于后续 check_task_done_in_git 排除旧提交，
    避免因历史 cursor/* 分支残留而误判为"已完成"。
    """
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    subprocess.run(
        ["git", "fetch", "origin", "--prune"],
        cwd=REPO_ROOT,
        capture_output=True,
        timeout=120,
        env=env,
    )
    result = subprocess.run(
        ["git", "log", "--format=%H %s", "--all"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=60,
        env=env,
    )
    pattern = rf"chore\({re.escape(task_id)}\):\s*done"
    hashes: set[str] = set()
    for line in result.stdout.splitlines():
        parts = line.split(" ", 1)
        if len(parts) == 2 and re.search(pattern, parts[1], re.IGNORECASE):
            hashes.add(parts[0])
    return hashes


def check_task_done_in_git(task_id: str, exclude_hashes: Optional[set] = None) -> bool:
    """
    检查是否存在新的 chore(Tx.y): done commit。
    - exclude_hashes：Agent 启动前已存在的 done commit hash 集合，排除后避免旧分支误判。
    - 在所有已 fetch 的分支历史上搜索（含 origin/cursor-*）。
    """
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    subprocess.run(
        ["git", "fetch", "origin", "--prune"],
        cwd=REPO_ROOT,
        capture_output=True,
        timeout=120,
        env=env,
    )
    result = subprocess.run(
        ["git", "log", "--format=%H %s", "-500", "--all"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=60,
        env=env,
    )
    pattern = rf"chore\({re.escape(task_id)}\):\s*done"
    for line in result.stdout.splitlines():
        parts = line.split(" ", 1)
        if len(parts) == 2:
            hash_, subject = parts
            if re.search(pattern, subject, re.IGNORECASE):
                if exclude_hashes is None or hash_ not in exclude_hashes:
                    return True
    return False


def find_done_commit_hash(task_id: str, exclude_hashes: set) -> Optional[str]:
    """找到 Agent 新提交的 chore(Tx.y): done commit hash"""
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    result = subprocess.run(
        ["git", "log", "--format=%H %s", "-500", "--all"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=60,
        env=env,
    )
    pattern = rf"chore\({re.escape(task_id)}\):\s*done"
    for line in result.stdout.splitlines():
        parts = line.split(" ", 1)
        if len(parts) == 2:
            hash_, subject = parts
            if re.search(pattern, subject, re.IGNORECASE) and hash_ not in exclude_hashes:
                return hash_
    return None


def merge_agent_branch_to_main(task_id: str, exclude_hashes: set) -> bool:
    """
    找到 Agent 提交的 cursor/* 分支（含新 done commit），merge 到本地 main，再 push 到 GitHub。
    这样 PROGRESS.md 的更新才能进入 main，供下一任务的 parse_progress() 读取到。
    返回 True 表示合并并推送成功。
    """
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}

    done_hash = find_done_commit_hash(task_id, exclude_hashes)
    if not done_hash:
        print(c(YELLOW, f"  [merge] 未找到新的 done commit hash，跳过合并"))
        return False

    # 找到包含该 commit 的 cursor/* 远程分支
    r = subprocess.run(
        ["git", "branch", "-r", "--contains", done_hash],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=30,
        env=env,
    )
    cursor_branches = [b.strip() for b in r.stdout.splitlines() if "cursor/" in b]
    merge_ref = cursor_branches[0] if cursor_branches else done_hash
    print(c(CYAN, f"  [merge] 将 {merge_ref} 合并到 main（done commit: {done_hash[:10]}…）"))

    # 确保本地 main 是最新的
    subprocess.run(
        ["git", "fetch", "origin", "main"],
        cwd=REPO_ROOT, capture_output=True, timeout=60, env=env,
    )
    subprocess.run(
        ["git", "checkout", "main"],
        cwd=REPO_ROOT, capture_output=True, timeout=30, env=env,
    )
    subprocess.run(
        ["git", "merge", "--ff-only", "origin/main"],
        cwd=REPO_ROOT, capture_output=True, timeout=30, env=env,
    )

    # merge agent 分支（--no-ff 保留历史，允许 main 与 cursor/* 有分叉）
    r = subprocess.run(
        ["git", "merge", "--no-ff", merge_ref,
         "-m", f"merge(cursor): {task_id} agent work → main"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=120,
        env=env,
    )
    if r.returncode != 0:
        print(c(YELLOW, f"  [merge] 分支 merge 失败（{r.stderr[:200]}），尝试 cherry-pick done commit…"))
        # fallback：只 cherry-pick done commit 本身
        r2 = subprocess.run(
            ["git", "cherry-pick", done_hash],
            cwd=REPO_ROOT, capture_output=True, text=True, timeout=60, env=env,
        )
        if r2.returncode != 0:
            print(c(RED, f"  [merge] cherry-pick 也失败：{r2.stderr[:200]}"))
            subprocess.run(["git", "cherry-pick", "--abort"],
                           cwd=REPO_ROOT, capture_output=True, timeout=30, env=env)
            return False

    # push main 到 GitHub（使用 GITHUB_TOKEN 或裸 push）
    token = os.environ.get("GITHUB_TOKEN", "")
    github_repo = os.environ.get("CURSOR_GITHUB_REPO", "")
    if token and github_repo:
        import urllib.parse
        parsed = urllib.parse.urlparse(github_repo)
        push_url = f"https://oauth2:{token}@{parsed.netloc}{parsed.path}"
    else:
        push_url = "origin"

    r = subprocess.run(
        ["git", "push", push_url, "main"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=120,
        env=env,
    )
    if r.returncode != 0:
        print(c(YELLOW, f"  [merge] push 失败：{(r.stderr or r.stdout)[:200]}"))
        return False

    print(c(GREEN, f"  [merge] ✓ {task_id} agent 分支已合并并推送到 main"))
    return True


def wait_for_cursor_agent_done(
    agent_id: str,
    task: TaskState,
    poll_interval: int,
    timeout: int,
    exclude_hashes: Optional[set] = None,
) -> bool:
    """
    轮询 Cursor agent 状态，同时检测 git log（排除 exclude_hashes 里的旧提交）。
    检测到完成后自动把 agent 的 cursor/* 分支合并回 main 并推送。
    返回 True 表示任务完成。
    """
    start = time.time()
    print(c(CYAN, f"\n[轮询] Cursor agent ID: {agent_id}"))

    def _confirm_done() -> bool:
        if check_task_done_in_git(task.id, exclude_hashes):
            print(c(GREEN, f"\n✅ 任务 {task.id} 已通过 git 确认完成"))
            merge_agent_branch_to_main(task.id, exclude_hashes or set())
            return True
        return False

    while time.time() - start < timeout:
        elapsed = int(time.time() - start)
        print(f"  [{elapsed}s] 检查状态...", end="\r")

        if _confirm_done():
            return True

        # Cursor Cloud：执行状态在 Run 对象上（FINISHED / ERROR / …）
        try:
            run_state, run_payload = poll_cursor_latest_run(agent_id)
            print(f"  [{elapsed}s] Cursor Run 状态: {run_state}", end="\r")
            if run_state == "FINISHED":
                # 等待远端镜像与 GitHub 传播后再确认 chore(): done
                for _ in range(12):
                    time.sleep(5)
                    if _confirm_done():
                        return True
                print(
                    c(
                        YELLOW,
                        "\n  Run 已 FINISHED 但未在 git 历史中找到 chore(...): done，继续轮询…",
                    )
                )
            elif run_state in ("ERROR", "CANCELLED", "EXPIRED"):
                print(c(RED, f"\n❌ Cursor Run 结束状态: {run_state} — {run_payload}"))
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
        default=14400,
        help="单任务超时秒数（默认 14400=4h，云端 Agent 可能较慢）",
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
    parser.add_argument(
        "--cursor-model",
        default=os.environ.get("CURSOR_AGENT_MODEL", ""),
        metavar="ID",
        help=(
            "仅 Cursor 模式：模型 id；留空或 auto/default 表示不传 model 字段（"
            "使用账户/团队默认，见官方文档）。显式 id 须来自 GET /v1/models。"
            "也可用环境变量 CURSOR_AGENT_MODEL。"
        ),
    )
    parser.add_argument(
        "--github-ref",
        default=argparse.SUPPRESS,
        metavar="REF",
        help=(
            "仅 Cursor：repos[0].startingRef（分支名或 commit SHA）。"
            "默认 main；omit 表示不传 startingRef。环境变量 CURSOR_GITHUB_REF。"
        ),
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
        if mode == "cursor":
            refresh_local_from_origin_main()
        # 重新读取 PROGRESS.md（agent 在远端更新后需先 pull 合并）
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
                cm = resolve_cursor_model_id((args.cursor_model or "").strip() or None)
                if cm:
                    print(c(CYAN, f"Cursor Cloud Agent 模型 id: {cm}"))
                else:
                    print(c(CYAN, "Cursor Cloud Agent 模型: 未指定（等同 auto，使用 Cursor 默认模型链）"))
                raw_ref = compute_cursor_starting_ref_raw(args)
                sr = resolve_starting_ref((raw_ref or "").strip() or None)
                if sr:
                    disp = f"{sr[:14]}…{sr[-6:]}" if len(sr) > 24 else sr
                    print(c(CYAN, f"GitHub startingRef: {disp}"))
                else:
                    print(c(CYAN, "GitHub startingRef: （省略，由 Cursor 解析默认分支）"))
                # 快照：记录 Agent 启动前已存在的 done commit，防止旧分支误判
                baseline_hashes = snapshot_done_commit_hashes(task.id)
                if baseline_hashes:
                    print(c(YELLOW, f"  [基线] 发现 {len(baseline_hashes)} 个历史 done commit，将排除误判"))

                agent_id = call_cursor_agent(
                    task,
                    prompt,
                    github_repo,
                    model_id=args.cursor_model or None,
                    starting_ref=(raw_ref or "").strip() or None,
                )
                print(c(CYAN, f"[Cursor Agent] Agent ID: {agent_id}"))
                success = wait_for_cursor_agent_done(
                    agent_id, task, args.poll_interval, args.timeout,
                    exclude_hashes=baseline_hashes,
                )
            except RuntimeError as e:
                err_txt = str(e).lower()
                print(c(RED, f"\n[Cursor API 错误] {e}"))
                if (
                    "branch" in err_txt
                    or "repository" in err_txt
                    or "default branch" in err_txt
                ):
                    print(
                        c(
                            YELLOW,
                            "提示：打开 Cursor Dashboard → Integrations，确认 GitHub 已连接且 Cursor 能访问该仓库；"
                            "脚本默认已传本地解析的 commit SHA；仍失败多半是集成权限问题。",
                        )
                    )
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
