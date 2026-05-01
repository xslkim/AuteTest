#!/usr/bin/env node
import { Command } from "commander";

function notImplemented(): never {
  console.error("not implemented");
  process.exit(1);
}

const program = new Command();

program
  .name("autovideo")
  .description("Compile Markdown teaching scripts into MP4 videos.");

program
  .command("build")
  .argument("[project]", "project.json path")
  .description("Run compile → tts → visuals → render.")
  .action(notImplemented);

program
  .command("compile")
  .argument("<project>", "project.json path")
  .description("Markdown → script.json")
  .action(notImplemented);

program
  .command("tts")
  .argument("<script>", "script.json path")
  .description("Generate audio from narration.")
  .action(notImplemented);

program
  .command("visuals")
  .argument("<script>", "script.json path")
  .description("Generate React components for blocks.")
  .action(notImplemented);

program
  .command("render")
  .argument("<script>", "script.json path")
  .description("Render partial MP4s and final output.")
  .action(notImplemented);

program
  .command("preview")
  .argument("<script>", "script.json path")
  .description("Open Remotion Studio.")
  .action(notImplemented);

program
  .command("cache")
  .argument("[subcommand]", "stats | clean")
  .description("Inspect or clean global cache.")
  .action(notImplemented);

program
  .command("doctor")
  .description("Check environment and dependencies.")
  .action(notImplemented);

program
  .command("init")
  .argument("<dir>", "target directory")
  .description("Create a starter project.")
  .action(notImplemented);

program.parse();
