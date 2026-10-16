#!/usr/bin/env node
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stdin, stderr } from 'node:process';
import { z } from 'zod';
import { BlogError } from '../../src/lib/blog/files';
import { parseCli } from './arguments';
import { loadConfig, validateConfig } from './config';
import { confirmation, type CommandContext } from './context';
import { createTerminalPrompts, type PromptDriver } from './prompts';
import { humanResult } from './reporter';
import { completeInvocation } from './wizard';
import { executeWriting } from './commands/writing';
import { executeToys } from './commands/toys';
import { executeBackup } from './commands/backup';
import { executeReleases } from './commands/releases';
import { executeDrafts } from './commands/drafts';
import { assertNoPendingWrites } from './writing-transactions';

export async function main(argv = process.argv.slice(2), runtime: { prompts?: PromptDriver } = {}) {
  const parsed = parseCli(argv);
  const prompts = { ...(runtime.prompts ?? createTerminalPrompts(!!stdin.isTTY && !!stderr.isTTY)), enabled: !parsed.options.json && (runtime.prompts?.enabled ?? (!!stdin.isTTY && !!stderr.isTTY)) };
  if (parsed.help || !parsed.command && !prompts.enabled) {
    const help = parsed.help ?? parseCli(['--help']).help!;
    if (parsed.options.json) console.log(JSON.stringify({ status: 'HELP', help }));
    else console.log(help.trimEnd());
    return;
  }
  const root = await realpath(path.resolve(parsed.options.root ?? process.cwd()));
  const storedConfig = await loadConfig(root);
  const invocation = await completeInvocation(root, storedConfig, parsed, prompts);
  if (!invocation) { console.log('已退出，未执行操作。'); return; }
  const { command, options } = invocation;
  if (['init', 'new', 'build', 'publish', 'push', 'unpublish', 'rollback', 'sync', 'restore', 'recover'].includes(command!)) await assertNoPendingWrites(root);
  const config = command !== 'init' && (options['pages-remote'] || command === 'push')
    ? { ...storedConfig, pages: { remote: options['pages-remote'] ?? storedConfig.pages?.remote ?? null, branch: 'blog' as const } }
    : storedConfig;
  validateConfig(root, config);
  function displayPaths(value: unknown, human = false): unknown {
    if (Array.isArray(value)) return value.map((item) => displayPaths(item, human));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      (key === 'file' || human && key === 'sourcePath') && typeof item === 'string' && item.startsWith('content/')
        ? item.replace(/^content\//, `${config.contentDir}/`) : displayPaths(item, human)]));
  }
  const context: CommandContext = {
    root, config, invocation, prompts,
    print: (status, data) => {
      if (options.json) console.log(JSON.stringify({ command, status, data: displayPaths(data) }));
      else console.log(humanResult(command!, status, displayPaths(data, true)));
    },
    confirm: confirmation(invocation, prompts, (description) => { if (!options.json) console.error(description); }),
  };
  if (command === 'storage') { const { executeStorage } = await import('./commands/storage'); await executeStorage(context); return; }
  for (const execute of [executeDrafts, executeToys, executeWriting, executeBackup, executeReleases]) if (await execute(context)) return;
  throw new BlogError(`未知命令：${command}。使用 --help。`, 2);
}

export async function runCli() {
  await main().catch((error: unknown) => {
    const code = error instanceof BlogError ? error.code : 2;
    const status = error instanceof BlogError ? error.status : 'ERROR';
    const message = error instanceof z.ZodError ? z.prettifyError(error) : error instanceof Error ? error.message : String(error);
    const details = error instanceof BlogError ? error.details : undefined;
    if (process.argv.includes('--json')) console.log(JSON.stringify({ status, error: message, code, ...(details === undefined ? {} : { details }) }));
    else console.error(`${status}: ${message}${details === undefined ? '' : `\n${JSON.stringify(details, null, 2)}`}`);
    process.exitCode = code;
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runCli();
