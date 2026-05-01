#!/usr/bin/env node
import { Command } from "commander";

function notImplemented(): never {
  console.error("not implemented");
  process.exit(1);
}

function registerStub(program: Command, name: string, description?: string): void {
  program
    .command(name)
    .description(description ?? `${name} (stub)`)
    .allowExcessArguments(true)
    .allowUnknownOption()
    .action(() => notImplemented());
}

const program = new Command();

program
  .name("autovideo")
  .description("AutoVideo CLI")
  .version("0.0.0", "-V, --version", "output version")
  .showHelpAfterError();

registerStub(program, "build");
registerStub(program, "compile");
registerStub(program, "tts");
registerStub(program, "visuals");
registerStub(program, "render");
registerStub(program, "preview");
registerStub(program, "cache");
registerStub(program, "doctor");
registerStub(program, "init");

await program.parseAsync(process.argv);
