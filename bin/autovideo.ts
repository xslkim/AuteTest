#!/usr/bin/env node
import { Command } from "commander";

function notImplemented(): never {
  console.error("not implemented");
  process.exit(1);
}

const program = new Command();

program.name("autovideo").description("Markdown → MP4 教学视频 CLI").showHelpAfterError(true);

program
  .command("build")
  .argument("<project.json>", "project manifest path")
  .description("一键全流程：compile → tts → visuals → render")
  .action(() => notImplemented());

program
  .command("compile")
  .argument("<project.json>", "project manifest path")
  .description("Markdown DSL → script.json（IR）")
  .option("--out <dir>")
  .option("--config <file>")
  .option("--meta <key=value...>")
  .action(() => notImplemented());

program
  .command("tts")
  .argument("<script.json>", "compiled script path")
  .description("旁白 → 音频 + lineTimings")
  .option("--block <ids>")
  .option("--force")
  .option("--config <file>")
  .action(() => notImplemented());

program
  .command("visuals")
  .argument("<script.json>", "script path")
  .description("visual 描述 → React 组件")
  .option("--block <ids>")
  .option("--force")
  .option("--config <file>")
  .action(() => notImplemented());

program
  .command("render")
  .argument("<script.json>", "script path")
  .description("IR + 资产 → partial MP4 与成片")
  .option("--block <ids>")
  .option("--force")
  .option("--config <file>")
  .action(() => notImplemented());

program
  .command("preview")
  .argument("<script.json>", "script path")
  .description("Remotion Studio 预览")
  .option("--block <id>")
  .option("--config <file>")
  .action(() => notImplemented());

const cacheCmd = program.command("cache").description("全局缓存 stats / clean");
cacheCmd.command("stats").description("缓存统计").action(() => notImplemented());
cacheCmd
  .command("clean")
  .description("清理缓存")
  .option("--type <audio|component|partial>")
  .option("--older-than <ms>")
  .option("--stale")
  .action(() => notImplemented());

program.command("doctor").description("环境自检").action(() => notImplemented());

program
  .command("init")
  .argument("<dir>", "生成模板项目的目录")
  .description("生成 starter 模板")
  .action(() => notImplemented());

await program.parseAsync(process.argv);
