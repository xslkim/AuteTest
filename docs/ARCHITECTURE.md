# AutoVideo 架构说明

面向贡献者的概览；流水线细节见根目录 `PRD.md`。

---

## Visuals prompt（块组件生成）

### 目的

`visuals` 阶段为每个块调用 Claude，根据 `script.json` 中该块的 `visual.description` 生成 **Remotion/React 组件**（`src/blocks/B**/Component.tsx`）。为保证提示词可缓存（Anthropic prompt caching）且迭代可预期，**完整 system prompt** 固化在仓库文件：

`src/ai/prompts/component.md`

运行时将该文件整体作为 system 消息的长寿命部分；用户消息携带块描述、画布尺寸、`theme` JSON、`subtitleSafeBottom` 等。**不得**在代码里拼接大段即兴英文 prompt 替代该文件——变更提示词应通过修改 `component.md` 并发布新版本完成。

### promptVersion（缓存）

组件缓存键的一部分为 `promptVersion`（PRD §11.2）：取 **`component.md` 文件内容的 MD5 十六进制字符串前 8 位**。实现上与 `src/cli/cache.ts` 中 `readPromptVersionPrefix()` 一致（`createHash("md5").update(fileBytes).digest("hex").slice(0, 8)`）。

- 文件字节不变 → 前缀不变 → 旧 component 缓存不因 prompt 变更误命中。
- 任一字节变化 → 前缀变化 → `--stale` 清理时可剔除 `promptVersion` 过期的 component 条目。

### System prompt 内含要点（与 `component.md` 对齐）

1. **类型契约**：内联文档化的 `AnimationProps` 与 `Theme`，与 `src/types/script.ts` 中 PRD §4 定义一致。
2. **输出格式**：工具调用仅返回 `{ "tsx": string }`，`tsx` 为完整 TSX 模块字符串。
3. **布局约束**：全屏 `width × height`；主要内容避开底部 `subtitleSafeBottom` 像素；不在组件内绘制字幕。
4. **import 白名单**：仅 `react`、`remotion`；禁止 Node 内置、`require`、`eval`、`Function` 构造及其他 npm 包。
5. **安全与纯度**：禁止顶层副作用（如 `fetch`、文件访问）；入场/离场由引擎 `BlockFrame` 处理，组件专注 hold 阶段内容。
6. **骨架示例**：含基于 `AbsoluteFill` + `interpolate` + `useCurrentFrame` 的淡入标题示例；类型从 `./animation-types` 引入（由 `tsconfig.visuals.json` 与校验 shim 提供，见后续 T4.4/T4.5）。

### 样例：期望的 tool 返回形状

```json
{
  "tsx": "import { AbsoluteFill, useCurrentFrame, interpolate } from \"remotion\";\nimport type { AnimationProps } from \"./animation-types\";\nexport default function Component(props: AnimationProps) {\n  const frame = useCurrentFrame();\n  return <AbsoluteFill style={{ backgroundColor: props.theme.colors.bg }} />;\n}\n"
}
```

### 与 Claude SDK 的衔接（T4.2+）

- System：`component.md` 全文 +（可选）将不变块打上 `cache_control: ephemeral` 以提升命中率。
- User：块 ID、`visual.description`、`meta.theme`、`width`/`height`、`subtitleSafeBottom`、`fps`、资产清单摘要等。
- 重试：验证失败时 user 侧追加 `tsc`/渲染错误摘要；system 文件保持不变以利于 prompt cache。
