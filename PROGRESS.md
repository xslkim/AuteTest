# AutoVideo 开发进度

> 这个文件由 AI agent 在每个任务**开始前**和**完成后**主动维护。中断恢复时，agent 必须**先读这个文件**，从第一个 `in_progress` 或 `pending` 的任务继续。

---

## 当前状态（agent 每次更新后修改这一节）

- **active_task**: `T5.3`
- **last_updated**: `2026-05-01T12:08:00Z`
- **next_action**: `开始 T5.3 — BlockFrame + animations`
- **completed**: `22 / 35`
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
| T1.5 | compile 命令组装 | done | 2026-05-01T21:15:00Z | 2026-05-01T22:20:00Z | 7db4e67 | — |
| T2.1 | 缓存 store | done | 2026-05-01T23:05:00Z | 2026-05-01T23:45:00Z | 3026706 | `evictIfOverLimit({ triggerStageStart })` 对接 §11.4 compile 不触发 |
| T2.2 | cache CLI | done | 2026-05-02T00:15:00Z | 2026-05-02T10:25:00Z | 0aa039a | `clean --dry-run`；子命令 `allowUnknownOption` 以兼容 `--cache-dir` 位置 |
| T3.1 | VoxCPM FastAPI wrapper | done | 2026-05-02T12:00:00Z | 2026-05-02T12:50:00Z | 769b75b | — |
| T3.2 | voxcpm-client + autoStart | done | 2026-05-01T10:30:43Z | 2026-05-01T10:32:48Z | 3ac0baa | 集成测 `RUN_VOXCPM_INTEGRATION=1` |
| T3.3 | ffmpeg helpers | done | 2026-05-01T10:35:00Z | 2026-05-01T10:37:00Z | 0fcbb40 | `anullsrc` fixture；concat 用临时 concat demuxer |
| T3.4 | lineTimings 计算 | done | 2026-05-01T14:05:00Z | 2026-05-01T14:12:00Z | cad58d4 | 第 1 行 `startMs=0`，与 §6.2.3 公式一致 |
| T3.5 | tts 命令组装 | done | 2026-05-01T15:30:00Z | 2026-05-01T16:05:00Z | f05ac08 | 入口用宽松 schema + `voiceRef` 存在性 |
| T4.1 | prompt + 组件骨架 | done | 2026-05-01T17:30:00Z | 2026-05-01T17:55:00Z | 59bb212 | `prompt-version.ts` 与 cache CLI 共用 MD5 前缀 |
| T4.2 | Claude SDK 调用 + prompt cache | done | 2026-05-01T18:15:00Z | 2026-05-01T19:05:00Z | 2d258b0 | `beta.messages` + `prompt-caching-2024-07-31`；集成测需 `ANTHROPIC_API_KEY` |
| T4.3 | 子进程隔离工具 | done | 2026-05-01T20:20:00Z | 2026-05-01T21:05:00Z | c1c87ef | `memLimitBytes`/`cpuLimitSec` 可覆盖；默认 8GiB / 600s |
| T4.4 | 验证（tsc + render smoke） | done | 2026-05-01T22:30:00Z | 2026-05-01T23:14:00Z | f0e887b | `RUN_VISUAL_VALIDATE=0` 跳过 render 集成 |
| T4.5 | visuals 命令组装 | done | 2026-05-02T12:00:00Z | 2026-05-02T12:45:00Z | 7eb5c3f | `CompiledBlock` 允许可选 `audio` + `visual.componentPath`；生成顺序执行以满足「失败不启下一块」验收 |
| T5.1 | theme + 字体加载 | done | 2026-05-01T11:19:15Z | 2026-05-01T11:22:09Z | 84723da | `getTheme`；Noto Sans SC + Noto Color Emoji + JetBrains Mono |
| T5.2 | SubtitleOverlay | done | 2026-05-01T12:00:00Z | 2026-05-01T12:08:00Z | c3425f5 | `npx remotion studio remotion/studio-subtitle-overlay.tsx` Composition `SubtitleOverlayDemo` |
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

### T5.2 — SubtitleOverlay @ c3425f5
- acceptance: Studio 单独 Composition 字幕按时序切换 + 高亮 → ✓（`SubtitleOverlayDemo`）；`npm run build` → ✓；`npm run test` → ✓
- artifacts: `remotion/components/SubtitleOverlay.tsx` / `remotion/studio-subtitle-overlay.tsx` / `tests/subtitle-overlay.test.ts` / `src/types/script.ts`（`SubtitleOverlayProps` 增 `width`/`height`）/ `remotion.config.ts` / `remotion/engine/theme.ts`（google-fonts subset 兼容）/ `tsconfig.json`（`jsx`）
- 备注：`npx remotion compositions remotion/studio-subtitle-overlay.tsx` 列出 `SubtitleOverlayDemo`；入场 `audioFrame<0` 不渲染

### T5.1 — theme + 字体加载 @ 84723da
- acceptance: `tsc --noEmit` 零错误 → ✓；`getTheme('dark-code').subtitle.fontFamily` 含 `"Noto Sans SC"` → ✓；`npm run test` → ✓
- artifacts: `remotion/engine/theme.ts` / `src/ai/validate.ts` / `src/cli/visuals.ts` / `tests/theme.test.ts` / `tests/visuals-cli.test.ts`（延长超时）
- 备注：`loadFont` 指定字重与子集并 `ignoreTooManyRequestsWarning`；未知 `meta.theme` 时 prompt 仍用 dark-code token、仅覆盖 `name`

### T4.5 — visuals 命令组装 @ 7eb5c3f
- acceptance: mock Claude：首轮 tsc 错 → 第二轮通过 → 组件落盘 + `script.json` 含 `componentPath` → ✓；3 轮皆败 → 退出抛错、`generateComponentTsx` 未调用第二块 → ✓；`npm run test` + `npm run build` → ✓
- artifacts: `src/cli/visuals.ts` / `src/ai/component-cache-key.ts` / `bin/autovideo.ts` / `src/types/script.ts` / `tests/visuals-cli.test.ts` / `tests/component-cache-key.test.ts`
- 备注：`p-limit` 用于并行 cache hit 复制；Claude + 校验按块顺序执行以满足失败语义；system prompt = `component.md` + 注入 theme JSON

### T4.4 — 验证（tsc + render smoke） @ f0e887b
- acceptance: 禁止 import → 静态扫描拦截 → ✓；类型错误 tsx → `runIsolated` tsc 失败 + stderr 前 50 行 → ✓；合法 tsx + `renderStill` → 非纯色 PNG → ✓（默认跑集成；`RUN_VISUAL_VALIDATE=0` 跳过）；`npm run test` + `npm run build` → ✓
- artifacts: `src/ai/validate.ts` / `src/ai/visuals-shim.d.ts` / `templates/tsconfig.visuals.json` / `tests/validate.test.ts`
- 备注：`tsconfig.visuals.json` 注入 `baseUrl`+`typeRoots` 指向仓库 `node_modules`，临时目录校验 tsc 仍可解析 `react`/`remotion`；shim 固定 `src/ai/visuals-shim.d.ts`（不随 dist）

### T4.3 — 子进程隔离工具 @ c1c87ef
- acceptance: 父进程设 `ANTHROPIC_API_KEY` 时子进程 `printenv` 为空 → ✓；`sleep 60` + 短 `timeoutMs` 非零退出 → ✓；`isolateNetwork` + `curl example.com` 失败 → ✓（无 `curl` 时 vitest skip）；`npm run test` + `npm run build` → ✓
- artifacts: `src/ai/sandbox.ts` / `tests/sandbox.test.ts`
- 备注：`prlimit` 包裹；可选 `unshare -n`；`AbortSignal` 触发同样 SIGTERM→5s→SIGKILL

### T4.2 — Claude SDK 调用 + prompt cache @ 2d258b0
- acceptance: 单测 mock：`system`/`tools` 含 `cache_control: ephemeral`、`render_component` + `tool_choice` → ✓；`cache_read_input_tokens > 0` → `cacheHit` → ✓；可选集成：`ANTHROPIC_API_KEY` 时 `component-gen.integration` 非跳过 → 本 CI 无 key 为 skip；`npm run test` + `npm run build` → ✓
- artifacts: `src/ai/component-gen.ts` / `tests/component-gen.test.ts` / `tests/component-gen.integration.test.ts`
- 备注：`maxRetries` 取自 `anthropic.maxRetries`；`promptCaching: false` 时降级为普通 string system（无 beta betas）

### T4.1 — prompt + 组件骨架 @ 59bb212
- acceptance: `src/ai/prompts/component.md` 存在且含 AnimationProps/Theme/白名单/`{tsx}` 约定；`docs/ARCHITECTURE.md` 含「Visuals prompt」设计与样例 → ✓；`component.md` 字节 MD5 多次计算一致、`prompt-version` 单测通过 → ✓；`npm run test` + `npm run build` → ✓
- artifacts: `src/ai/prompts/component.md` / `docs/ARCHITECTURE.md` / `src/ai/prompt-version.ts` / `src/cli/cache.ts`（改用共享读取）/ `tests/prompt-version.test.ts`
- 备注：骨架示例仅用 `AnimationProps` + `useCurrentFrame`，避免依赖 `useVideoConfig`

### T3.5 — tts 命令组装 @ f05ac08
- acceptance: mock `POST /v1/speech`：2 块 5 行跑完、`audio` / `public/audio/B01.wav` → ✓；同脚本跑第二次 `/v1/speech` 次数仍为 5（cache 命中、0 新增 API）→ ✓；`npm run test` + `npm run build` → ✓
- artifacts: `src/cli/tts.ts` / `src/tts/cache-key.ts` / `src/tts/voxcpm-client.ts`（`speak` 支持 `AbortSignal`）/ `bin/autovideo.ts` / `tests/tts-cli.test.ts` / `tests/tts-cache-key.test.ts`
- 备注：`--force` 且无 `--block` 时整块行级 miss；失败 `abort` 后打印 `resume` 提示；决策见决策日志 T3.5

### T3.4 — lineTimings 计算 @ cad58d4
- acceptance: `computeLineTimings([1,0.5,2])` → `[{0,1000},{1200,1700},{1900,3900}]`（§6.2.3 + 行间 200 ms）→ ✓；`npm run test` + `npm run build` → ✓
- artifacts: `src/tts/timings.ts` / `tests/timings.test.ts`
- 备注：`lineSpeechDurationsSec` 为对白时长（秒），不含行尾 200 ms 静音；`endMs` 为对白结束时刻

### T3.3 — ffmpeg helpers @ 0fcbb40
- acceptance: `appendSilence` + `wavDurationSec`：1s + 200ms → 1.2s ±1ms → ✓；`concatWavs` + 时长、空参/缺文件报错 → ✓；`npm run test` + `npm run build` → ✓
- artifacts: `src/tts/audio.ts` / `tests/audio.test.ts`
- 备注：`appendSilence` 经 `apad=pad_dur`；多段 `concatWavs` 写临时目录 + `ffmpeg -f concat -c copy`

### T3.2 — voxcpm-client + autoStart @ 3ac0baa
- acceptance: mock fetch：`registerVoice` → `speak` 流程 → ✓；`parseVoxcpmEndpoint` 单测 → ✓；集成：`RUN_VOXCPM_INTEGRATION=1` 时 autoStart 拉起并 `/health` → ✓（默认跳过；CI 无 Python 依赖）
- artifacts: `src/tts/voxcpm-client.ts` / `src/tts/voxcpm-server.ts` / `tests/voxcpm-client.test.ts` / `tests/voxcpm-server.test.ts` / `tests/voxcpm-server.integration.test.ts`
- 备注：`ensureVoxcpmServer.dispose()` 对 autoStart 子进程 `SIGTERM`，超时 `SIGKILL`

### T3.1 — VoxCPM FastAPI wrapper @ 769b75b
- acceptance: `uvicorn server:app` + `curl`：`GET /health` → ✓；`POST /v1/voices` → ✓；`python server.py`（短时启动）→ ✓；`POST /v1/speech` 返回 `audio/wav`（48kHz，取自 `model.tts_model.sample_rate`）→ 需在本地有效 `VOXCPM_MODEL_DIR` 权重与参考音频下验收（本 CI 环境未加载完整权重时 `/v1/speech` 返回 503，路径已接通）
- artifacts: `tts-server/server.py` / `tts-server/requirements.txt` / `.gitignore`（忽略 `tts-server/.venv/`）
- 备注：`load_denoiser=True` 以支持 `denoise`；可选 `VOXCPM_DEVICE`、`VOXCPM_OPTIMIZE`

### T2.2 — cache CLI @ 0aa039a
- acceptance: `stats | clean` 符合 §11.5；`stats` JSON + 默认表格双输出 → ✓；空目录 0 条目、put 后计数正确（`--cache-dir`）→ ✓；`npm run test` + `npm run build` → ✓
- artifacts: `src/cli/cache.ts` / `bin/autovideo.ts` / `src/cache/store.ts`（`clean({ dryRun })`）/ `tests/cache-store.test.ts`
- 备注：`--stale` 将 manifest 中 `promptVersion` / `remotionVersion` 与当前 toolchain 比对；尚无 `src/ai/prompts/component.md` 时 prompt 前缀为 null，component 侧不因 `--stale` 删除（决策日志 T2.2）

---
- acceptance: put→get 命中、不同 key miss、并发 put 无冲突（多 worker）→ ✓；超限按 partial→component→audio 驱逐且同层 LRU → ✓；`--older-than`（`ms`）与 `--stale` 谓词 → ✓；`npm run test` + `npm run build` → ✓
- artifacts: `src/cache/store.ts` / `tests/cache-store.test.ts` / `tests/cache-worker-put.ts` / `.gitignore`（忽略测试临时目录）
- 备注：`clean` 同时传 `olderThanMs` 与 `stale` 时为 AND；决策见决策日志 T2.1

### T1.5 — compile 命令组装 @ 7db4e67
- acceptance: pipeline 串接 → ✓；`subtitleSafeBottom = floor(height*0.15)` → ✓；Zod 校验 → ✓；`script.json` 与 `public/script.json` 同内容且含 `artifacts.compiledAt` → ✓；默认 `./build/{slug}/` + `slug:` + CJK slugify（pinyin-pro）→ ✓；快照（2 块+图）稳定 → ✓；`script-microgpt-part1-1` 风格 E2E fixture → ✓；`npm run test` + `npm run build` → ✓
- artifacts: `src/cli/compile.ts` / `src/util/slugify.ts` / `bin/autovideo.ts` / `tests/compile.test.ts` / `tests/fixtures/t15-project/` / `tests/__snapshots__/compile.test.ts.snap`
- 备注：`compile`、`build` 子命令启用 `allowUnknownOption`，保证 `extractConfigFlags` 仍能扫描 `--meta`/`--config`/`--out`；`--dry-run` 在临时目录跑完整 assets 处理后删除、不写目标目录

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

### 2026-05-01 22:10 | T1.5
- 模糊点：PRD §6.1 步 7 称 `subtitleSafeBottom` 由 theme 字幕 token「推导」；TASKS T1.5 要求 `floor(height*0.15)`。
- 选择方案：按 TASKS：`Math.floor(height * 0.15)`。
- 备选方案：等 T5 theme 模块再推导 — TASKS 已指定公式，defer 会破坏本任务验收。
- 影响范围：`parseMetaFile.subtitleSafeBottom`；默认分辨率下与此前 `Math.round` 数值一致。

### 2026-05-01 19:05 | T1.3
- 模糊点：PRD §3.7 仅列举 `\*\*` 字面星号转义，未说明单个 `\*` 或其它反斜杠组合。
- 选择方案：逐字符扫描——`\` 后紧跟 `*` 则吞掉反斜杠并输出一个字面 `*`；其余 `\` 保留为字面字符。
- 备选方案：仅替换字面子串 `\*\*` — TypeScript/正则单次替换无法表达「两个连续转义星号」，且无法一致处理文档中 `\foo` 等边角输入。
- 影响范围：仅 `parseNarrationLine`；与 Markdown 常见「星号转义」心智一致。

### 2026-05-01 10:33 | T3.2
- 模糊点：PRD §9 `endpoint` 示例含端口；若用户写成 `http://127.0.0.1` 未写端口，`URL` 解析会得到默认 80，与常见本地 8000 不一致。
- 选择方案：`parseVoxcpmEndpoint` 对 **http** 且无端口时使用 **8000**；https 无端口仍用 443。
- 备选方案：沿用浏览器默认 80 — autoStart 会把 uvicorn 绑到错误端口，health 永远失败。
- 影响范围：仅 `ensureVoxcpmServer` 绑定端口；显式端口的 endpoint 不变。

### 2026-05-02 12:48 | T3.1
- 模糊点：PRD §6.2.1 写「lazy load」但未写是否预装 ZipEnhancer denoiser；`VoxCPM.generate(denoise=True)` 需 denoiser 已加载。
- 选择方案：`from_pretrained(..., load_denoiser=True)`，首次 `/v1/speech` 加载模型时一并初始化 denoiser；`denoise=false` 时不调用降噪，仅增加初始化成本与显存。
- 备选方案：`load_denoiser=False` 且 `denoise` 请求时 400 — 与配置默认 `denoise: false` 不符，用户开 denoise 会踩坑。
- 影响范围：仅 `tts-server/server.py`；无权重环境首次加载可能较慢或失败（与真实部署一致）。

### 2026-05-02 10:24 | T2.2
- 模糊点：PRD §11.5 `--stale` 依赖 prompt 文件哈希；仓库尚无 `src/ai/prompts/component.md`（T4.1）时无法比对。
- 选择方案：若当前 md5 前缀解析失败（文件不存在），`--stale` 仅按 `@remotion/renderer` 版本剔除过时 partial；component 不因缺失前缀误判而清空。
- 备选方案：用占位前缀常量 — 会在将来引入 prompt 文件后与真实哈希不一致，导致误删或语义漂移。
- 影响范围：`cache clean --stale`；T4.1 加入 prompt 后 component stale 自动生效。

### 2026-05-01 23:40 | T2.1
- 模糊点：PRD §11.5 `cache clean` 在同用 `--older-than` 与 `--stale` 时未说明组合语义。
- 选择方案：`CleanCacheOptions` 中各条件按 AND 收敛；仅当 `type`/`olderThanMs`/`stale` 全部满足（已指定的项）时删除。
- 备选方案：OR — 易删掉仍应保留的条目。
- 影响范围：`CacheStore.clean`；T2.2 CLI 应保持一致。

### 2026-05-02 12:35 | T4.5
- 模糊点：TASKS 要求「p-limit 并发处理块」，验收要求「3 轮失败 → 其他块未启动」。
- 选择方案：`anthropic.concurrency` 控制并行 **component cache get + 磁盘复制**；对需生成的块 **顺序** 调用 Claude → validate → retry，首块失败后不再调用后续块的 API。
- 备选方案：全程并行多块 Claude — 违背验收与其它块 API「未启动」语义。
- 影响范围：仅 `src/cli/visuals.ts` 调度逻辑。

### 2026-05-01 23:10 | T4.4
- 模糊点：TASKS 要求 tsc 在 build out 写 `tsconfig.visuals.json`，但未说明在**临时目录**跑 `tsc` 时如何解析 `compilerOptions.types: ["react","remotion"]`。
- 选择方案：模板增加 `baseUrl` + `typeRoots`（绝对路径替换为仓库根），向上查找 `templates/tsconfig.visuals.json` 定位 repo root；默认 shim 用仓库 `src/ai/visuals-shim.d.ts`（tsc 不 emit .d.ts）。
- 备选方案：把 `node_modules` 链到临时目录 — 维护成本高。
- 影响范围：仅 visuals 校验 tsconfig 生成；与 `dist/` 编译产物路径无关。

### 2026-05-01 21:00 | T4.3
- 模糊点：TASKS T4.3 写 `prlimit --as=<mem> --cpu=<sec>` 未给出默认数值。
- 选择方案：`memLimitBytes` 默认 8GiB、`cpuLimitSec` 默认 600，二者均可通过 `RunIsolatedOptions` 覆盖。
- 备选方案：不设默认迫使调用方每次传入 — 过早对接 T4.4/T4.5 时噪声大。
- 影响范围：仅 `runIsolated`；最终 render 子进程可在调用处放宽上限。

### 2026-05-01 11:22 | T5.1
- 模糊点：TASKS 要求 emoji 走 `Noto Color Emoji`，PRD `Theme.fonts.mono` 未锁定具体族名。
- 选择方案：`fonts.mono` 使用 `JetBrains Mono`（`@remotion/google-fonts/JetBrainsMono`），与代码教学场景一致；`loadFont` 仅拉 latin/latin-ext/cyrillic 子集与 400 字重。
- 备选方案：`fonts.mono` 仍用 `monospace` 通用族 — 与 CJK 混排时跨机 fallback 不一致。
- 影响范围：仅 `remotion/engine/theme.ts`；后续主题可另定 mono。

### 2026-05-01 12:05 | T5.2
- 模糊点：T5.1 在 `NotoSansSC` / `NotoColorEmoji` 上传的 `subsets` 名（`chinese-simplified`、`emoji`）与 `@remotion/google-fonts` 4.x 元数据中实际键（`[4]`… 分片）不一致，Webpack 评测期 `loadFont` 抛错。
- 选择方案：三处 google-fonts 调用仅指定 `weights` + `ignoreTooManyRequestsWarning`，由包内默认加载该字重下全部子集键。
- 备选方案：穷举 `[0]`…`[119]` — Fragile，包升级必碎。
- 影响范围：`remotion/engine/theme.ts`；首轮请求偏多但 Studio/render 可跑通。

### 2026-05-01 19:10 | T4.2
- 模糊点：TASKS 固定「system prompt 标 ephemeral」；PRD §9 另有 `anthropic.promptCaching` 开关。
- 选择方案：默认 `promptCaching: true` 时走 `anthropic.beta.messages.create`，`betas: ["prompt-caching-2024-07-31"]`，并对 system 文本块与 `render_component` 工具附加 `cache_control: {type:"ephemeral"}`；`false` 时同一调用路径但省略 betas 与 `cache_control`，仍强制 `tool_choice: render_component`。
- 备选方案：忽略 `promptCaching` 始终开缓存 — 与用户显式关闭不符。
- 影响范围：`generateComponentTsx`；单测覆盖默认缓存路径。

### 2026-05-01 10:50 | T3.5
- 模糊点：PRD §6.2 写 tts 入口为已 compile 的 `script.json`，而现有 `compiledScriptSchema` 为 `.strict()` 且禁止块上 `audio` 键，与「再次运行 tts」冲突。
- 选择方案：`tts` 使用宽松 `scriptSchema.parse` + 最小前置校验（schemaVersion、非空旁白行、`voiceRef` 存在）；不写回时仍满足 compile 输出契约，写回后由全量 schema 校验磁盘 JSON。
- 备选方案：为「compile 输出」与「tts 可重入」拆两套 Zod — 改动面大，留待后续类型整理。
- 影响范围：仅 `src/cli/tts.ts` 入口校验。

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
