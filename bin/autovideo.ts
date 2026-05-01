#!/usr/bin/env node

import { Command } from "commander";

function notImplemented(): never {
  throw new Error("not implemented");
}

const program = new Command().name("autovideo").description("Markdown to MP4 toolchain");

program
  .command("build")
  .argument("<project.json>")
  .action(notImplemented);

program
  .command("compile")
  .argument("<project.json>")
  .action(notImplemented);

program.command("tts").argument("<script.json>").action(notImplemented);

program.command("visuals").argument("<script.json>").action(notImplemented);

program.command("render").argument("<script.json>").action(notImplemented);

program.command("preview").argument("<script.json>").action(notImplemented);

program.command("cache").argument("[args...]").action(notImplemented);

program.command("doctor").action(notImplemented);

program.command("init").argument("<dir>").action(notImplemented);

async function main() {
  await program.parseAsync(process.argv);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
