#!/usr/bin/env node

import { Command } from "commander";

function notImplemented(): never {
  console.error("not implemented");
  process.exit(1);
}

const program = new Command();

program
  .name("autovideo")
  .description("Compile Markdown narration + visuals into instructional MP4.");

program
  .command("build")
  .description("Run compile → tts → visuals → render")
  .argument("<project.json>", "Project JSON entry")
  .action(notImplemented);

program
  .command("compile")
  .description("Compile project to script.json")
  .argument("<project.json>")
  .action(notImplemented);

program
  .command("tts")
  .description("Synthesize narration to WAV")
  .argument("<script.json>")
  .action(notImplemented);

program
  .command("visuals")
  .description("Generate block components via LLM")
  .argument("<script.json>")
  .action(notImplemented);

program
  .command("render")
  .description("Render partials and final MP4")
  .argument("<script.json>")
  .action(notImplemented);

program
  .command("preview")
  .description("Open Remotion Studio for blocks")
  .argument("<script.json>")
  .action(notImplemented);

program
  .command("cache")
  .description("Global cache stats and cleanup")
  .argument("[args...]")
  .action(notImplemented);

program
  .command("doctor")
  .description("Environment checks")
  .action(notImplemented);

program
  .command("init")
  .description("Scaffold a starter project")
  .argument("<dir>")
  .action(notImplemented);

program.parse();
