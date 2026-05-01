#!/usr/bin/env node

import { Command } from "commander";

const notImplemented = (): never => {
  console.error("not implemented");
  process.exit(1);
};

const program = new Command();

program
  .name("autovideo")
  .description("Compile Markdown teaching scripts to MP4 video")
  .version("0.0.0");

program
  .command("build <projectJson>")
  .description("Run compile → tts → visuals → render")
  .action(() => {
    notImplemented();
  });

program
  .command("compile <projectJson>")
  .description("Markdown → script.json")
  .action(() => {
    notImplemented();
  });

program
  .command("tts <scriptJson>")
  .description("Narration → audio + line timings")
  .action(() => {
    notImplemented();
  });

program
  .command("visuals <scriptJson>")
  .description("Generate React components per block")
  .action(() => {
    notImplemented();
  });

program
  .command("render <scriptJson>")
  .description("Render partial MP4s and final output")
  .action(() => {
    notImplemented();
  });

program
  .command("preview <scriptJson>")
  .description("Open Remotion Studio for a script")
  .action(() => {
    notImplemented();
  });

program
  .command("cache")
  .description("Cache utilities")
  .action(() => {
    notImplemented();
  });

program
  .command("doctor")
  .description("Check local environment")
  .action(() => {
    notImplemented();
  });

program
  .command("init <dir>")
  .description("Scaffold a starter project")
  .action(() => {
    notImplemented();
  });

program.parse();
