#!/usr/bin/env node
import { Command } from "commander";

function notImplemented(): void {
  console.error("not implemented");
  process.exit(1);
}

const program = new Command()
  .name("autovideo")
  .description("Markdown teaching script → MP4");

program
  .command("build")
  .description("Run compile → tts → visuals → render")
  .argument("<project.json>", "Project manifest path")
  .action(notImplemented);

program
  .command("compile")
  .description("Parse Markdown → script.json")
  .argument("<project.json>", "Project manifest path")
  .action(notImplemented);

program
  .command("tts")
  .description("Synthesize narration audio")
  .argument("<script.json>", "Compiled script path")
  .action(notImplemented);

program
  .command("visuals")
  .description("Generate React components per block")
  .argument("<script.json>", "Script path")
  .action(notImplemented);

program
  .command("render")
  .description("Render partials and final MP4")
  .argument("<script.json>", "Script path")
  .action(notImplemented);

program
  .command("preview")
  .description("Open Remotion Studio")
  .argument("<script.json>", "Script path")
  .action(notImplemented);

program
  .command("cache")
  .description("Cache stats / clean")
  .argument("[subcommand]", "stats | clean")
  .action(notImplemented);

program
  .command("doctor")
  .description("Check environment and dependencies")
  .action(notImplemented);

program
  .command("init")
  .description("Scaffold a starter project")
  .argument("<dir>", "Target directory")
  .action(notImplemented);

program.parse();
