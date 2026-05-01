# AutoVideo 输入规范（用户）

本文说明如何组织一个可编译、可出片的 AutoVideo 项目。产品级细节与数据模型见根目录 `PRD.md`。

---

## 1. 项目入口：`project.json`

与 `project.json` **同目录** 下的相对路径均以此文件为基准解析。

```json
{
  "meta": "./meta.md",
  "blocks": ["./intro.md", "./part1.md"]
}
```

| 字段 | 说明 |
|------|------|
| `meta` | 全局配置 Markdown 文件路径（仅含 `--- meta ---` 段，**不得**写块内容）。 |
| `blocks` | 若干内容文件路径，**按数组顺序**合并；文件内只含教学块，不包含 meta 段。 |

仅允许这两个顶层键；多写键会报错。

---

## 2. 全局设置：`meta.md`

```markdown
--- meta ---
title: 我的第一课
aspect: 16:9
theme: dark-code
fps: 30
voiceRef: ./B00.wav
slug: my-course
---
```

| 字段 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `title` | 是 | — | 视频标题；也用于默认输出目录 `./build/{slug}/` 中的 slug（见下）。 |
| `aspect` | 否 | `16:9` | `16:9` / `9:16` / `1:1`，决定输出分辨率。 |
| `theme` | 否 | `dark-code` | 视觉主题名；须与实现中已注册主题一致（当前主要为 `dark-code`）。 |
| `fps` | 否 | `30` | 帧率。 |
| `voiceRef` | 否 | 与 `meta.md` 同目录下的 `./B00.wav` | 10–30 秒清晰人声 WAV，**全片唯一参考音色**；路径相对 `meta.md` 所在目录或绝对路径；`compile` 时校验存在。 |
| `slug` | 否 | 由 `title` 自动 slugify | 输出目录名 `./build/{slug}/`；可避免标题中的特殊字符带来的路径问题。 |

CLI 可用 `--meta key=value` **仅覆盖上述表格中的 meta 字段**（不支持点号嵌套路径）。`render`、`voxcpm` 等请在 `autovideo.config.json` 中配置。

---

## 3. 内容文件（`*.md`）

每个文件由**一个或多个块**组成。**不得**包含 `--- meta ---` 段。

### 3.1 块结构

```
>>> 块标题 #B01

@enter: fade-up
@exit: fade
@duration: 8s

--- visual ---
（自然语言描述本块画面；可含可选时间线 `3s:`、`6s:` 等）

--- narration ---
（旁白，一行一条字幕）
第二行是另一条字幕
```

- 以 `>>>` 开启新块；行末可写 **`#B01` 形式的块 ID**（大写 `B` + 两位数字）。省略时按**所有 blocks 文件合并后的顺序**自动编号。
- 块标题行与两个内容段之间可写 **directive**（`@enter` / `@exit` / `@duration`）。
- 每个块**必须**同时包含 `--- visual ---` 与 `--- narration ---` 两段，顺序固定：标题 → directive → visual → narration。
- 首个 `>>>` **之前**不能有非空行（避免误把说明写进内容区）。

### 3.2 Directive

| 指令 | 默认 | 说明 |
|------|------|------|
| `@enter` | `fade` | 入场预设：`fade`、`fade-up`、`fade-down`、`slide-left`、`slide-right`、`zoom-in`、`zoom-out`、`none`。 |
| `@exit` | `fade` | 出场预设（同上）。 |
| `@duration` | 自动 | **仅**允许 `<数字>s`，如 `8s`、`1.5s`；有旁白时可省略，由 TTS 时长与最小时长共同决定成片 hold。 |

预设时长由配置的 `defaultEnterSec` / `defaultExitSec` 统一控制；`none` 为 0 秒。

### 3.3 `--- visual ---` 写法

- 用自然语言描述画面；需要节奏时可用 `0s:`、`3s:` 等标注时刻。
- **本地资源**（图片、将被内联的源码文件）须写 **以 `./` 或 `../` 开头** 的相对路径（相对**当前 .md 文件**所在目录）。
- `compile` 会把文件按内容 hash 复制到构建目录下的 `public/assets/{hash}.ext`，并把描述里的路径替换为 **`assets/{hash}.ext`**（无 leading `/`），生成组件中用 `staticFile("assets/....")` 引用。
- 代码文件若写明「第 X–Y 行」，`compile` 只把该行号范围 ± 上下文内联进描述，不全文塞入 prompt。

### 3.4 `--- narration ---` 与字幕

- **每个非空行 = 一行字幕**（对应一次 TTS 与一行字幕时间轴）；**空行忽略**。
- `**词语**` 在字幕中高亮；TTS 会读纯文本（去掉星号）。
- 需要字面 `**` 时写成 **`\*\*`**。

每行音频末尾管线会追加 **固定 200ms 静音**，再拼下一句。

---

## 4. 构建输出（概念）

默认输出目录：**`./build/{slug}/`**（slug 来自 `meta.md` 的 `slug:` 或标题 slugify）。

你将得到canonical IR **`script.json`**，以及后续的 `public/audio/`、`src/blocks/**/Component.tsx`、`output/partials/`、`output/final_normalized.mp4` 等。详见 `PRD.md` §8。

---

## 5. 常用命令（速查）

```bash
autovideo init ./my-demo          # 脚手架
autovideo doctor                  # 环境检查
autovideo build ./my-demo/project.json
autovideo compile ./my-demo/project.json --out ./build/custom
autovideo tts ./build/.../script.json
autovideo visuals ./build/.../script.json
autovideo render ./build/.../script.json
autovideo preview ./build/.../script.json --block B01
```

`--cache-dir`、`--config`、`--verbose`、`--dry-run`、`--force`、`--block` 等行为见 `PRD.md` §7 与 `--help`。
