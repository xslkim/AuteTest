#!/usr/bin/env node
import { Command } from "commander";

function notImplemented(): never {
  console.error("not implemented");
  process.exit(1);
}

const program = new Command();

program.name("autovideo").description("Compile Markdown scripts to MP4 videos");

program.command("build").description("Run compile → tts → visuals → render").action(notImplemented);

program.command("compile").description("Markdown → script.json").argument("<project>", "project.json path").action(notImplemented);

program.command("tts").description("Generate narration audio").argument("<script>", "script.json path").action(notImplemented);

program.command("visuals").description("Generate React components per block").argument("<script>", "script.json path").action(notImplemented);

program.command("render").description("Render partial MP4s and concat").argument("<script>", "script.json path").action(notImplemented);

program.command("preview").description("Open Remotion Studio").argument("<script>", "script.json path").action(notImplemented);

program.command("cache").description("Cache stats / clean").action(notImplemented);

program.command("doctor").description("Environment checks").action(notImplemented);

program.command("init").description("Create starter template").argument("<dir>", "target directory").action(notImplemented);

program.parse();
