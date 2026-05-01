#!/usr/bin/env node
import { Command } from "commander";

function notImplemented(): never {
  throw new Error("not implemented");
}

const program = new Command();

program
  .name("autovideo")
  .description("Markdown teaching scripts → MP4")
  .showHelpAfterError();

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
  .argument("<script.json>", "script IR")
  .action(() => notImplemented());

program
  .command("render")
  .argument("<script.json>", "script IR")
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

program.command("init").argument("<dir>", "target directory").action(() => notImplemented());

await program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exitCode = 1;
});
