#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program
  .name("autovideo")
  .description("Compile Markdown teaching scripts into MP4 videos");

function notImplemented(): never {
  console.error("not implemented");
  process.exitCode = 1;
  process.exit(1);
}

program
  .command("build")
  .argument("<project-json>", "project.json path")
  .description("Run compile → tts → visuals → render")
  .action(notImplemented);

program
  .command("compile")
  .argument("<project-json>", "project.json path")
  .description("Markdown → script.json IR")
  .action(notImplemented);

program
  .command("tts")
  .argument("<script-json>", "script.json path")
  .description("Generate block audio from narration")
  .action(notImplemented);

program
  .command("visuals")
  .argument("<script-json>", "script.json path")
  .description("Generate React components per block")
  .action(notImplemented);

program
  .command("render")
  .argument("<script-json>", "script.json path")
  .description("Render partials and final MP4")
  .action(notImplemented);

program
  .command("preview")
  .argument("<script-json>", "script.json path")
  .description("Open Remotion Studio")
  .action(notImplemented);

program
  .command("cache")
  .description("Inspect or clean global cache")
  .action(notImplemented);

program
  .command("doctor")
  .description("Check local environment")
  .action(notImplemented);

program
  .command("init")
  .argument("<dir>", "target directory")
  .description("Scaffold a starter project")
  .action(notImplemented);

program.parse();
