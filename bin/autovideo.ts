#!/usr/bin/env node
import { Command } from "commander";

function notImplemented(): never {
  console.error("not implemented");
  process.exitCode = 1;
  throw new Error("not implemented");
}

const program = new Command()
  .name("autovideo")
  .description("Markdown teaching scripts → MP4")
  .showHelpAfterError();

program
  .command("build")
  .argument("<project.json>", "project manifest path")
  .description("Full pipeline: compile → tts → visuals → render")
  .action(() => notImplemented());

program
  .command("compile")
  .argument("<project.json>", "project manifest path")
  .description("Compile Markdown → script.json")
  .action(() => notImplemented());

program
  .command("tts")
  .argument("<script.json>", "compiled script path")
  .description("Generate block audio via VoxCPM")
  .action(() => notImplemented());

program
  .command("visuals")
  .argument("<script.json>", "script with narration")
  .description("Generate React components per block")
  .action(() => notImplemented());

program
  .command("render")
  .argument("<script.json>", "script ready for render")
  .description("Render partials and final MP4")
  .action(() => notImplemented());

program
  .command("preview")
  .argument("<script.json>", "script to preview")
  .description("Open Remotion Studio")
  .action(() => notImplemented());

program
  .command("cache")
  .description("Cache stats and cleanup")
  .action(() => notImplemented());

program
  .command("doctor")
  .description("Environment checks")
  .action(() => notImplemented());

program
  .command("init")
  .argument("<dir>", "target directory")
  .description("Scaffold a starter project")
  .action(() => notImplemented());

await program.parseAsync(process.argv);
