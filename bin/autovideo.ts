#!/usr/bin/env node
import { program } from "commander";

program.name("autovideo").description("Markdown 教学口播稿 → MP4 视频");

function stub(name: string) {
	return async (): Promise<void> => {
		throw new Error(`${name}: not implemented`);
	};
}

program
	.command("build")
	.argument("<project.json>", "项目入口 JSON")
	.action(stub("build"));

program.command("compile").argument("<project.json>").action(stub("compile"));

program.command("tts").argument("<script.json>").action(stub("tts"));

program.command("visuals").argument("<script.json>").action(stub("visuals"));

program.command("render").argument("<script.json>").action(stub("render"));

program.command("preview").argument("<script.json>").action(stub("preview"));

program
	.command("cache")
	.description("缓存工具")
	.action(stub("cache"));

program.command("doctor").action(stub("doctor"));

program.command("init").argument("<dir>").action(stub("init"));

await program.parseAsync(process.argv);
