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
  .argument("<project.json>", "project entry JSON")
  .action(() => notImplemented());

program
  .command("compile")
  .argument("<project.json>", "project entry JSON")
  .action(() => notImplemented());

program
  .command("tts")
  .argument("<script.json>", "compiled script IR")
  .action(() => notImplemented());

program
  .command("visuals")
  .argument("<script.json>", "compiled script IR")
  .action(() => notImplemented());

program
  .command("render")
  .argument("<script.json>", "script IR with audio and components")
  .action(() => notImplemented());

program
  .command("preview")
  .argument("<script.json>", "script IR")
  .action(() => notImplemented());

program
  .command("cache")
  .argument("[subcommand]", "stats | clean")
  .action(() => notImplemented());

program.command("doctor").action(() => notImplemented());

program
  .command("init")
  .argument("<dir>", "target directory")
  .action(() => notImplemented());

program.parse();
