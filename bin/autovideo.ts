#!/usr/bin/env node
import { Command } from "commander";

function notImplemented(): void {
  console.error("not implemented");
  process.exit(1);
}

const program = new Command()
  .name("autovideo")
  .description("Compile Markdown lesson scripts into MP4 video");

function registerStub(
  cmd: Command,
  nameAndArgs: string,
  description: string,
): void {
  cmd
    .command(nameAndArgs)
    .description(description)
    .allowExcessArguments(true)
    .action(notImplemented);
}

registerStub(program, "build <project>", "Full pipeline (compile → tts → visuals → render)");
registerStub(program, "compile <project>", "Markdown → script.json IR");
registerStub(program, "tts <script>", "Generate audio and line timings");
registerStub(program, "visuals <script>", "Generate React components for each block");
registerStub(program, "render <script>", "Render partial MP4s and final output");
registerStub(program, "preview <script>", "Open Remotion Studio for preview");

program
  .command("cache")
  .description("Cache stats/clean utilities")
  .argument("[args...]")
  .allowExcessArguments(true)
  .action(notImplemented);

registerStub(program, "doctor", "Check environment (Node, ffmpeg, Chromium, …)");
registerStub(program, "init <dir>", "Scaffold starter project");

await program.parseAsync(process.argv);
