#!/usr/bin/env node
import { Command } from "commander";

function notImplemented(): never {
  console.error("not implemented");
  process.exit(1);
}

const program = new Command();

program.name("autovideo").description("Markdown → MP4 teaching video CLI");

program
  .command("build")
  .argument("<project.json>", "project manifest")
  .action(() => notImplemented());

program
  .command("compile")
  .argument("<project.json>", "project manifest")
  .action(() => notImplemented());

program.command("tts").argument("<script.json>", "IR").action(() => notImplemented());

program.command("visuals").argument("<script.json>", "IR").action(() => notImplemented());

program.command("render").argument("<script.json>", "IR").action(() => notImplemented());

program.command("preview").argument("<script.json>", "IR").action(() => notImplemented());

program.command("cache").description("cache stats | clean").action(() => notImplemented());

program.command("doctor").description("environment checks").action(() => notImplemented());

program.command("init").argument("<dir>", "target directory").action(() => notImplemented());

program.parse();
