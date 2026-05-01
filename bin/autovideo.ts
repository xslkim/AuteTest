#!/usr/bin/env node
import { Command } from "commander";

function notImplemented(): never {
  console.error("not implemented");
  process.exit(1);
}

const program = new Command();

program.name("autovideo").description("Markdown 口播稿 → MP4").version("0.0.0");

program.command("build").description("一键全流程").argument("<project.json>").action(() => notImplemented());

program.command("compile").description("Markdown → script.json").argument("<project.json>").action(() => notImplemented());

program.command("tts").description("旁白 → 音频").argument("<script.json>").action(() => notImplemented());

program.command("visuals").description("生成块组件").argument("<script.json>").action(() => notImplemented());

program.command("render").description("渲染 partial 与成片").argument("<script.json>").action(() => notImplemented());

program.command("preview").description("Remotion Studio 预览").argument("<script.json>").action(() => notImplemented());

program
  .command("cache")
  .description("缓存管理")
  .argument("<stats|clean>", "子操作")
  .action(() => notImplemented());

program.command("doctor").description("环境自检").action(() => notImplemented());

program.command("init").description("生成模板项目").argument("<dir>").action(() => notImplemented());

program.parse();
