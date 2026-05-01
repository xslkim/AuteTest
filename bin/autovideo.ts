#!/usr/bin/env node
import { Command } from "commander";

function notImplemented(): never {
  console.error("not implemented");
  process.exit(1);
}

const program = new Command();
program.name("autovideo").description("Compile Markdown teaching scripts to MP4");

program
  .command("build")
  .argument("<project.json>", "project file")
  .allowExcessArguments(false)
  .action(notImplemented);

program
  .command("compile")
  .argument("<project.json>", "project file")
  .allowExcessArguments(false)
  .action(notImplemented);

program
  .command("tts")
  .argument("<script.json>", "compiled script IR")
  .allowExcessArguments(false)
  .action(notImplemented);

program
  .command("visuals")
  .argument("<script.json>", "script IR")
  .allowExcessArguments(false)
  .action(notImplemented);

program
  .command("render")
  .argument("<script.json>", "script IR")
  .allowExcessArguments(false)
  .action(notImplemented);

program
  .command("preview")
  .argument("<script.json>", "script IR")
  .allowExcessArguments(false)
  .action(notImplemented);

program.command("cache").action(notImplemented);

program.command("doctor").action(notImplemented);

program
  .command("init")
  .argument("<dir>", "target directory")
  .allowExcessArguments(false)
  .action(notImplemented);

program.parse();
