#!/usr/bin/env node
import { Command } from "commander";

function exitNotImplemented(): never {
  console.error("not implemented");
  process.exit(1);
}

const program = new Command();

program.name("autovideo").description("Compile Markdown teaching scripts to MP4");

program
  .command("build")
  .description("Run compile → tts → visuals → render")
  .argument("<project>", "project.json path")
  .action(() => exitNotImplemented());

program
  .command("compile")
  .description("Markdown → script.json")
  .argument("<project>", "project.json path")
  .action(() => exitNotImplemented());

program
  .command("tts")
  .description("Narration → audio + line timings")
  .argument("<script>", "script.json path")
  .action(() => exitNotImplemented());

program
  .command("visuals")
  .description("Generate React components per block")
  .argument("<script>", "script.json path")
  .action(() => exitNotImplemented());

program
  .command("render")
  .description("Render partials and final MP4")
  .argument("<script>", "script.json path")
  .action(() => exitNotImplemented());

program
  .command("preview")
  .description("Open Remotion Studio")
  .argument("<script>", "script.json path")
  .action(() => exitNotImplemented());

program
  .command("cache")
  .description("Cache stats or clean")
  .argument("[subcommand]", "stats | clean")
  .action(() => exitNotImplemented());

program.command("doctor").description("Environment checks").action(() => exitNotImplemented());

program
  .command("init")
  .description("Create starter template")
  .argument("<dir>", "target directory")
  .action(() => exitNotImplemented());

program.parse();
