#!/usr/bin/env node
import { Command } from "commander";

const notImplemented = (): never => {
  throw new Error("not implemented");
};

const program = new Command("autovideo")
  .description("Compile Markdown teaching scripts to MP4")
  .version("0.0.0");

program
  .command("build")
  .description("Run compile → tts → visuals → render")
  .argument("<project.json>", "path to project.json")
  .action(notImplemented);

program
  .command("compile")
  .description("Markdown project → script.json")
  .argument("<project.json>", "path to project.json")
  .action(notImplemented);

program
  .command("tts")
  .description("Generate block audio from script.json")
  .argument("<script.json>", "path to script.json")
  .action(notImplemented);

program
  .command("visuals")
  .description("Generate React components for blocks")
  .argument("<script.json>", "path to script.json")
  .action(notImplemented);

program
  .command("render")
  .description("Render partials and final MP4")
  .argument("<script.json>", "path to script.json")
  .action(notImplemented);

program
  .command("preview")
  .description("Open Remotion Studio for script.json")
  .argument("<script.json>", "path to script.json")
  .action(notImplemented);

program
  .command("cache")
  .description("Inspect or clean global cache")
  .argument("[subcommand]", "stats | clean")
  .action(notImplemented);

program
  .command("doctor")
  .description("Check local environment")
  .action(notImplemented);

program
  .command("init")
  .description("Scaffold a starter project directory")
  .argument("<dir>", "target directory")
  .action(notImplemented);

await program.parseAsync(process.argv);
