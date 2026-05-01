#!/usr/bin/env node
import { Command } from "commander";

function notImplemented(): never {
  console.error("not implemented");
  process.exit(1);
}

const program = new Command();
program.name("autovideo").description("AutoVideo CLI");

program
  .command("build")
  .argument("<project.json>", "project file")
  .description("Run full pipeline")
  .action(() => {
    notImplemented();
  });

program
  .command("compile")
  .argument("<project.json>", "project file")
  .description("Compile Markdown to script.json")
  .action(() => {
    notImplemented();
  });

program
  .command("tts")
  .argument("<script.json>", "script IR")
  .description("Text-to-speech stage")
  .action(() => {
    notImplemented();
  });

program
  .command("visuals")
  .argument("<script.json>", "script IR")
  .description("Generate visual components")
  .action(() => {
    notImplemented();
  });

program
  .command("render")
  .argument("<script.json>", "script IR")
  .description("Render partials and final video")
  .action(() => {
    notImplemented();
  });

program
  .command("preview")
  .argument("<script.json>", "script IR")
  .description("Open Remotion Studio preview")
  .action(() => {
    notImplemented();
  });

program
  .command("cache")
  .description("Cache management")
  .action(() => {
    notImplemented();
  });

program.command("doctor").description("Environment checks").action(() => {
  notImplemented();
});

program
  .command("init")
  .argument("<dir>", "target directory")
  .description("Scaffold template project")
  .action(() => {
    notImplemented();
  });

program.parse();
