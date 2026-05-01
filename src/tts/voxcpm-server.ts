import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { VoxcpmSection } from "../config/types.js";
import { VoxcpmClient } from "./voxcpm-client.js";

export interface EnsureVoxcpmServerOptions {
  /** `loadResolvedCliConfig` 后的 `voxcpm`（`modelDir` 已为绝对路径） */
  voxcpm: VoxcpmSection;
  /** 等待 `/health` 变好的超时（毫秒） */
  startupTimeoutMs?: number;
  /** 轮询 `/health` 的间隔（毫秒） */
  pollIntervalMs?: number;
}

export interface VoxcpmServerHandle {
  /** 实际使用的 API 根 URL（与配置 `endpoint` 一致） */
  baseUrl: string;
  /** stage 结束时调用：向子进程发 SIGTERM（若为 autoStart 拉起） */
  dispose(): Promise<void>;
}

/** 解析 `endpoint` 得到 HTTP(S) 主机（默认 127.0.0.1）与端口（默认 8000） */
export function parseVoxcpmEndpoint(endpoint: string): { host: string; port: number } {
  let urlStr = endpoint.trim();
  if (!/^https?:\/\//i.test(urlStr)) {
    urlStr = `http://${urlStr}`;
  }
  const u = new URL(urlStr);
  const host = u.hostname || "127.0.0.1";
  let port: number;
  if (u.port) {
    port = Number.parseInt(u.port, 10);
  } else if (u.protocol === "https:") {
    port = 443;
  } else {
    /* PRD 默认 `http://127.0.0.1:8000`；省略端口时按 http 本地服务惯例用 8000 */
    port = 8000;
  }
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`无效的 voxcpm.endpoint 端口: ${endpoint}`);
  }
  return { host, port };
}

function repoTtsServerDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "tts-server");
}

function defaultPythonExecutable(ttsServerDir: string): string {
  const unixVenv = join(ttsServerDir, ".venv", "bin", "python3");
  const winVenv = join(ttsServerDir, ".venv", "Scripts", "python.exe");
  if (existsSync(unixVenv)) return unixVenv;
  if (existsSync(winVenv)) return winVenv;
  return process.platform === "win32" ? "python" : "python3";
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, ms));
}

function terminateProcess(child: ChildProcess, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const done = (): void => resolve();
    child.once("exit", done);
    child.once("error", done);
    try {
      child.kill("SIGTERM");
    } catch {
      done();
    }
    const t = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      done();
    }, timeoutMs);
    t.unref?.();
  });
}

/**
 * TTS stage 入口：若 `endpoint` 已有 `/health` 则直接返回；
 * 否则在 `autoStart` 为 true 时于同一 host/port 拉起 `uvicorn server:app` 并轮询 health。
 */
export async function ensureVoxcpmServer(
  opts: EnsureVoxcpmServerOptions,
): Promise<VoxcpmServerHandle> {
  const { voxcpm } = opts;
  const startupTimeoutMs = opts.startupTimeoutMs ?? 180_000;
  const pollIntervalMs = opts.pollIntervalMs ?? 500;

  const baseUrl = voxcpm.endpoint.trim().replace(/\/+$/, "");
  const client = new VoxcpmClient({ baseUrl });

  if (await client.health()) {
    return {
      baseUrl,
      dispose: async () => {
        /* noop */
      },
    };
  }

  if (!voxcpm.autoStart) {
    throw new Error(
      `VoxCPM 服务不可达（${baseUrl}）；请在配置中开启 voxcpm.autoStart 或手动启动 tts-server`,
    );
  }

  const { host, port } = parseVoxcpmEndpoint(voxcpm.endpoint);
  const ttsServerDir = repoTtsServerDir();
  const python = defaultPythonExecutable(ttsServerDir);

  const env = {
    ...process.env,
    VOXCPM_MODEL_DIR: voxcpm.modelDir,
  };

  const child = spawn(
    python,
    ["-m", "uvicorn", "server:app", "--host", host, "--port", String(port)],
    {
      cwd: ttsServerDir,
      env,
      stdio: "pipe",
      detached: false,
    },
  );

  let stderrTail = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    stderrTail = (stderrTail + chunk).slice(-4096);
  });

  const deadline = Date.now() + startupTimeoutMs;
  while (Date.now() < deadline) {
    if (await client.health()) {
      return {
        baseUrl,
        dispose: () => terminateProcess(child, 10_000),
      };
    }
    if (child.exitCode !== null) {
      throw new Error(
        `VoxCPM autoStart 子进程已退出（code=${child.exitCode}）；最近 stderr:\n${stderrTail || "(empty)"}`,
      );
    }
    await sleep(pollIntervalMs);
  }

  await terminateProcess(child, 10_000);
  throw new Error(
    `VoxCPM 服务在 ${startupTimeoutMs}ms 内未就绪（${baseUrl}）；最近 stderr:\n${stderrTail || "(empty)"}`,
  );
}

/** 测试用：申请本机空闲 TCP 端口 */
export async function allocateLocalPort(host = "127.0.0.1"): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, host, () => {
      const addr = srv.address();
      srv.close(() => {
        if (typeof addr === "object" && addr !== null && "port" in addr) {
          resolve(addr.port);
          return;
        }
        reject(new Error("无法分配端口"));
      });
    });
  });
}
