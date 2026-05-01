#!/usr/bin/env node
import { Command } from "commander";

function notImplemented(): never {
  console.error("not implemented");
  process.exit(1);
}

const program = new Command()
  .name("autovideo")
  .description("Compile Markdown teaching scripts into MP4 videos");

program
  .command("build")
  .argument("<project.json>", "path to project.json")
  .description("Run compile → tts → visuals → render")
  .action(() => notImplemented());

program
  .command("compile")
  .argument("<project.json>", "path to project.json")
  .description("Markdown → script.json IR")
  .action(() => notImplemented());

program
  .command("tts")
  .argument("<script.json>", "path to script.json")
  .description("Narration → WAV + line timings")
  .action(() => notImplemented());

program
  .command("visuals")
  .argument("<script.json>", "path to script.json")
  .description("Generate React components per block")
  .action(() => notImplemented());

program
  .command("render")
  .argument("<script.json>", "path to script.json")
  .description("Render partial MP4s and concatenate")
  .action(() => notImplemented());

program
  .command("preview")
  .argument("<script.json>", "path to script.json")
  .description("Open Remotion Studio")
  .action(() => notImplemented());

program
  .command("cache")
  .description("Cache stats and cleanup")
  .action(() => notImplemented());

program
  .command("doctor")
  .description("Check environment (ffmpeg, chromium, …)")
  .action(() => notImplemented());

program
  .command("init")
  .argument("<dir>", "directory to scaffold")
  .description("Create starter template project")
  .action(() => notImplemented());

program.parse();
