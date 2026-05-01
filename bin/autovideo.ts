#!/usr/bin/env node
import { program } from "commander";

function notImplemented(): never {
  console.error("not implemented");
  process.exit(1);
}

program
  .name("autovideo")
  .description("Compile Markdown teaching scripts into MP4 video")
  .version("0.0.0");

program
  .command("build")
  .argument("<project.json>")
  .description("Run compile → tts → visuals → render")
  .action(() => notImplemented());

program
  .command("compile")
  .argument("<project.json>")
  .description("Markdown → script.json")
  .action(() => notImplemented());

program
  .command("tts")
  .argument("<script.json>")
  .description("Narration → audio + line timings")
  .action(() => notImplemented());

program
  .command("visuals")
  .argument("<script.json>")
  .description("Generate React components per block")
  .action(() => notImplemented());

program
  .command("render")
  .argument("<script.json>")
  .description("Render partial MP4s and final output")
  .action(() => notImplemented());

program
  .command("preview")
  .argument("<script.json>")
  .description("Open Remotion Studio")
  .action(() => notImplemented());

program
  .command("cache")
  .description("Cache stats and cleanup")
  .action(() => notImplemented());

program
  .command("doctor")
  .description("Check local environment")
  .action(() => notImplemented());

program
  .command("init")
  .argument("<dir>")
  .description("Scaffold a starter project")
  .action(() => notImplemented());

await program.parseAsync(process.argv);
