#!/usr/bin/env node
import { Command } from "commander";

function notImplemented(): never {
  console.error("not implemented");
  process.exit(1);
}

const program = new Command();

program.name("autovideo").description("Markdown teaching scripts → MP4");

program
  .command("build")
  .argument("<project.json>")
  .description("Run compile → tts → visuals → render")
  .action(notImplemented);

program
  .command("compile")
  .argument("<project.json>")
  .description("Parse project → script.json")
  .action(notImplemented);

program
  .command("tts")
  .argument("<script.json>")
  .description("Synthesize narration audio")
  .action(notImplemented);

program
  .command("visuals")
  .argument("<script.json>")
  .description("Generate block components via Claude")
  .action(notImplemented);

program
  .command("render")
  .argument("<script.json>")
  .description("Render partial MP4s and concat")
  .action(notImplemented);

program
  .command("preview")
  .argument("<script.json>")
  .description("Open Remotion Studio")
  .action(notImplemented);

const cache = program.command("cache").description("Cache utilities");

cache.command("stats").description("Show cache stats").action(notImplemented);

cache
  .command("clean")
  .description("Clean cache entries")
  .action(notImplemented);

program.command("doctor").description("Environment checks").action(notImplemented);

program
  .command("init")
  .argument("<dir>")
  .description("Scaffold a starter project")
  .action(notImplemented);

program.parse();
