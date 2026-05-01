#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();
program.name("autovideo").description("Compile Markdown DSL to MP4");

const notImplemented = (): never => {
  console.error("not implemented");
  process.exit(1);
};

program
  .command("build")
  .description("Run compile → tts → visuals → render")
  .argument("<project-json>", "path to project.json")
  .action(notImplemented);

program
  .command("compile")
  .description("Markdown → script.json")
  .argument("<project-json>", "path to project.json")
  .action(notImplemented);

program
  .command("tts")
  .description("Synthesize narration audio")
  .argument("<script-json>", "path to script.json")
  .action(notImplemented);

program
  .command("visuals")
  .description("Generate React components for blocks")
  .argument("<script-json>", "path to script.json")
  .action(notImplemented);

program
  .command("render")
  .description("Render partials and final MP4")
  .argument("<script-json>", "path to script.json")
  .action(notImplemented);

program
  .command("preview")
  .description("Open Remotion Studio")
  .argument("<script-json>", "path to script.json")
  .action(notImplemented);

program
  .command("cache")
  .description("Cache stats / clean")
  .argument("[subcommand]", "stats | clean")
  .action(notImplemented);

program
  .command("doctor")
  .description("Check environment")
  .action(notImplemented);

program
  .command("init")
  .description("Scaffold a starter project")
  .argument("<dir>", "target directory")
  .action(notImplemented);

program.parse();
