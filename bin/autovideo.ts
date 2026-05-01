#!/usr/bin/env node
import { Command } from "commander";

function notImplemented(): never {
  console.error("not implemented");
  process.exit(1);
}

const program = new Command();

program.name("autovideo").description("Markdown teaching scripts → MP4").version("0.0.0");

program.command("build").description("Run compile → tts → visuals → render").argument("<project>", "project.json path").action(notImplemented);

program.command("compile").description("Markdown → script.json").argument("<project>", "project.json path").action(notImplemented);

program.command("tts").description("Narration → WAV + timings").argument("<script>", "script.json path").action(notImplemented);

program.command("visuals").description("Generate block components via Claude").argument("<script>", "script.json path").action(notImplemented);

program.command("render").description("Render partial MP4s and concat").argument("<script>", "script.json path").action(notImplemented);

program.command("preview").description("Open Remotion Studio").argument("<script>", "script.json path").action(notImplemented);

const cache = program.command("cache").description("Cache stats / clean");
cache.command("stats").description("Show cache statistics").action(notImplemented);
cache.command("clean").description("Clear cache entries").action(notImplemented);

program.command("doctor").description("Environment checks").action(notImplemented);

program.command("init").description("Create starter template").argument("<dir>", "target directory").action(notImplemented);

await program.parseAsync(process.argv);
