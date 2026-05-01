#!/usr/bin/env node
import { Command } from "commander";

function notImplemented(): never {
  console.error("not implemented");
  process.exit(1);
}

const program = new Command();

program
  .name("autovideo")
  .description("Compile Markdown teaching scripts into MP4 videos")
  .version("0.0.0");

program
  .command("build")
  .argument("<project.json>", "project file path")
  .description("Run compile → tts → visuals → render")
  .action(notImplemented);

program
  .command("compile")
  .argument("<project.json>", "project file path")
  .description("Parse project + markdown into script.json")
  .action(notImplemented);

program
  .command("tts")
  .argument("<script.json>", "script IR path")
  .description("Synthesize narration audio (VoxCPM)")
  .action(notImplemented);

program
  .command("visuals")
  .argument("<script.json>", "script IR path")
  .description("Generate React components for blocks (Claude)")
  .action(notImplemented);

program
  .command("render")
  .argument("<script.json>", "script IR path")
  .description("Render partial MP4s and final output")
  .action(notImplemented);

program
  .command("preview")
  .argument("<script.json>", "script IR path")
  .description("Open Remotion Studio for a script")
  .action(notImplemented);

program
  .command("cache")
  .description("Inspect or clean autovideo cache")
  .action(notImplemented);

program.command("doctor").description("Check environment and dependencies").action(notImplemented);

program
  .command("init")
  .argument("<dir>", "target directory")
  .description("Create a starter project from templates")
  .action(notImplemented);

program.parse();
