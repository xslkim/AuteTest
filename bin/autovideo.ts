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
  .argument("<project.json>", "Project manifest path")
  .action(() => notImplemented());

program
  .command("compile")
  .argument("<project.json>", "Project manifest path")
  .action(() => notImplemented());

program
  .command("tts")
  .argument("<script.json>", "Compiled script path")
  .action(() => notImplemented());

program
  .command("visuals")
  .argument("<script.json>", "Script path")
  .action(() => notImplemented());

program
  .command("render")
  .argument("<script.json>", "Script path")
  .action(() => notImplemented());

program
  .command("preview")
  .argument("<script.json>", "Script path")
  .action(() => notImplemented());

const cache = program.command("cache").description("Cache utilities");
cache.command("stats").action(() => notImplemented());
cache.command("clean").action(() => notImplemented());

program.command("doctor").description("Environment checks").action(() => notImplemented());

program
  .command("init")
  .argument("<dir>", "Target directory")
  .action(() => notImplemented());

await program.parseAsync(process.argv);
