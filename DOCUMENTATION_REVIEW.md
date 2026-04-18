# AutoVisionTest 文档审查报告

**审查日期**：2026-04-18  
**审查对象**：product_document.md v2.1、task_document.md v2.0、dev_workflow.md v1.0  
**审查范围**：逻辑矛盾、流程断点、环境兼容性、坐标系统一致性

---

## 审查总结

| 级别 | 数量 | 状态 |
|------|------|------|
| **CRITICAL** | 2 | 必须在代码实现前修复 |
| **HIGH** | 2 | 应在第一个迭代周期前修复 |
| **MEDIUM** | 3 | 应在该模块实现前澄清 |
| **LOW** | 1 | 文档优化建议 |

---

## 详细问题列表

### ❌ CRITICAL-1: 坐标系统——图像压缩时的像素空间不明确

**位置**：  
- 产品文档 §6.2 (坐标系规则)、§6.4 (截图性能)
- 任务文档 T D.5 (ShowUI Grounding 后端)、T F.4 (Actor 调用与 fallback 链)

**问题描述**：

产品文档 §6.2 明确声明：**"所有内部坐标统一用'主屏左上角为原点的物理像素'"**

但 §6.4 说："送 VLM 前压缩到短边 1080px，JPEG quality 85"

任务 T D.5 的交付物说："坐标解析：ShowUI 输出相对坐标（0-1），转换为绝对像素"——但**相对于哪个分辨率？**

- 如果压缩到 1080px 再送给 VLM
- VLM 输出的归一化坐标 (0, 1) 乘以 1080 得到压缩图空间的坐标
- 那么这个坐标如何还原为"物理像素"？

任务 T F.4 的 `LocateResult` 返回的 `(x, y)` 坐标在哪个空间？

**影响范围**：
- T F.7 (单步主循环) 从 Actor 拿到坐标后，传给 SafetyGuard 和 ActionExecutor
- 如果坐标空间错误，所有点击、输入都会偏移
- 这是 **MVP 能否运行的关键问题**

**修复方案**：

1. **产品文档 §6.4 补充**：在"截图性能"小节增加：
   ```
   ### 6.4.1 坐标还原规则
   
   1. 原始截图尺寸：W_phys × H_phys（物理像素）
   2. 发送给 VLM 前：压缩到短边 1080px（设压缩率 scale = 1080 / max(W_phys, H_phys)）
   3. VLM 输出：(x_norm, y_norm) ∈ [0, 1]
   4. 还原为压缩图坐标：(x_1080, y_1080) = (x_norm * W_1080, y_norm * H_1080)
   5. 最终物理像素坐标：(x_phys, y_phys) = (x_1080 / scale, y_1080 / scale)
   6. 所有后续使用的坐标均为物理像素。
   ```

2. **任务 T D.5 补充**：
   ```
   - 坐标解析：ShowUI 输出相对坐标（0-1）
     → 乘以输入图像尺寸得压缩图坐标
     → 除以压缩率还原为物理像素坐标
     → 返回时确保在物理像素空间
   ```

3. **任务 T F.4 补充**：
   ```
   - LocateResult 中的 x, y 保证为物理像素
   ```

---

### ❌ CRITICAL-2: OCR 执行方式不明确——异步 vs 同步矛盾

**位置**：  
- 产品文档 §6.1 (感知层分工)
- 产品文档 §5.2 (单步主循环)
- 任务文档 T F.7 (单步主循环)

**问题描述**：

产品文档 §6.1 表格说：
```
| **OCR (PaddleOCR)** | 文字识别、OCR 断言、VLM grounding 失败时的 fallback 定位、错误弹窗检测 | 每步 1 次（异步，不阻塞 Planner） |
```

但 §5.2 的伪代码写的是：
```
2. ocr_result = ocr(screenshot)  # 缓存,本步多处复用
...
4. Planner+Reflector 合并调用
```

**矛盾**：如果 OCR 是"异步，不阻塞 Planner"，那么：
- OCR 应该在后台启动（step 2 立即返回 Future）
- step 4 Planner 执行时，OCR 应该在后台运行
- 但伪代码显示 step 2 之后是 step 3（终止检查），这些都是同步的

如果 OCR 是同步的，那么"不阻塞 Planner"的说法有歧义——是不重复调用吗？

**影响范围**：
- T F.7 的实现者不知道是否要用 `asyncio`
- 主循环的性能特性不确定

**修复方案**：

产品文档 §5.2 主循环伪代码改为明确的同步执行：

```python
### 5.2 单步主循环（同步版本）

OCR 在本步内同步执行一次，结果被多个组件复用：

step_idx = 0
while True:
  1. screenshot = capture()
  2. ocr_result = ocr(screenshot)        # 同步，一次性调用，全步复用
  3. 终止检查 (screenshot, ocr_result, ...)
  4. Planner+Reflector (screenshot, history, ...)
  5. 如果 done: break 成功
  6. 动作分派：
     - NEED_TARGET: Actor grounding(screenshot, target_desc) → OCR fallback
     - NO_TARGET: 直接使用
  7. SafetyGuard.check(action, coords, ocr_result, ...)
  8. execute(action)
  9. wait(500ms)
  10. history.append(...)
```

或者若要 OCR 异步，则改为：

```python
### 5.2 单步主循环（异步 OCR 版本）

step_idx = 0
ocr_future = None
ocr_result = None

while True:
  1. screenshot = capture()
  2. 启动异步 OCR (asyncio.create_task 或 ThreadPoolExecutor)
     ocr_future = async_ocr(screenshot)
  3. 终止检查 (screenshot, last_ocr_result, ...)  # 用上一步的 OCR
  4. Planner+Reflector (screenshot, history, ...)
  5. 等待 OCR 完成：ocr_result = ocr_future.result()
  6. 如果 done: break 成功
  7. 后续步骤...
```

**建议**：鉴于 MVP 强调稳定性而非性能，**推荐采用同步版本**，并在产品文档中明确改为：

```
### 6.1 感知层分工（修订）

| 层 | 用途 | 何时调用 |
|---|------|---------|
| **OCR (PaddleOCR)** | 文字识别、OCR 断言、VLM grounding 失败时的 fallback 定位、错误弹窗检测 | 每步 1 次（同步，在主循环步 2 执行，结果缓存供后续各环节复用） |
```

---

### ⚠️ HIGH-1: 动作类型枚举未在核心数据模型中明确定义

**位置**：  
- 产品文档 §5.5 (动作分类)
- 任务文档 T F.1 (核心数据模型)、T F.2 (Planner Prompt 模板)

**问题描述**：

产品文档 §5.5 定义了动作分类：
```
| **NEED_TARGET** | click / double_click / right_click / drag / scroll | 是 |
| **NO_TARGET** | type / key_combo / wait / scroll | 否 |
| **META** | launch_app / close_app / focus_window | 否 |
```

任务 T F.1 的交付物中，应该定义一个 `Action` 数据类，但描述没有明确列出 `action_type` 字段，也没有列出所有 9 种动作的枚举值。

任务 T F.2 说 Planner prompt 中要"可用动作类型（9 种）及哪些需要 target_desc"，但 T F.1 没有定义枚举。

**影响范围**：
- Planner prompt 的编写者无法确定正式的 action type 枚举名称
- ActionExecutor (T B.7) 的分派逻辑依赖这个枚举

**修复方案**：

任务 T F.1 的交付物明确补充：

```
- `Action` dataclass 必须包含以下字段：
  - `type: Literal["click", "double_click", "right_click", "drag", "scroll", "type", "key_combo", "wait", "launch_app", "close_app", "focus_window"]`
  - 或使用 Enum: class ActionType(Enum): ...

- 在 `prompts/planner_system.txt` 中硬编码这 9 种类型的分类：
  ```
  NEED_TARGET 动作（需要 target_desc）：
  - click: 单击指定位置
  - double_click: 双击指定位置
  - right_click: 右键单击指定位置
  - drag: 从一个位置拖到另一个位置（需要两次 grounding）
  - scroll: 滚动指定位置周围
  
  NO_TARGET 动作（不需要 target_desc，直接在 params 中提供）：
  - type: 输入文本
  - key_combo: 按组合键
  - wait: 等待毫秒数
  - scroll: 全局滚动（无特定位置）
  
  META 动作（应用级操作）：
  - launch_app: 启动应用
  - close_app: 关闭应用
  - focus_window: 将窗口聚焦到前台
  ```
```

---

### ⚠️ HIGH-2: SafetyGuard 集成点的签名不一致

**位置**：  
- 产品文档 §5.2 (单步主循环) 步骤 7
- 任务文档 T E.4 (SafetyGuard 总入口)

**问题描述**：

产品文档 §5.2 step 7 伪代码写：
```python
7. 安全拦截 SafetyGuard.check(action, ocr_result)
```

但任务 T E.4 的交付物说：
```python
def check(action: Action, coords: tuple[int, int] | None, ocr: OCRResult, goal: str, session_ctx: dict) -> SafetyVerdict
```

**分析**：实际上后者的签名更完整（包含 coords 用于黑名单检查、goal 用于 VLM 二次确认、session_ctx 用于超限追踪），这是对的。但**产品文档没有反映这些参数**。

**影响范围**：
- T F.7 的实现者看产品文档会得到不完整的调用方式
- 可能遗漏 goal 参数的传递

**修复方案**：

产品文档 §5.2 step 7 改为：

```python
7. 安全拦截：
    verdict = SafetyGuard.check(
        action=action,
        coords=(x, y) if NEED_TARGET else None,
        ocr=ocr_result,
        goal=goal,
        session_ctx=session_context
    )
    if verdict.status == "blocked":
        中止，上报 ABORT:UNSAFE (verdict.reason)
```

---

### 🔧 MEDIUM-1: 任务 T B.7 的依赖链不完整

**位置**：  
- 任务文档 T B.7 (动作执行器)

**问题描述**：

T B.7 (动作执行器) 的依赖列表是 `T B.1`，但它需要调用：
- `mouse.click/scroll/drag` (T B.3)
- `keyboard.type/key_combo` (T B.4)
- `window.focus/close` (T B.5)
- `app.launch/close` (T B.6)

这些都应该是依赖。

**修复方案**：

任务 T B.7 改为：
```
**依赖**：T B.3, T B.4, T B.5, T B.6
```

---

### 🔧 MEDIUM-2: MCP resource 与 base64 编码的大小限制未指定

**位置**：  
- 产品文档 §11.3 (截图投递策略)
- 产品文档 §11.2 (报告 schema)
- 任务文档 T H.2、T H.3

**问题描述**：

产品文档 §11.3 说"base64 或 MCP resource"，但没有说明：
- 如果用 base64 编码，单张图片的大小上限是多少？
- MCP resource 的大小是否有限制？
- 完整报告的大小上限是多少？

任务 T H.3 (Report 构造器) 的交付物中 `include_base64=True` 可能导致 JSON 过大，造成 OOM。

**影响范围**：
- 在长会话（30+ 步）中，base64 报告可能达到 50-100MB
- Claude API 的请求大小限制（4-8MB）

**修复方案**：

产品文档 §11.2 补充：

```
### 11.2.1 截图编码策略

**base64 编码（用于 REST API 直接返回）**：
- 单张截图：JPEG，80% 质量，短边 1080px
- 每张 base64 后约 200-300KB
- 单个报告最多包含 5-10 张关键截图
- 最终 JSON payload 建议 < 5MB

**MCP resource（用于 Claude Code / Cursor）**：
- 不编码，直接以 file:// 或 file:// URI 投递
- 大小无限制
- 优先级：MCP resource > base64
```

任务 T H.3 改为：

```
- `include_base64=True` 仅当用于 REST API 直接响应
- MCP 模式（H.1 中 `format: "mcp_resource"`）直接投递文件路径
- 检查最终 JSON 大小，超过 5MB 时自动切换为 resource 模式
```

---

### 🔧 MEDIUM-3: 任务间的"UI 大改回退"流程引用不清晰

**位置**：  
- 产品文档 §5.4 (回归模式执行)
- 任务文档 T G.6 (UI 大改 → 回退探索)

**问题描述**：

产品文档 §5.4 说："若连续 2 步 SSIM < 0.5 → 判定 UI 大改 → 中止回归 → 回落到探索模式（见 §4.2）"

但 §4.2 是"用例系统"的小节，不是"回落逻辑"。

任务 T G.6 定义了这个逻辑，但产品文档没有明确引用。

**影响范围**：
- 文档一致性问题，容易造成实现者困惑

**修复方案**：

产品文档 §5.4 改为：

```
### 5.4 回归模式执行

...
- 每步都做预期校验：执行前比对当前截图与 `expect.screenshot_hash` 的 SSIM
- 若连续 2 步 SSIM < 0.5 → 判定 UI 大改 → 中止回归 → 回落到探索模式（实现见任务文档 T G.6）
```

---

### 📝 LOW-1: 技术栈中漏写 asyncio（如果采用异步 OCR）

**位置**：  
- 产品文档 §13 (技术栈)

**问题描述**：

如果解决 CRITICAL-2（OCR 异步）后采用异步模式，§13 应该添加：

```
| 异步 | asyncio | 3.11+ 内置 |
```

**建议**：如果采用同步 OCR（推荐），则不需要改动。如果异步，补充此行。

---

## 汇总表格

| 问题 ID | 级别 | 模块 | 修复优先级 | 预计工作量 |
|---------|------|------|----------|----------|
| CRITICAL-1 | 🔴 | 坐标系、Actor、主循环 | 第一 | 高（影响多个任务） |
| CRITICAL-2 | 🔴 | OCR、主循环 | 第一 | 中（架构决策） |
| HIGH-1 | 🟠 | 数据模型、Prompt | 第二 | 低 |
| HIGH-2 | 🟠 | SafetyGuard、主循环 | 第二 | 低 |
| MEDIUM-1 | 🟡 | T B.7 | 第三 | 低 |
| MEDIUM-2 | 🟡 | Report、Evidence | 第三 | 低 |
| MEDIUM-3 | 🟡 | 文档引用 | 第三 | 最低 |
| LOW-1 | ⚪ | 技术栈 | 可选 | 最低 |

---

## 建议修复顺序

1. **立即修复（在任何代码提交前）**：
   - CRITICAL-1：确定坐标系统的还原规则（1-2 小时澄清讨论）
   - CRITICAL-2：决定 OCR 同步还是异步（1 小时决策）
   - HIGH-1、HIGH-2：更新产品文档的相关章节（2 小时）

2. **在各模块实现前**：
   - T F.1 实现前：修复 HIGH-1（明确 Action 枚举）
   - T B.7 实现前：修复 MEDIUM-1（完整依赖）
   - T H 阶段实现前：修复 MEDIUM-2（大小限制）

3. **文档优化（不阻塞开发）**：
   - MEDIUM-3：跨文档引用一致性
   - LOW-1：技术栈补全

---

## 验收标准

所有 CRITICAL 和 HIGH 问题修复后，应再进行一次快速 review（1 小时内）确认：

- [ ] 产品文档 §6 的坐标系统规则完整且一致
- [ ] 产品文档 §5.2 的伪代码明确同步还是异步
- [ ] 产品文档 §5.2 step 7 的 SafetyGuard 调用签名与任务 T E.4 一致
- [ ] 任务 T F.1 中 Action 枚举值与产品文档 §5.5 一致
- [ ] 所有跨文档的引用都正确（搜索"见 §X.X"和"见任务"）

---

**审查完成日期**：2026-04-18  
**建议修复截止**：在 Agents 领取第一个任务（T A.1）前
