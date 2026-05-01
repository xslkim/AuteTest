#!/usr/bin/env node
import { Command } from "commander";

function notImplemented(): never {
  throw new Error("not implemented");
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("autovideo")
    .description("Markdown → MP4 toolchain")
    .version("0.0.0");

  program.command("build").argument("<project-json>", "project manifest").action(notImplemented);

  program.command("compile").argument("<project-json>", "project manifest").action(notImplemented);

  program.command("tts").argument("<script-json>", "compiled script IR").action(notImplemented);

  program.command("visuals").argument("<script-json>", "script with narration").action(notImplemented);

  program.command("render").argument("<script-json>", "script ready for render").action(notImplemented);

  program.command("preview").argument("<script-json>", "script to preview").action(notImplemented);

  program.command("cache").description("Cache stats / clean").action(notImplemented);

  program.command("doctor").description("Environment checks").action(notImplemented);

  program.command("init").argument("<dir>", "target directory").action(notImplemented);

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exitCode = 1;
});
