#!/usr/bin/env node
import { Command } from "commander";

function notImplemented(): never {
  console.error("not implemented");
  process.exit(1);
}

const program = new Command();
program.name("autovideo").description("Markdown course to MP4").version("0.0.0");

program
  .command("build")
  .description("Run compile → tts → visuals → render")
  .argument("<project.json>", "path to project.json")
  .action(notImplemented);

program
  .command("compile")
  .description("Markdown → script.json (IR)")
  .argument("<project.json>", "path to project.json")
  .action(notImplemented);

program
  .command("tts")
  .description("Narration → per-block audio + line timings")
  .argument("<script.json>", "path to script.json")
  .action(notImplemented);

program
  .command("visuals")
  .description("Generate React components per block (Claude)")
  .argument("<script.json>", "path to script.json")
  .action(notImplemented);

program
  .command("render")
  .description("Remotion partials → final MP4")
  .argument("<script.json>", "path to script.json")
  .action(notImplemented);

program
  .command("preview")
  .description("Open Remotion Studio for script.json")
  .argument("<script.json>", "path to script.json")
  .action(notImplemented);

program
  .command("cache")
  .description("View or clean global cache")
  .argument("[args...]", "stats | clean …")
  .action(notImplemented);

program
  .command("doctor")
  .description("Check local environment (ffmpeg, chromium, …)")
  .action(notImplemented);

program
  .command("init")
  .description("Scaffold a starter project directory")
  .argument("<dir>", "target directory")
  .action(notImplemented);

program.parse();
