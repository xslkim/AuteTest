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
  .argument("<project.json>", "path to project.json")
  .description("Run compile → tts → visuals → render")
  .action(notImplemented);

program
  .command("compile")
  .argument("<project.json>", "path to project.json")
  .description("Markdown + project → script.json")
  .action(notImplemented);

program
  .command("tts")
  .argument("<script.json>", "path to script.json")
  .description("Narration → audio + line timings")
  .action(notImplemented);

program
  .command("visuals")
  .argument("<script.json>", "path to script.json")
  .description("Generate React components per block")
  .action(notImplemented);

program
  .command("render")
  .argument("<script.json>", "path to script.json")
  .description("Render partial MP4s and final output")
  .action(notImplemented);

program
  .command("preview")
  .argument("<script.json>", "path to script.json")
  .description("Open Remotion Studio")
  .action(notImplemented);

program
  .command("cache")
  .argument("[subcommand]", "stats | clean")
  .description("Inspect or clean global cache")
  .action(notImplemented);

program.command("doctor").description("Check environment and dependencies").action(notImplemented);

program
  .command("init")
  .argument("<dir>", "directory to scaffold")
  .description("Create a starter project template")
  .action(notImplemented);

await program.parseAsync(process.argv);
