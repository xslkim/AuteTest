#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

function notImplemented(): never {
  console.error("not implemented");
  process.exit(1);
}

program.name("autovideo").description("Compile Markdown teaching scripts to MP4");

program
  .command("build")
  .argument("<project>", "path to project.json")
  .description("Run compile → tts → visuals → render")
  .action(() => notImplemented());

program
  .command("compile")
  .argument("<project>", "path to project.json")
  .description("Markdown → script.json")
  .action(() => notImplemented());

program
  .command("tts")
  .argument("<script>", "path to script.json")
  .description("Generate block audio via VoxCPM")
  .action(() => notImplemented());

program
  .command("visuals")
  .argument("<script>", "path to script.json")
  .description("Generate React components per block")
  .action(() => notImplemented());

program
  .command("render")
  .argument("<script>", "path to script.json")
  .description("Render partial MP4s and concat")
  .action(() => notImplemented());

program
  .command("preview")
  .argument("<script>", "path to script.json")
  .description("Open Remotion Studio")
  .action(() => notImplemented());

program
  .command("cache")
  .argument("[subcommand]", "stats | clean")
  .description("Global artifact cache")
  .action(() => notImplemented());

program
  .command("doctor")
  .description("Environment checks")
  .action(() => notImplemented());

program
  .command("init")
  .argument("<dir>", "directory to scaffold")
  .description("Create starter template")
  .action(() => notImplemented());

program.parse();
