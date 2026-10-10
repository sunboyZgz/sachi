import { execa, ExecaError } from 'execa';
import { BlogError } from '../../src/lib/blog/files';

export async function run(command: string[], options: { cwd: string; env?: Partial<NodeJS.ProcessEnv>; input?: string; echo?: boolean; code?: number; timeout?: number }) {
  if (!command.length || !command[0] || command.some((value) => value.includes('\0'))) throw new BlogError('命令参数无效。', 2);
  const environment = { ...process.env, ...options.env };
  for (const key of Object.keys(environment)) if (environment[key] === undefined) delete environment[key];
  try {
    const child = execa(command[0], command.slice(1), {
      cwd: options.cwd, env: environment, extendEnv: false, shell: false,
      input: options.input, stdin: options.input === undefined ? 'ignore' : 'pipe',
      stripFinalNewline: false, timeout: options.timeout ?? 300_000, forceKillAfterDelay: 2000, maxBuffer: 32 * 1024 ** 2,
    });
    if (options.echo) {
      child.stdout?.on('data', (chunk: Buffer) => process.stderr.write(chunk));
      child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));
    }
    const result = await child;
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    if (!(error instanceof ExecaError)) throw error;
    if (error.timedOut) throw new BlogError(`命令超时：${command[0]}`, options.code ?? 7, 'UNKNOWN');
    if (error.signal) throw new BlogError(`命令被中断：${error.signal}`, error.signal === 'SIGINT' ? 130 : (options.code ?? 7), 'UNKNOWN');
    throw new BlogError(`${command[0]} 失败 (${error.exitCode ?? error.code ?? '启动失败'})：${String(error.stderr || error.stdout || error.shortMessage).slice(-4000)}`, options.code ?? 2);
  }
}
