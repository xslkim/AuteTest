#!/usr/bin/env node

import { Command } from "commander";
import { runCompileCommand } from "../src/cli/compile.js";

const notImplemented = (): never => {
  console.error("not implemented");
  process.exit(1);
};

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("autovideo")
    .description("Compile Markdown teaching scripts to MP4 video")
    .version("0.0.0");

  program
    .command("build <projectJson>")
    .description("Run compile → tts → visuals → render")
    .allowUnknownOption(true)
    .action(() => {
      notImplemented();
    });

  program
    .command("compile <projectJson>")
    .description("Markdown → script.json")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      try {
        await runCompileCommand({ argv: process.argv, cwd: process.cwd() });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(msg);
        process.exit(1);
      }
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

  program.command("doctor").description("Check local environment").action(() => {
    notImplemented();
  });

  program.command("init <dir>").description("Scaffold a starter project").action(() => {
    notImplemented();
  });

  await program.parseAsync(process.argv);
}

await main();
