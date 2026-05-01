# Starter 模板

由此目录创建的 AutoVideo 项目包含 `project.json`、`meta.md` 与 `script.md`。按下面步骤即可运行 `build`。

## 1. 放置参考音色 `B00.wav`

将 **10–30 秒清晰人声 WAV** 放到 **`meta.md` 同目录**，文件名为 **`B00.wav`**（与 PRD 默认约定一致）。

未放置时，`compile` 会因找不到参考音色而失败。

## 2. 设置 Claude API Key

在项目目录或 shell 环境中导出：

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

`visuals` 阶段调用 Claude；未设置时会失败。可先运行 `autovideo doctor` 查看环境检查结果。

## 3. 运行 doctor

在项目目录执行（将 `PROJECT_DIR` 换为你的项目路径，`autovideo` 为 CLI 入口，例如已通过 `npm link` 或使用 `npx`）：

```bash
cd PROJECT_DIR
autovideo doctor
```

根据输出的 PASS/WARN/FAIL 修复依赖（ffmpeg、磁盘、缓存目录、可选 VoxCPM 等）。

## 4. 运行 build

```bash
cd PROJECT_DIR
autovideo build project.json
```

将依次执行 `compile` → `tts` → `visuals` → `render`，最终在构建输出目录生成 `output/final_normalized.mp4`（参见 PRD）。

## script.md 说明

模板含两个块：**文字标题卡**（B01）与 **引用 `./hero.png` 的示例块**（B02）。可自行增删块；引用本地图片请使用 `./` 或 `../` 开头的相对路径。
