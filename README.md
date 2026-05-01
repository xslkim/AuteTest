# AutoVideo

把 **Markdown 口播稿** 编译成 **带字幕与配音的教学 MP4**：每个块的画面由 Claude 根据自然语言描述生成 Remotion/React 组件，TTS（VoxCPM2）按你的参考 WAV **克隆音色**。

---

## 5 分钟快速开始

### 1. 准备环境（Ubuntu 22.04+ 推荐）

```bash
./install.sh
# 或使用 --skip-model 跳过大块模型下载（仅适合开发/自检；完整 TTS 仍需权重）
```

安装 Node 20、ffmpeg、Python venv、`tts-server` 依赖与可选 Chromium 相关项，并跑一次 `autovideo doctor`。  
一键全绿需要：**有效 `ANTHROPIC_API_KEY`**、**VoxCPM 权重**、可写缓存目录与足够磁盘。

### 2. 克隆本仓库并安装/npm 编译

```bash
git clone <本仓库 URL> autovideo && cd autovideo
npm install
npm run build
```

日常使用：

```bash
npx tsx bin/autovideo.ts --help
# 或在 package 链接后：`autovideo --help`
```

### 3. 初始化演示项目

```bash
npx tsx bin/autovideo.ts init ./demo-tutorial
```

在 **`demo-tutorial/` 与 `meta.md` 同目录**放置参考音色 **`B00.wav`**（10–30 秒清晰人声 WAV）。编辑 `meta.md`、`script.md`、`project.json` 符合你的讲义。

### 4. 出片

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# 确保 VoxCPM 服务可达（参见 autovideo.config.json 与 PRD）

npx tsx bin/autovideo.ts doctor
npx tsx bin/autovideo.ts build ./demo-tutorial/project.json
```

成片默认在 **`./build/<slug>/output/final_normalized.mp4`**（`slug` 来自标题或 meta 里的 `slug:`）。

### 5. 调整单块

```bash
npx tsx bin/autovideo.ts visuals ./build/<slug>/script.json --block B02 --force
npx tsx bin/autovideo.ts render ./build/<slug>/script.json --block B02 --force
```

本地预览某块（Remotion Studio）：

```bash
npx tsx bin/autovideo.ts preview ./build/<slug>/script.json --block B02
```

---

## 文档

| 文档 | 内容 |
|------|------|
| [docs/INPUT_SPEC.md](docs/INPUT_SPEC.md) | `project.json`、`meta.md`、块语法（用户向） |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 流水线、缓存、隔离、主题扩展、Visuals 完整 system prompt |
| [PRD.md](PRD.md) | 产品需求与契约 |

---

## 开发与测试

```bash
npm run build      # tsc
npm test           # 单元/集成（不含 E2E）
npm run test:e2e   # 需要 ffmpeg + Chromium；完整管线 mock
```
