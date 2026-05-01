#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program.name("autovideo").description("Markdown 教学稿 → MP4 CLI").version("0.0.0");

function notImplemented(stage: string) {
  return () => {
    console.error(`${stage}: not implemented`);
    process.exit(1);
  };
}

program
  .command("build")
  .argument("<project.json>", "project file")
  .description("compile → tts → visuals → render")
  .action(notImplemented("build"));

program.command("compile").argument("<project.json>").action(notImplemented("compile"));

program.command("tts").argument("<script.json>").action(notImplemented("tts"));

program.command("visuals").argument("<script.json>").action(notImplemented("visuals"));

program.command("render").argument("<script.json>").action(notImplemented("render"));

program.command("preview").argument("<script.json>").action(notImplemented("preview"));

program.command("cache").description("cache stats | clean").action(notImplemented("cache"));

program.command("doctor").description("environment checks").action(notImplemented("doctor"));

program.command("init").argument("<dir>").action(notImplemented("init"));

program.parse();
