import { spawn } from "node:child_process";

/** PRD §6.3：仅这些变量传入子进程（其余全部剥离）。 */
const WHITELIST_ENV_KEYS = [
  "PATH",
  "HOME",
  "LANG",
  "TMPDIR",
  "DISPLAY",
  "NODE_OPTIONS",
] as const;

export type WhitelistEnvKey = (typeof WHITELIST_ENV_KEYS)[number];

export function buildIsolatedEnv(
  overrides?: NodeJS.ProcessEnv | undefined,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of WHITELIST_ENV_KEYS) {
    const v = overrides?.[key] ?? process.env[key];
    if (v !== undefined) {
      env[key] = v;
    }
  }
  return env;
}

export interface RunIsolatedOptions {
  cwd?: string;
  /** 仅白名单键生效，与 `process.env` 合并方式：`overrides[k] ?? process.env[k]`。 */
  env?: NodeJS.ProcessEnv;
  /** 全程超时（毫秒），默认 30_000。到时 SIGTERM，5s 后 SIGKILL。 */
  timeoutMs?: number;
  /** `prlimit --as=` 地址空间上限（字节），默认 8GiB。 */
  memLimitBytes?: number;
  /** `prlimit --cpu=` CPU 时间上限（秒），默认 600。 */
  cpuLimitSec?: number;
  /** 为 true 时在 `prlimit` 内再包一层 `unshare -n`（验证子进程无网络）。 */
  isolateNetwork?: boolean;
  signal?: AbortSignal;
}

export interface RunIsolatedResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const SIGTERM_EXIT = 128 + 15;
const SIGKILL_EXIT = 128 + 9;

function normalizeExitCode(
  code: number | null,
  signal: NodeJS.Signals | null,
): number {
  if (code !== null && code !== undefined) {
    return code;
  }
  if (signal === "SIGTERM") {
    return SIGTERM_EXIT;
  }
  if (signal === "SIGKILL") {
    return SIGKILL_EXIT;
  }
  return -1;
}

function buildSpawnArgs(
  cmd: string,
  args: string[],
  opts: RunIsolatedOptions,
): string[] {
  const memLimitBytes = opts.memLimitBytes ?? 8 * 1024 * 1024 * 1024;
  const cpuLimitSec = opts.cpuLimitSec ?? 600;

  const prlimitPrefix = [
    "prlimit",
    `--as=${memLimitBytes}`,
    `--cpu=${cpuLimitSec}`,
    "--",
  ] as string[];

  const inner: string[] = opts.isolateNetwork
    ? ["unshare", "-n", "--", cmd, ...args]
    : [cmd, ...args];

  return [...prlimitPrefix, ...inner];
}

/**
 * 在 Linux 上通过 `prlimit`（及可选 `unshare -n`）包裹子进程，并剥离环境变量。
 * 主进程仍可保留 `ANTHROPIC_API_KEY` 等；子进程仅见白名单变量。
 */
export function runIsolated(
  cmd: string,
  args: string[],
  opts: RunIsolatedOptions = {},
): Promise<RunIsolatedResult> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const env = buildIsolatedEnv(opts.env);
  const spawnArgs = buildSpawnArgs(cmd, args, opts);

  return new Promise((resolve, reject) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const child = spawn(spawnArgs[0]!, spawnArgs.slice(1), {
      cwd: opts.cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    let sigtermGraceHandle: ReturnType<typeof setTimeout> | undefined;

    const cleanupTimers = (): void => {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
        timeoutHandle = undefined;
      }
      if (sigtermGraceHandle !== undefined) {
        clearTimeout(sigtermGraceHandle);
        sigtermGraceHandle = undefined;
      }
    };

    const onAbort = (): void => {
      cleanupTimers();
      child.kill("SIGTERM");
      sigtermGraceHandle = setTimeout(() => {
        child.kill("SIGKILL");
      }, 5_000);
    };

    if (opts.signal) {
      if (opts.signal.aborted) {
        onAbort();
      } else {
        opts.signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    child.stdout?.on("data", (d: Buffer) => {
      stdoutChunks.push(d);
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderrChunks.push(d);
    });

    timeoutHandle = setTimeout(() => {
      child.kill("SIGTERM");
      sigtermGraceHandle = setTimeout(() => {
        child.kill("SIGKILL");
      }, 5_000);
    }, timeoutMs);

    child.on("error", (err) => {
      cleanupTimers();
      reject(err);
    });

    child.on("close", (code, signal) => {
      cleanupTimers();
      if (opts.signal) {
        opts.signal.removeEventListener("abort", onAbort);
      }
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode: normalizeExitCode(code, signal),
      });
    });
  });
}
