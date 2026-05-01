# AutoVideo 开发进度

> 这个文件由 AI agent 在每个任务**开始前**和**完成后**主动维护。中断恢复时，agent 必须**先读这个文件**，从第一个 `in_progress` 或 `pending` 的任务继续。

---

## 当前状态（agent 每次更新后修改这一节）

- **active_task**: `T1.5`
- **last_updated**: `2026-05-01T21:15:00Z`
- **next_action**: `实现 src/cli/compile.ts、slugify、快照与 CLI 接线`
- **completed**: `7 / 35`
- **blockers**: `0`

恢复检查清单（agent 启动时按顺序确认）：

1. [ ] 已读 `PRD.md` 全文
2. [ ] 已读 `TASKS.md` 全文
3. [ ] 已读本文件，确认 `active_task` 与 `next_action`
4. [ ] 已 `git status` 确认工作树干净（如有未提交改动，先决定是否丢弃/续上）
5. [ ] 已确认 `git log -1` 的 hash 与下表中最近一个 `done` 任务的 commit 一致

---

## 任务表

> 状态值：`pending` / `in_progress` / `done` / `blocked` / `skipped`  
> 修改方式：直接 StrReplace 改对应行的 status / commit / notes 列。

| ID | 标题 | 状态 | 开始 | 完成 | Commit | 备注 |
|----|------|------|------|------|--------|------|
| T0.1 | 仓库骨架 | done | 2026-05-01T09:26:26Z | 2026-05-01T09:28:36Z | aa66616 | — |
| T0.2 | 类型定义 + Schema | done | 2026-05-01T12:00:00Z | 2026-05-01T12:45:00Z | f6fc71d | — |
| T0.3 | 配置 loader | done | 2026-05-01T14:10:00Z | 2026-05-01T14:43:30Z | f96724c | — |
| T1.1 | 项目文件 + meta 解析 | done | 2026-05-01T16:00:00Z | 2026-05-01T17:50:00Z | e33ff88 | — |
| T1.2 | 块解析 + directive | done | 2026-05-01T09:49:11Z | 2026-05-01T09:52:02Z | 820b0e9 | — |
| T1.3 | 旁白预处理 | done | 2026-05-01T18:30:00Z | 2026-05-01T19:05:00Z | 991a46f | — |
| T1.4 | 资产 hash 复制 | done | 2026-05-01T20:00:00Z | 2026-05-01T20:10:00Z | 3eeb9a8 | — |
| T1.5 | compile 命令组装 | in_progress | 2026-05-01T21:15:00Z | — | — | — |
| T2.1 | 缓存 store | pending | — | — | — | — |
| T2.2 | cache CLI | pending | — | — | — | — |
| T3.1 | VoxCPM FastAPI wrapper | pending | — | — | — | — |
| T3.2 | voxcpm-client + autoStart | pending | — | — | — | — |
| T3.3 | ffmpeg helpers | pending | — | — | — | — |
| T3.4 | lineTimings 计算 | pending | — | — | — | — |
| T3.5 | tts 命令组装 | pending | — | — | — | — |
| T4.1 | prompt + 组件骨架 | pending | — | — | — | — |
| T4.2 | Claude SDK 调用 + prompt cache | pending | — | — | — | — |
| T4.3 | 子进程隔离工具 | pending | — | — | — | — |
| T4.4 | 验证（tsc + render smoke） | pending | — | — | — | — |
| T4.5 | visuals 命令组装 | pending | — | — | — | — |
| T5.1 | theme + 字体加载 | pending | — | — | — | — |
| T5.2 | SubtitleOverlay | pending | — | — | — | — |
| T5.3 | BlockFrame + animations | pending | — | — | — | — |
| T5.4 | BlockComposition（render 用） | pending | — | — | — | — |
| T6.1 | Root.tsx 生成器（render 模式） | pending | — | — | — | — |
| T6.2 | timing 计算 | pending | — | — | — | — |
| T6.3 | partial 渲染（程序化 bundle + renderMedia） | pending | — | — | — | — |
| T6.4 | ffmpeg concat | pending | — | — | — | — |
| T6.5 | loudnorm two-pass | pending | — | — | — | — |
| T6.6 | 质量校验 | pending | — | — | — | — |
| T6.7 | render 命令组装 | pending | — | — | — | — |
| T7.1 | Root.tsx 生成器（preview 模式） | pending | — | — | — | — |
| T7.2 | preview 命令 | pending | — | — | — | — |
| T8.1 | build orchestrator | pending | — | — | — | — |
| T8.2 | doctor | pending | — | — | — | — |
| T8.3 | init + templates | pending | — | — | — | — |
| T9.1 | 单测补全 | pending | — | — | — | — |
| T9.2 | E2E 测试 | pending | — | — | — | — |
| T9.3 | install.sh | pending | — | — | — | — |
| T9.4 | 文档 | pending | — | — | — | — |

---

## 验收记录（任务完成后追加，方便回溯）

> 每个 done 任务追加一段，格式如下：
>
> ### Tx.y — <标题> @ <commit-hash>
> - acceptance: <PRD/TASKS 中列出的验收项> → ✓ / ✗
> - artifacts: <生成的关键文件路径列表>
> - 备注：<可选>

### T1.4 — 资产 hash 复制 @ 3eeb9a8
- acceptance: 同名不同目录 → 不同 manifest key → ✓；同文件多块引用 → assets 去重 → ✓；无「第 X-Y 行」代码引用 → 不内联，仅 hash 复制与路径替换 → ✓；`npm run test` + `npm run build` → ✓
- artifacts: `src/parser/assets.ts` / `tests/assets.test.ts`
- 备注：「第 X-Y 行」与紧随该路径 token 的文本段配对后再内联，避免多块引用时范围串台；代码块 fenced 语言由扩展名映射

### T0.1 — 仓库骨架 @ aa66616
- acceptance: `npm install` 成功 → ✓；`npx tsx bin/autovideo.ts --help` 显示全部子命令 → ✓；`npx tsx bin/autovideo.ts compile foo.json` 退出码 1 且输出 `not implemented` → ✓
- artifacts: `package.json` / `package-lock.json` / `tsconfig.json` / `remotion.config.ts` / `bin/autovideo.ts` / `.gitignore`
- 备注：环境经 apt 安装 `nodejs`/`npm` 后完成验收；`@remotion/cli` 见决策日志 T0.1。

### T1.1 — 项目文件 + meta 解析 @ e33ff88
- acceptance: 缺字段报错 → ✓；`voiceRef` 默认 `./B00.wav`（相对 meta 目录）并校验存在 → ✓；CLI override `title` / `fps` / `voiceRef` 生效 → ✓；`aspect` 16:9 / 9:16 / 1:1 映射分辨率 → ✓；`npm run test` + `npm run build` → ✓
- artifacts: `src/parser/project.ts` / `src/parser/meta.ts` / `tests/project-meta.test.ts`
- 备注：`project.json` 仅允许 `meta` / `blocks` 顶层键（与 PRD 示例一致）；`meta.md` 允许 `slug:`（§7），非 `--meta` 字段；未知 meta 键报错以满足 §3.4 校验

### T1.2 — 块解析 + directive @ 820b0e9
- acceptance: 单文件多块、多文件合并顺序、ID 冲突、ID 自动编号 → ✓；`@duration: 8`（缺 `s`）、`@duration: 1m20s` 报错 → ✓；`npm run test` + `npm run build` → ✓
- artifacts: `src/parser/blocks.ts` / `src/parser/directives.ts` / `tests/blocks-directives.test.ts`
- 备注：`ParsedMarkdownBlock.narrationRaw` 供 T1.3；`#B1` 规范为 `B01`；首个 `>>>` 前非空行报错

### T0.3 — 配置 loader @ f96724c
- acceptance: `--meta dotted.key` 报错 → ✓（单测）；`--meta title=foo` / `fps=30` 类型推断 → ✓；合并优先级（defaults < cwd `autovideo.config.json` < `--config`，且 `--cache-dir` 高于文件）→ ✓；`npm run test` + `tsc --noEmit` → ✓
- artifacts: `src/config/types.ts` / `src/config/defaults.ts` / `src/config/load.ts` / `tests/config-loader.test.ts`
- 备注：`META_CLI_KEYS` 与 PRD §3.4 顶层字段对齐（不含 slug；slug 仅在 meta.md 书写覆盖 `--out` 自动 slug）。

### T0.2 — 类型定义 + Schema @ f6fc71d
- acceptance: `tsc --noEmit` 零错误 → ✓；最小 `tests/fixtures/minimal-script.json` 经 Ajv 对照 `schemas/script.schema.json` 校验通过 → ✓；`assertCompiledScript({})` 抛错 → ✓（vitest）
- artifacts: `src/types/script.ts` / `schemas/script.schema.json` / `scripts/export-script-schema.ts` / `tests/fixtures/minimal-script.json` / `tests/script-types.test.ts`
- 备注：`npm run export-schema` 可由 Zod 重导出 JSON Schema；根 `scriptSchema` 对块级额外字段 `additionalProperties: true` 以匹配宽松 IR。

### T1.3 — 旁白预处理 @ 991a46f
- acceptance: `hello **world**` → highlights `[{start:6,end:11}]`、`ttsText` `hello world` → ✓；`\*\*ptr` → `ttsText` `**ptr`、无 highlights → ✓；多段高亮与嵌套式输入按顺序配对 `**...**` → ✓；`npm run test` + `npm run build` → ✓
- artifacts: `src/parser/narration.ts` / `tests/narration.test.ts`
- 备注：`\*` 按字符消解为字面 `*`（故 `\*\*` → `**`）；配对扫描在消解后的字符串上进行

---

## 决策日志（遇到 PRD 模糊点时记录）

> 当 PRD 中某处描述模糊但 agent 自行决定继续（**不阻塞、不报告人类**）时，必须在这里记录决策。后续如果决策错了，可以按时间倒查。
>
> 格式：
>
> ### YYYY-MM-DD HH:MM | Tx.y
> - 模糊点：<引用 PRD 章节 + 描述>
> - 选择方案：<采纳的实现>
> - 备选方案：<未采纳的方案及原因>
> - 影响范围：<是否影响其他任务>

### 2026-05-01 09:30 | T0.1
- 模糊点：PRD §13.1 未列出 `@remotion/cli`，但 Remotion 4 官方要求 `remotion.config.ts` 从 `@remotion/cli/config` 导入 `Config`。
- 选择方案：在 `dependencies` 中增加 `"@remotion/cli": "^4.0.0"`，与其它 Remotion 包主版本对齐。
- 备选方案：从 `remotion` 包导入旧版 `Config` — v4 已迁移，易编译或运行时失败。
- 影响范围：仅 `package.json`；与 §13.1 列表相比多一项 CLI 包，属渲染管线必要配套。

### 2026-05-01 17:45 | T1.1
- 模糊点：PRD §3.1 未声明 `project.json` 是否允许额外字段。
- 选择方案：仅接受 `meta` 与 `blocks` 两个顶层键，其它键报错，避免静默忽略拼写错误。
- 备选方案：忽略未知键 — 易掩盖配置错误，与「错误显式」原则冲突。
- 影响范围：仅 `loadProjectFile`；用户若有扩展字段需另开约定。

### 2026-05-01 12:40 | T0.2
- 模糊点：`BlockFrameProps.children` / 默认组件返回类型在纯 TS 模块中如何表达。
- 选择方案：`import type { ReactNode, ReactElement } from "react"`，devDependency 增加 `@types/react`；`BlockVisualComponent` 返回 `ReactElement | null`。
- 备选方案：用 `unknown` / 不写组件签名 — 会削弱 PRD 契约与后续 visuals 校验。
- 影响范围：`package.json` devDeps；`src/types/script.ts`。

### 2026-05-01 09:52 | T1.2
- 模糊点：PRD §3.3 未写明内容文件在首个 `>>>` 之前是否允许前言或非空行。
- 选择方案：首个 `>>>` 之前若有非空行则报错，确保内容文件「只含块」、避免静默吞掉错别字段落。
- 备选方案：忽略前言 — 易掩盖用户把说明写在错误位置。
- 影响范围：仅 `extractRegionsFromFile`。

### 2026-05-01 20:08 | T1.4
- 模糊点：TASKS 要求检测 `(\.\.?/[^\s]+\.[a-zA-Z0-9]+)`，未定义多扩展名（如 `foo.tar.gz`）或路径含查询片段的边界。
- 选择方案：按 TASKS 正则 greedily 取到最后一个点后的「尾段」作为扩展；`tar.gz` 会得到 `.gz`，与「单段扩展名」正则一致。
- 备选方案：自研「多段扩展名」表 — TASKS 未要求，且与给定正则不完全一致。
- 影响范围：仅 `processVisualAssets` 路径匹配语义；后续若放宽正则需同步测试。

### 2026-05-01 19:05 | T1.3
- 模糊点：PRD §3.7 仅列举 `\*\*` 字面星号转义，未说明单个 `\*` 或其它反斜杠组合。
- 选择方案：逐字符扫描——`\` 后紧跟 `*` 则吞掉反斜杠并输出一个字面 `*`；其余 `\` 保留为字面字符。
- 备选方案：仅替换字面子串 `\*\*` — TypeScript/正则单次替换无法表达「两个连续转义星号」，且无法一致处理文档中 `\foo` 等边角输入。
- 影响范围：仅 `parseNarrationLine`；与 Markdown 常见「星号转义」心智一致。

---

## 阻塞 / 待决策（必须停下问人类的事项）

> 这里是**真正的阻塞点**：agent 没有合理 default、且乱猜会带来高代价（删测试 / 数据丢失 / 大量返工）的事。
>
> agent 写入这里后**必须停下当前任务**（status 改 `blocked`），等人类回应后再继续。
>
> 格式：
>
> ### YYYY-MM-DD HH:MM | Tx.y | <一句话标题>
> - 上下文：<当前在做什么、卡在哪>
> - 选项 A：<...> 利弊
> - 选项 B：<...> 利弊
> - agent 倾向：<A / B / 其他> 理由

（开发中由 agent 追加）

---

## 已知差异（实现与 PRD 的偏离）

> 实现过程中，如果发现某项必须偏离 PRD（如 PRD 描述的某 API 不存在、某做法不可行），在此记录，**同时**回到 PRD 修订相应章节。
>
> 格式：
>
> ### Tx.y | <章节> | <一句话差异>
> - PRD 原描述：<...>
> - 实际实现：<...>
> - 原因：<...>
> - PRD 是否同步更新：是 / 否（commit hash）

（开发中由 agent 追加）
