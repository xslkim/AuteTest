#!/usr/bin/env node
import { Command } from "commander";

function exitNotImplemented(): never {
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
  .description("Run compile, tts, visuals, and render")
  .argument("<project.json>", "path to project.json")
  .action(exitNotImplemented);

program
  .command("compile")
  .description("Parse project and write script.json")
  .argument("<project.json>", "path to project.json")
  .action(exitNotImplemented);

program
  .command("tts")
  .description("Synthesize narration audio via VoxCPM")
  .argument("<script.json>", "path to script.json")
  .action(exitNotImplemented);

program
  .command("visuals")
  .description("Generate React components for each block")
  .argument("<script.json>", "path to script.json")
  .action(exitNotImplemented);

program
  .command("render")
  .description("Render partials and concatenate final MP4")
  .argument("<script.json>", "path to script.json")
  .action(exitNotImplemented);

program
  .command("preview")
  .description("Open Remotion Studio for a script")
  .argument("<script.json>", "path to script.json")
  .action(exitNotImplemented);

const cache = program.command("cache").description("Inspect and manage cache");

cache
  .command("stats")
  .description("Show cache statistics")
  .action(exitNotImplemented);

cache.command("clean").description("Remove cache entries").action(exitNotImplemented);

program.command("doctor").description("Check local environment").action(exitNotImplemented);

program
  .command("init")
  .description("Scaffold a starter project directory")
  .argument("<dir>", "target directory")
  .action(exitNotImplemented);

program.parse();
