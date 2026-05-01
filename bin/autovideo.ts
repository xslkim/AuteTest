#!/usr/bin/env node
import { Command } from "commander";

function notImplemented(): never {
  throw new Error("not implemented");
}

const program = new Command();

program
  .name("autovideo")
  .description("Compile Markdown teaching scripts to MP4")
  .version("0.0.0");

program
  .command("build <project>")
  .description("Run compile → tts → visuals → render")
  .action(() => {
    notImplemented();
  });

program
  .command("compile <project>")
  .description("Parse project → script.json")
  .action(() => {
    notImplemented();
  });

program
  .command("tts <script>")
  .description("Synthesize narration to WAV + line timings")
  .action(() => {
    notImplemented();
  });

program
  .command("visuals <script>")
  .description("Generate React components per block")
  .action(() => {
    notImplemented();
  });

program
  .command("render <script>")
  .description("Render block partials and concat final MP4")
  .action(() => {
    notImplemented();
  });

program
  .command("preview <script>")
  .description("Open Remotion Studio for a script")
  .action(() => {
    notImplemented();
  });

program
  .command("cache")
  .description("Inspect or clean global cache")
  .action(() => {
    notImplemented();
  });

program
  .command("doctor")
  .description("Check local environment and dependencies")
  .action(() => {
    notImplemented();
  });

program
  .command("init <dir>")
  .description("Scaffold a starter project")
  .action(() => {
    notImplemented();
  });

try {
  await program.parseAsync(process.argv);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  if (message === "not implemented") {
    console.error(message);
    process.exitCode = 1;
  } else {
    console.error(err);
    process.exitCode = 1;
  }
}
