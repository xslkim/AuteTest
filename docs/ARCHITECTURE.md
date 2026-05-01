# AutoVideo 架构说明

面向贡献者与深度用户：流水线怎么串、缓存与隔离如何实现、以及如何扩展主题。产品契约与章节编号以根目录 `PRD.md` 为准。

---

## 仓库布局（实现）

```
bin/autovideo.ts           # Commander CLI 入口
src/cli/*.ts               # build / compile / tts / visuals / render / preview / cache / doctor / init
src/parser/                # project / meta / blocks / directives / narration / assets
src/tts/                   # VoxCPM HTTP 客户端、服务启停、WAV 工具、lineTimings
src/ai/                    # Claude 组件生成、tsc + 单帧渲染校验、prompts/component.md
src/cache/store.ts         # 全局 LRU + manifest（proper-lockfile）
src/render/                # Root 生成、bundle + renderMedia、concat、loudnorm、QA
src/config/                # autovideo.config.json 加载与默认值
remotion/                  # VideoComposition、BlockComposition、SubtitleOverlay、engine/theme & animations
tts-server/server.py       # FastAPI：/health、/v1/voices、/v1/speech
```

编译后的入口为 `dist/bin/autovideo.js`（`npm run build`）。

---

## 流水线 Stage

各 stage 都是对 **`script.json`（canonical IR）** 的读写变换；磁盘上的 `project.json` + Markdown 仅在 `compile` 入口使用。

```text
compile → tts → visuals → render
         ↑_______________↑
      （理论可并行读 script；默认 build 顺序执行）
```

| Stage | CLI | 主要输入 | 主要输出 |
|-------|-----|----------|----------|
| 1 | `compile` | `project.json` + `meta.md` + blocks `.md` | `build/{slug}/script.json` + `public/assets/*` |
| 2 | `tts` | `script.json` + `meta.voiceRef` | `public/audio/B**.wav`、`blocks[].audio` |
| 3 | `visuals` | `script.json` | `src/blocks/**/Component.tsx`、`visual.componentPath` |
| 4 | `render` | `script.json` + 音频 + 组件 | `output/partials/*.mp4`、`final.mp4`、`final_normalized.mp4` |

附加能力：

- **`build`**：`compile → tts → visuals → render`，任一 stage 失败即停止；不接受 `--block`。
- **`preview`**：生成 `remotion-root-preview.tsx`，启动 Remotion Studio；单块预览用 `--block`（见 `preview.ts`）。
- **`cache`**：`stats | clean`，与 PRD §11.5 一致。

### 进程工作目录（cwd）

为兼容测试与工具链（例如 Vitest worker 不显式 `process.chdir`），实现上：**`tts` / `visuals` / `render` 等子命令在子进程中以构建输出目录为 cwd**，并向其传入相对路径 **`script.json`**；`compile` 仍以用户在项目侧的 cwd 解析 `project.json`。效果上等价 PRD 「统一以 build out 为基准」的路径语义。

---

## 缓存（`CacheStore`）

- **目录**：`--cache-dir` > `autovideo.config.json` 的 `cache.dir` > `~/.autovideo/cache`。
- **子目录**：`audio/`（**行级** WAV）、`components/`（块级 TSX）、`partials/`（块级 mp4）。
- **并发**：`proper-lockfile` 保护 manifest 与文件写入。
- **LRU（§11.4）**：`cache.maxSizeGB` 超限且 `evictTrigger` 为 `stage-start` 时，在用缓存的 stage 启动前按 `lastHitAt` evict：**partials → components → audio** 顺序、同类型 LRU。
- **键**：参见 PRD §11.2；`promptVersion` 为 **`src/ai/prompts/component.md` 的 MD5 十六进制前 8 位**。

`cache clean` 支持 `--type`、`--older-than`（`ms` 库语法）、`--stale`；`--older-than` 与 `--stale` 组合为 **AND**。

---

## 子进程隔离（visuals 校验）

模型生成的 TSX 在独立子进程中跑 **TypeScript `--noEmit`** 与 **Remotion `renderStill` 单帧** 冒烟（见 `src/ai/sandbox.ts`、`validate.ts`）：

- **环境变量**：白名单仅限 `PATH`、`HOME`、`LANG`、`TMPDIR`、`DISPLAY`、`NODE_OPTIONS` 等（**剥离 `ANTHROPIC_API_KEY` 等敏感项**）。
- **资源**：`prlimit` 限制内存与 CPU 时间（默认可覆盖）。
- **网络**：校验子进程可走 `unshare -n` 断网（若系统支持）；最终成片 render 需允许 Chromium 访问字体 CDN 等资源，策略与 PRD §6.3 一致。

禁止 import、`eval`、`new Function` 等由静态扫描与 tsc 共同约束。

---

## 扩展主题（Theme）

1. **数据形状**：`Theme` 与 `AnimationProps` 定义在 `src/types/script.ts`（与 PRD §4 一致）。
2. **运行时 token**：在 `remotion/engine/theme.ts` 的 `THEMES` 中新增条目，并实现 `getTheme(name)`。
3. **编译期**：`meta.theme` 写入 `script.json`；未知主题在预览/渲染拉取 theme 时会抛错——请在增加主题名时同步注册。
4. **字体**：当前 `dark-code` 通过 `@remotion/google-fonts` 加载 Noto Sans SC / Noto Color Emoji / JetBrains Mono；新主题如需额外字体应在同一层显式 `loadFont`，避免依赖 Chromium 自带 CJK。

---

## Visuals prompt（块组件生成）

### 目的

`visuals` 阶段为每个块调用 Claude，根据 **`visual.description`** 生成 **`src/blocks/B**/Component.tsx`**。为保证可缓存与可评审，**唯一权威 system prompt** 为仓库文件：

**`src/ai/prompts/component.md`**

运行时将该文件全文作为 Claude **system** 消息主体；若 `anthropic.promptCaching === true`，则对该文本块打上 `cache_control: ephemeral`，并对 `render_component` 工具同样标记，以便 **Anthropic prompt caching**（beta `prompt-caching-2024-07-31`）。用户消息由各块上下文拼接（描述、画布尺寸、`theme` JSON、`subtitleSafeBottom`、`fps` 等）。**不要**在业务代码中用大段手写英文替代整份 `component.md`——改动提示词应通过修改该 Markdown 并完成回归。

### Claude 调用概要

- **工具**：仅 `render_component`，schema 要求 `{ "tsx": string }`，并 `tool_choice` 指向该工具（见 `src/ai/component-gen.ts`）。
- **重试**：验证失败时将 tsc stderr 摘要 / 渲染错误回灌 user 消息；**system 文件保持不变**以利于 cache；最多 3 轮；任一失败块之后的块顺序上不启动 API（与 TASKS / PRD 一致）。

### promptVersion（缓存）

与 `src/cli/cache.ts` 中 **`readPromptVersionPrefix()`** 一致：`component.md` **文件字节** MD5 的十六进制字符串取 **前 8 位**。

### System prompt 全文（与 `component.md` 一致）

以下内容从仓库 **`src/ai/prompts/component.md`** 原样摘录；若与该文件漂移，以文件为准。外层使用 `~~~`，以便内嵌的 \`\`\`json / \`\`\`typescript / \`\`\`tsx 围栏可正常闭合。

~~~markdown
# AutoVideo — visuals stage：块组件生成（system）

你是 AutoVideo 的 Remotion/React 组件生成器。用户会提供当前块的 **visual 描述**（自然语言，可能含时间线 `Xs:`）以及画布尺寸、主题 token、字幕安全区等上下文。你要输出 **单个 TSX 模块源码**，用于在该块的时间轴上全屏绘制视觉内容。

---

## 输出格式（必须通过 tool call）

使用工具返回 **唯一** JSON 对象：

```json
{ "tsx": "<完整的 TypeScript TSX 源码字符串>" }
```

- `tsx` 必须是 **完整文件内容**：含必要 `import`，以 **`export default`** 导出 React 组件。
- 不要返回 Markdown 围栏、解释文字或多余字段。
- 组件应为 **纯展示**：仅根据 props 与当前帧计算样式；不要在源码中包含异步副作用。

---

## 组件契约（必须与下列类型一致）

```typescript
interface AnimationProps {
  frame: number; // 块内帧（从 0 起）；优先使用 useCurrentFrame()，此字段为显式 fallback
  durationInFrames: number;
  width: number;
  height: number;
  subtitleSafeBottom: number; // 底部字幕区高度（px）
  theme: Theme;
  fps: number;
}

interface Theme {
  name: string;
  colors: {
    bg: string;
    fg: string;
    accent: string;
    muted: string;
    code: {
      bg: string;
      fg: string;
      keyword: string;
      string: string;
      comment: string;
    };
  };
  fonts: { sans: string; mono: string };
  spacing: { unit: number };
  subtitle: {
    fontFamily: string;
    fontSizePct: number;
    lineHeight: number;
    maxWidthPct: number;
    backgroundColor: string;
    paddingPx: number;
  };
}

// 默认导出签名（名称可为任意标识符，必须为 default export）
export default function Component(props: AnimationProps): JSX.Element;
```

- 使用 `props.theme`、`props.width`、`props.height` 驱动配色与排版；不要硬编码与主题冲突的颜色体系（除非描述明确要求某一固定色）。
- **字幕安全区**：主要内容与标题应落在 **`y < props.height - props.subtitleSafeBottom`** 的区域内（可用 `paddingBottom: props.subtitleSafeBottom` 等方式留白）。字幕由引擎单独叠加，你**不要**在组件内绘制字幕。
- 画布必须视为 **`props.width` × `props.height`** 的绝对坐标系；通常外层使用 Remotion 的 `AbsoluteFill` 或等价布局铺满。

---

## 允许 import 白名单

仅允许下列形式的静态 `import`（按需从中取用）：

| 模块 | 用途 |
|------|------|
| `react` | `React`、hooks（如 `useMemo`）等 |
| `remotion` | `AbsoluteFill`、`Sequence`、`Img`、`interpolate`、`spring`、`useCurrentFrame`、`staticFile`、`Easing` 等公开 API |

**禁止** import 或引用：

- Node 内置：`fs`、`path`、`child_process`、`http`、`https`、`net`、`dns`、`worker_threads`、`process`、`node:*` 等
- 任意其他 npm 包（含 `@remotion/google-fonts`、`axios` 等），除非后续版本的 AutoVideo 在白名单中明确追加
- `require()`、`import()`、指向白名单外的路径别名
- `eval`、`new Function(...)`、字符串化的动态代码执行

**禁止顶层副作用**：不得在模块顶层调用 `fetch`、读写存储、启动计时器或访问 `window` 中非纯粹查询以外的副作用。允许的顶层仅为 `import` 与类型/常量声明。

静态资源：描述中若出现 `assets/{hash}.ext` 形式的路径，使用 `staticFile("assets/{hash}.ext")` 传给 `<Img src={...} />` 等（路径格式与 compile 输出一致，**无前导 `/`**）。

---

## 动画与 `@enter` / `@exit`

块的入场、离场由引擎的 **BlockFrame** 统一包裹处理（fade / slide / zoom 等预设）。你在组件内**无需**实现整块入场/离场；专注于 hold 阶段的版面与动画即可。

---

## 骨架示例（fade-in 标题块）

下列示例展示最小合法结构（可按描述替换文案、布局与动画；保留 default export 与安全区处理思路）：

```tsx
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
} from "remotion";
import type { AnimationProps } from "./animation-types";

export default function Component({
  subtitleSafeBottom,
  theme,
  durationInFrames,
}: AnimationProps) {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, Math.min(20, durationInFrames)], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.colors.bg,
        color: theme.colors.fg,
        fontFamily: theme.fonts.sans,
        paddingBottom: subtitleSafeBottom,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <h1 style={{ opacity, fontSize: 56, margin: 0, textAlign: "center" }}>
        Example Title
      </h1>
    </AbsoluteFill>
  );
}
```

说明：`./animation-types` 仅在 **visuals 校验用 tsconfig** 中由 shim 提供类型别名；你生成代码时应保留与该 shim 一致的 import 路径（实现阶段由仓库固定为 `./animation-types`）。

---

## 质量要点

- TypeScript 严格模式可编译：避免隐式 `any`，事件处理器若未使用可省略。
- 优先可读、克制的动效；避免过度依赖 `durationInFrames` 之外的魔法数，可从 `fps` 推导帧数。
- 若描述含时间线 `Xs:`，可将秒转换为帧：`Math.round(seconds * fps)`，并与 `durationInFrames` clamp。
~~~

### Tool 返回形状示例

```json
{
  "tsx": "import { AbsoluteFill, useCurrentFrame, interpolate } from \"remotion\";\nimport type { AnimationProps } from \"./animation-types\";\nexport default function Component(props: AnimationProps) {\n  const frame = useCurrentFrame();\n  return <AbsoluteFill style={{ backgroundColor: props.theme.colors.bg }} />;\n}\n"
}
```
