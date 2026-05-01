#!/usr/bin/env node
import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function readVersion(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
        return pkg.version ?? '0.0.0';
      } catch {
        return '0.0.0';
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return '0.0.0';
}

function notImplemented(): never {
  throw new Error('not implemented');
}

const program = new Command();

program
  .name('autovideo')
  .description('Compile Markdown teaching scripts into MP4 videos.')
  .version(readVersion());

program
  .command('build')
  .description('Run compile → tts → visuals → render')
  .argument('<project>', 'path to project.json')
  .option('--out <dir>')
  .option('--config <file>')
  .option('--meta <key=value...>')
  .option('--verbose')
  .option('--dry-run')
  .action(notImplemented);

program
  .command('compile')
  .description('Markdown → script.json')
  .argument('<project>', 'path to project.json')
  .option('--out <dir>')
  .option('--config <file>')
  .option('--meta <key=value...>')
  .option('--verbose')
  .option('--dry-run')
  .action(notImplemented);

program
  .command('tts')
  .description('Generate narration audio')
  .argument('<script>', 'path to script.json')
  .option('--block <ids>')
  .option('--force')
  .option('--config <file>')
  .option('--verbose')
  .option('--dry-run')
  .action(notImplemented);

program
  .command('visuals')
  .description('Generate React components for blocks')
  .argument('<script>', 'path to script.json')
  .option('--block <ids>')
  .option('--force')
  .option('--config <file>')
  .option('--verbose')
  .option('--dry-run')
  .action(notImplemented);

program
  .command('render')
  .description('Render partial MP4s and concat')
  .argument('<script>', 'path to script.json')
  .option('--block <ids>')
  .option('--force')
  .option('--config <file>')
  .option('--verbose')
  .option('--dry-run')
  .action(notImplemented);

program
  .command('preview')
  .description('Open Remotion Studio')
  .argument('<script>', 'path to script.json')
  .option('--block <id>')
  .option('--config <file>')
  .option('--verbose')
  .option('--dry-run')
  .action(notImplemented);

program
  .command('cache')
  .description('Inspect or clean global cache')
  .argument('<action>', 'stats | clean')
  .option('--type <type>')
  .option('--older-than <duration>')
  .option('--stale')
  .action(notImplemented);

program.command('doctor').description('Check environment').action(notImplemented);

program
  .command('init')
  .description('Create a starter project directory')
  .argument('<dir>', 'target directory')
  .action(notImplemented);

program.parse();
