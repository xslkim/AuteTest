#!/usr/bin/env node
import { Command } from "commander";

function notImplemented(): never {
  console.error("not implemented");
  process.exitCode = 1;
  process.exit(1);
}

const program = new Command();
program
  .name("autovideo")
  .description("Markdown 教学口播稿 → MP4（AutoVideo）");

program
  .command("build")
  .description("一键全流程：compile → tts → visuals → render")
  .argument("<project>", "project.json 路径")
  .action(() => notImplemented());

program
  .command("compile")
  .description("project.json → script.json")
  .argument("<project>", "project.json 路径")
  .action(() => notImplemented());

program
  .command("tts")
  .description("旁白 → 音频 + lineTimings")
  .argument("<script>", "script.json 路径")
  .action(() => notImplemented());

program
  .command("visuals")
  .description("visual 描述 → React 组件")
  .argument("<script>", "script.json 路径")
  .action(() => notImplemented());

program
  .command("render")
  .description("渲染块级 partial 与成片")
  .argument("<script>", "script.json 路径")
  .action(() => notImplemented());

program
  .command("preview")
  .description("Remotion Studio 预览")
  .argument("<script>", "script.json 路径")
  .action(() => notImplemented());

program
  .command("cache")
  .description("缓存统计与清理")
  .action(() => notImplemented());

program
  .command("doctor")
  .description("环境检查")
  .action(() => notImplemented());

program
  .command("init")
  .description("初始化模板项目目录")
  .argument("<dir>", "目标目录")
  .action(() => notImplemented());

program.parse();
