#!/usr/bin/env node
import { Command } from "commander";

function notImplemented(): never {
  console.error("not implemented");
  process.exit(1);
}

const program = new Command("autovideo").description(
  "Markdown teaching script → MP4 (AutoVideo)",
);

program
  .command("build")
  .description("Run compile → tts → visuals → render")
  .argument("<project>", "project.json path")
  .action(notImplemented);

program
  .command("compile")
  .description("Compile project to script.json")
  .argument("<project>", "project.json path")
  .action(notImplemented);

program
  .command("tts")
  .description("Synthesize narration to audio")
  .argument("<script>", "script.json path")
  .action(notImplemented);

program
  .command("visuals")
  .description("Generate block components via LLM")
  .argument("<script>", "script.json path")
  .action(notImplemented);

program
  .command("render")
  .description("Render partials and concatenate to final.mp4")
  .argument("<script>", "script.json path")
  .action(notImplemented);

program
  .command("preview")
  .description("Open Remotion Studio for a script")
  .argument("<script>", "script.json path")
  .action(notImplemented);

program
  .command("cache")
  .description("Cache stats / clean")
  .argument("[args...]", "cache subcommand and options")
  .action(notImplemented);

program.command("doctor").description("Environment health check").action(notImplemented);

program
  .command("init")
  .description("Scaffold a starter project directory")
  .argument("<dir>", "target directory")
  .action(notImplemented);

program.parse();
