#!/usr/bin/env node
import { Command } from "commander";

function notImplemented(): never {
  console.error("not implemented");
  process.exit(1);
}

const program = new Command();
program.name("autovideo").description("Markdown to MP4 teaching video toolchain").version("0.0.1");

program.command("build").argument("<project.json>").description("Run compile → tts → visuals → render").action(notImplemented);

program.command("compile").argument("<project.json>").description("Markdown project → script.json IR").action(notImplemented);

program.command("tts").argument("<script.json>").description("Narration → per-block WAV + line timings").action(notImplemented);

program.command("visuals").argument("<script.json>").description("Visual descriptions → React components").action(notImplemented);

program.command("render").argument("<script.json>").description("Render partial MP4s and final output").action(notImplemented);

program.command("preview").argument("<script.json>").description("Open Remotion Studio").action(notImplemented);

const cache = program.command("cache").description("Cache stats / clean");
cache.command("stats").description("Show cache statistics").action(notImplemented);
cache.command("clean").description("Clean cache entries").action(notImplemented);

program.command("doctor").description("Check environment and dependencies").action(notImplemented);

program.command("init").argument("<dir>").description("Create a starter project").action(notImplemented);

program.parse();
