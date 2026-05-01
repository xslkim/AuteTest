#!/usr/bin/env node

import { Command } from "commander";
import { runCompileCommand } from "../src/cli/compile.js";
import { runCacheCommand } from "../src/cli/cache.js";
import { runTtsCommand } from "../src/cli/tts.js";
import { runVisualsCommand } from "../src/cli/visuals.js";
import { runRenderCommand } from "../src/cli/render.js";
import { runPreviewCommand } from "../src/cli/preview.js";
import { runBuildCommand } from "../src/cli/build.js";

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
    .allowExcessArguments(true)
    .action(async () => {
      try {
        await runBuildCommand({ argv: process.argv, cwd: process.cwd() });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(msg);
        process.exit(1);
      }
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
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      try {
        await runTtsCommand({ argv: process.argv, cwd: process.cwd() });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(msg);
        process.exit(1);
      }
    });

  program
    .command("visuals <scriptJson>")
    .description("Generate React components per block")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      try {
        await runVisualsCommand({ argv: process.argv, cwd: process.cwd() });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(msg);
        process.exit(1);
      }
    });

  program
    .command("render <scriptJson>")
    .description("Render partial MP4s and final output")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      try {
        await runRenderCommand({ argv: process.argv, cwd: process.cwd() });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(msg);
        process.exit(1);
      }
    });

  program
    .command("preview <scriptJson>")
    .description("Open Remotion Studio for a script")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      try {
        await runPreviewCommand({ argv: process.argv, cwd: process.cwd() });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(msg);
        process.exit(1);
      }
    });

  program
    .command("cache")
    .description("Cache utilities")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      try {
        await runCacheCommand({ argv: process.argv, cwd: process.cwd() });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(msg);
        process.exit(1);
      }
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
