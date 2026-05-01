使用说明
核心工作原理
PROGRESS.md → 找下一个任务 → 构建 prompt → 调用 Agent → 轮询 git log 确认完成 → 下一个任务
脚本支持两种 Agent 模式：

模式	触发条件	适用场景
Claude API 模式
设置 ANTHROPIC_API_KEY
直接用 Claude 工具调用（读写文件、执行命令），效果与 Cursor agent 完全等同
Cursor API 模式
设置 CURSOR_API_KEY
通过 Cursor 官方 Background Agent API 提交任务，Cursor 负责执行
快速启动
```
# 方式 A（推荐）：直接用 Claude API
export ANTHROPIC_API_KEY=sk-ant-...
python auto_dev.py                    # 全自动从 T0.1 跑到 T9.4

# 方式 B：Cursor Background Agent
export CURSOR_API_KEY=sk-...
python auto_dev.py

# 从指定任务开始（断点续跑）
python auto_dev.py --task T1.2

# 只跑前 3 个任务（分批测试）
python auto_dev.py --max-tasks 3

# 看看 Agent 会收到什么 prompt（调试）
python auto_dev.py --prompt-only
```

### Cursor Cloud Agent 指定模型（与 IDE 里选「Auto」）

官方 API **没有** `model: "auto"` 字符串；正确做法是 **不传 `model` 字段**，Cursor 会按顺序解析：你的账户默认模型 → 团队默认 → 系统默认（见 [Cloud Agents API — Create An Agent](https://cursor.com/docs/cloud-agent/api/endpoints)）。

本脚本约定：

| 写法 | 行为 |
|------|------|
| 不传 / 留空 | 不传 `model`，即「交给 Cursor 默认」（最接近 IDE 的 Auto） |
| `auto`、`default`、`omit` | 同上 |
| 具体 id | 传入 `{"model":{"id":"..."}}`，id 必须来自 `GET https://api.cursor.com/v1/models` |

示例：

```bash
export CURSOR_AGENT_MODEL=auto    # 或不设置
python auto_dev.py --mode cursor

# 使用列表里的某个固定模型（示例名以 API 返回为准）
export CURSOR_AGENT_MODEL=composer-2
python auto_dev.py --mode cursor
```


Agent 具备的能力
Claude API 模式下，脚本给 Agent 提供了 4 种工具：

bash — 执行任意 shell 命令（npm install、tsc、git commit、测试等）
read_file — 读取任意文件（支持行号范围）
write_file — 写入/覆盖文件
str_replace — 精确字符串替换（类似 Cursor 的 StrReplace 工具）
任务完成检测
不依赖 API 返回的状态，而是通过检测 git log 中出现 chore(T0.1): done 这样的 commit 来确认任务真正完成，避免误判。

中断恢复
任何时候 Ctrl+C 中断后，直接再跑 python auto_dev.py 即可——它会读 PROGRESS.md 找到 in_progress 的任务，从中间继续。