#!/usr/bin/env node
import { Command } from "commander";

function notImplemented(): never {
  console.error("not implemented");
  process.exit(1);
}

const program = new Command();

program.name("autovideo").description("Compile Markdown teaching scripts into MP4 videos");

program
  .command("build")
  .argument("<project.json>", "project manifest path")
  .description("Run compile → tts → visuals → render")
  .action(() => notImplemented());

program
  .command("compile")
  .argument("<project.json>", "project manifest path")
  .description("Markdown → script.json IR")
  .action(() => notImplemented());

program
  .command("tts")
  .argument("<script.json>", "compiled script path")
  .description("Generate narration audio")
  .action(() => notImplemented());

program
  .command("visuals")
  .argument("<script.json>", "script path")
  .description("Generate block React components via Claude")
  .action(() => notImplemented());

program
  .command("render")
  .argument("<script.json>", "script path")
  .description("Render partial MP4s and concat")
  .action(() => notImplemented());

program
  .command("preview")
  .argument("<script.json>", "script path")
  .description("Open Remotion Studio")
  .action(() => notImplemented());

program
  .command("cache")
  .description("Inspect or clean global cache")
  .action(() => notImplemented());

program.command("doctor").description("Environment diagnostics").action(() => notImplemented());

program
  .command("init")
  .argument("<dir>", "target directory")
  .description("Create starter template project")
  .action(() => notImplemented());

program.parse();
