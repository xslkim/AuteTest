#!/usr/bin/env node
import { Command } from "commander";

function notImplemented(): never {
  console.error("not implemented");
  process.exit(1);
}

const program = new Command();
program.name("autovideo").description("Markdown 口播稿 → MP4").version("0.0.0");

program
  .command("build")
  .argument("<project>", "project.json 路径")
  .description("compile → tts → visuals → render")
  .action(() => notImplemented());

program
  .command("compile")
  .argument("<project>", "project.json 路径")
  .description("Markdown → script.json")
  .action(() => notImplemented());

program
  .command("tts")
  .argument("<script>", "script.json 路径")
  .description("旁白 → 音频与时序")
  .action(() => notImplemented());

program
  .command("visuals")
  .argument("<script>", "script.json 路径")
  .description("视觉描述 → React 组件")
  .action(() => notImplemented());

program
  .command("render")
  .argument("<script>", "script.json 路径")
  .description("Remotion → partials + final.mp4")
  .action(() => notImplemented());

program
  .command("preview")
  .argument("<script>", "script.json 路径")
  .description("Remotion Studio 预览")
  .action(() => notImplemented());

program
  .command("cache")
  .description("缓存 stats / clean")
  .action(() => notImplemented());

program.command("doctor").description("环境检查").action(() => notImplemented());

program
  .command("init")
  .argument("<dir>", "目标目录")
  .description("生成模板项目")
  .action(() => notImplemented());

program.parse();
