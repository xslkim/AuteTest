import { Command } from "commander";

function notImplemented(): never {
  console.error("not implemented");
  process.exit(1);
}

const program = new Command();
program.name("autovideo").description("Markdown 教学口播稿 → MP4").version("0.1.0");

program
  .command("build")
  .argument("<project-json>")
  .description("compile → tts → visuals → render")
  .action(notImplemented);

program
  .command("compile")
  .argument("<project-json>")
  .description("Markdown / project.json → script.json")
  .action(notImplemented);

program
  .command("tts")
  .argument("<script-json>")
  .description("Generate per-block WAV + line timings")
  .action(notImplemented);

program
  .command("visuals")
  .argument("<script-json>")
  .description("Generate React components per block")
  .action(notImplemented);

program
  .command("render")
  .argument("<script-json>")
  .description("Render partial MP4s and concat")
  .action(notImplemented);

program
  .command("preview")
  .argument("<script-json>")
  .description("Open Remotion Studio for blocks")
  .action(notImplemented);

program.command("cache").description("Global cache utilities").action(notImplemented);

program.command("doctor").description("Environment and dependency checks").action(notImplemented);

program
  .command("init")
  .argument("<dir>")
  .description("Scaffold a starter project directory")
  .action(notImplemented);

await program.parseAsync(process.argv);
