#!/usr/bin/env node
import { Command } from "commander";

function notImplemented(): never {
  console.error("not implemented");
  process.exitCode = 1;
  process.exit(1);
}

const program = new Command()
  .name("autovideo")
  .description("Compile Markdown teaching scripts to MP4");

program
  .command("build")
  .description("Run compile → tts → visuals → render")
  .argument("<project.json>")
  .action(() => notImplemented());

program
  .command("compile")
  .description("Markdown + project.json → script.json")
  .argument("<project.json>")
  .action(() => notImplemented());

program
  .command("tts")
  .description("Narration → WAV + line timings")
  .argument("<script.json>")
  .action(() => notImplemented());

program
  .command("visuals")
  .description("Generate React components per block")
  .argument("<script.json>")
  .action(() => notImplemented());

program
  .command("render")
  .description("Render partial MP4s and concat")
  .argument("<script.json>")
  .action(() => notImplemented());

program
  .command("preview")
  .description("Open Remotion Studio for a script")
  .argument("<script.json>")
  .action(() => notImplemented());

program
  .command("cache")
  .description("Inspect or clean global cache")
  .argument("[subcommand]")
  .action(() => notImplemented());

program
  .command("doctor")
  .description("Check local environment and dependencies")
  .action(() => notImplemented());

program
  .command("init")
  .description("Scaffold a starter project directory")
  .argument("<dir>")
  .action(() => notImplemented());

await program.parseAsync(process.argv);
