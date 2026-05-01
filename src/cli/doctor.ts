import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  statfsSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import Anthropic from "@anthropic-ai/sdk";
import { ensureBrowser } from "@remotion/renderer";

import { loadResolvedCliConfig } from "../config/load.js";
import type { ResolvedAutovideoConfig } from "../config/types.js";

export interface DoctorCliOptions {
  argv: readonly string[];
  cwd: string;
}

export type DoctorStatus = "PASS" | "WARN" | "FAIL";

export interface DoctorCheckRow {
  name: string;
  status: DoctorStatus;
  detail: string;
  fix: string;
}

function parseSemverPrefix(v: string): [number, number] | null {
  const m = /^(\d+)\.(\d+)/.exec(v.trim());
  if (!m) return null;
  return [Number.parseInt(m[1]!, 10), Number.parseInt(m[2]!, 10)];
}

function whichOnPath(cmd: string): string | null {
  const pathEnv = process.env.PATH ?? "";
  const parts = pathEnv.split(":").filter(Boolean);
  for (const dir of parts) {
    const p = join(dir, cmd);
    try {
      accessSync(p, constants.X_OK);
      return p;
    } catch {
      /* continue */
    }
  }
  return null;
}

async function checkNodeVersion(): Promise<DoctorCheckRow> {
  const v = process.version;
  const parsed = /^v(\d+)/.exec(v);
  const major = parsed ? Number.parseInt(parsed[1]!, 10) : 0;
  if (major >= 20) {
    return {
      name: "Node 版本",
      status: "PASS",
      detail: process.version,
      fix: "—",
    };
  }
  return {
    name: "Node 版本",
    status: "FAIL",
    detail: `当前 ${process.version}，需要 ≥ v20`,
    fix: "使用 Node 20+（nvm / NodeSource / 系统包）",
  };
}

function checkFfmpegVersion(): DoctorCheckRow {
  const r = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  if (r.status !== 0 || typeof r.stdout !== "string") {
    return {
      name: "ffmpeg",
      status: "FAIL",
      detail: "无法在 PATH 中执行 `ffmpeg -version`",
      fix: "安装 ffmpeg 5+（如 `apt install ffmpeg`）",
    };
  }
  const first = r.stdout.split("\n")[0] ?? "";
  const vm = /ffmpeg version (\S+)/i.exec(first);
  const verStr = vm?.[1] ?? first;
  const pv = parseSemverPrefix(verStr.replace(/^n\d+\./i, "")) ?? parseSemverPrefix(verStr);
  if (!pv) {
    return {
      name: "ffmpeg",
      status: "WARN",
      detail: `已安装但无法解析版本：${first.slice(0, 80)}`,
      fix: "确认 `ffmpeg -version` 首行含 `ffmpeg version X.Y`；建议 5.0+",
    };
  }
  const [major] = pv;
  if (major >= 5) {
    return {
      name: "ffmpeg",
      status: "PASS",
      detail: verStr,
      fix: "—",
    };
  }
  if (major === 4) {
    return {
      name: "ffmpeg",
      status: "WARN",
      detail: `${verStr}（4.x loudnorm JSON 可能异常）`,
      fix: "升级到 ffmpeg 5.0+",
    };
  }
  return {
    name: "ffmpeg",
    status: "FAIL",
    detail: `${verStr}（需 ≥ 5.0）`,
    fix: "升级到 ffmpeg 5.0+",
  };
}

async function checkChromium(config: ResolvedAutovideoConfig): Promise<DoctorCheckRow> {
  const exe = config.render.browser;
  try {
    const status = await ensureBrowser({
      browserExecutable: exe,
      logLevel: "error",
    });
    if (status.type === "user-defined-path" || status.type === "local-puppeteer-browser") {
      return {
        name: "Chromium（Remotion）",
        status: "PASS",
        detail: status.path,
        fix: "—",
      };
    }
    return {
      name: "Chromium（Remotion）",
      status: "FAIL",
      detail: `浏览器状态异常：${status.type}`,
      fix: "删除旧版 Headless Chrome 缓存后重试，或设置 render.browser 指向系统 Chromium",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      name: "Chromium（Remotion）",
      status: "FAIL",
      detail: msg.slice(0, 120),
      fix: "检查网络以下载 Chrome-for-testing，或安装系统 Chromium 并在配置中设置 `render.browser`",
    };
  }
}

async function checkCjkFontModule(): Promise<DoctorCheckRow> {
  try {
    await import("@remotion/google-fonts/NotoSansSC");
    return {
      name: "CJK 字体模块",
      status: "PASS",
      detail: "@remotion/google-fonts/NotoSansSC 可加载",
      fix: "—",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      name: "CJK 字体模块",
      status: "WARN",
      detail: msg.slice(0, 100),
      fix: "运行 `npm install`；生产环境可额外安装 fonts-noto-cjk 作为兜底",
    };
  }
}

async function checkVoxcpmHealth(endpoint: string): Promise<DoctorCheckRow> {
  const url = new URL("/health", endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) {
      return {
        name: "VoxCPM2 服务",
        status: "PASS",
        detail: `GET ${url} → ${res.status}`,
        fix: "—",
      };
    }
    return {
      name: "VoxCPM2 服务",
      status: "WARN",
      detail: `GET ${url} → ${res.status}`,
      fix: "启动 tts-server（`uvicorn server:app`）或开启 voxcpm.autoStart；详见 `tts-server/`",
    };
  } catch (e) {
    clearTimeout(t);
    const msg = e instanceof Error ? e.message : String(e);
    return {
      name: "VoxCPM2 服务",
      status: "WARN",
      detail: msg.slice(0, 100),
      fix: "启动 VoxCPM HTTP 服务；`tts` 在 autoStart 为 true 时可尝试自动拉起",
    };
  }
}

function checkVoxcpmModelWeights(modelDir: string): DoctorCheckRow {
  const cfgPath = join(modelDir, "config.json");
  if (existsSync(cfgPath)) {
    return {
      name: "VoxCPM2 模型权重",
      status: "PASS",
      detail: cfgPath,
      fix: "—",
    };
  }
  return {
    name: "VoxCPM2 模型权重",
    status: "FAIL",
    detail: `缺少 ${cfgPath}`,
    fix: "将 VoxCPM2 权重放到 voxcpm.modelDir（默认 ~/.cache/voxcpm/VoxCPM2），或见 install.sh",
  };
}

function checkAnthropicApiKey(apiKeyEnv: string): DoctorCheckRow {
  const v = process.env[apiKeyEnv];
  if (v != null && String(v).trim() !== "") {
    return {
      name: "Claude API key",
      status: "PASS",
      detail: `${apiKeyEnv} 已设置`,
      fix: "—",
    };
  }
  return {
    name: "Claude API key",
    status: "FAIL",
    detail: `${apiKeyEnv} 为空或未设置`,
    fix: `export ${apiKeyEnv}=<your-key> 或写入 shell 配置`,
  };
}

async function checkAnthropicPing(config: ResolvedAutovideoConfig): Promise<DoctorCheckRow> {
  const keyEnv = config.anthropic.apiKeyEnv;
  const key = process.env[keyEnv];
  if (key == null || String(key).trim() === "") {
    return {
      name: "Claude API 连通",
      status: "WARN",
      detail: "跳过（无 API key）",
      fix: "设置 API key 后可验证 visuals 阶段外呼",
    };
  }
  try {
    const client = new Anthropic({
      apiKey: key,
      maxRetries: 0,
      timeout: 15_000,
    });
    const r = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    const ok = r.id.length > 0;
    return {
      name: "Claude API 连通",
      status: ok ? "PASS" : "WARN",
      detail: ok ? `model=${config.anthropic.model} id=${r.id.slice(0, 12)}…` : "空响应",
      fix: "检查网络与 ANTHROPIC_API_KEY；或稍后重试",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      name: "Claude API 连通",
      status: "WARN",
      detail: msg.slice(0, 120),
      fix: "检查代理/防火墙；确认账单与模型权限",
    };
  }
}

function checkCacheWritable(cacheDir: string): DoctorCheckRow {
  try {
    mkdirSync(cacheDir, { recursive: true });
    accessSync(cacheDir, constants.R_OK | constants.W_OK);
    const probe = join(cacheDir, `.doctor-write-${process.pid}-${Date.now()}`);
    writeFileSync(probe, "ok", "utf8");
    try {
      accessSync(probe, constants.R_OK);
    } finally {
      try {
        unlinkSync(probe);
      } catch {
        /* ignore */
      }
    }
    return {
      name: "缓存目录可写",
      status: "PASS",
      detail: cacheDir,
      fix: "—",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      name: "缓存目录可写",
      status: "FAIL",
      detail: msg.slice(0, 100),
      fix: "修正目录权限或 `autovideo doctor --cache-dir <path>` / 配置 cache.dir",
    };
  }
}

function bytesAvailableOnPath(dir: string): bigint | null {
  try {
    const st = statfsSync(dir);
    const bavail = st.bavail as bigint | number | undefined;
    const bsize = st.bsize as bigint | number | undefined;
    if (bavail == null || bsize == null) return null;
    const ba = typeof bavail === "bigint" ? bavail : BigInt(bavail);
    const bs = typeof bsize === "bigint" ? bsize : BigInt(bsize);
    return ba * bs;
  } catch {
    return null;
  }
}

function humanBytes(n: bigint): string {
  const gb = Number(n) / (1024 ** 3);
  if (gb >= 100) return `${gb.toFixed(0)} GiB`;
  if (gb >= 10) return `${gb.toFixed(1)} GiB`;
  return `${gb.toFixed(2)} GiB`;
}

function checkDiskSpace(cacheDir: string): DoctorCheckRow {
  const free = bytesAvailableOnPath(cacheDir) ?? bytesAvailableOnPath(tmpdir());
  if (free == null) {
    return {
      name: "磁盘空间",
      status: "WARN",
      detail: "无法读取可用空间（statfs 失败）",
      fix: "确认 `df` 至少有数 GB 可用",
    };
  }
  const oneGb = BigInt(1024) ** BigInt(3);
  const fiveGb = BigInt(5) * oneGb;
  const warnBelow = fiveGb;
  const failBelow = oneGb;
  if (free < failBelow) {
    return {
      name: "磁盘空间",
      status: "FAIL",
      detail: `可用约 ${humanBytes(free)}（< 1 GiB）`,
      fix: "清理磁盘；PRD §10 要求 stage 前 ≥ 5 GiB 空闲",
    };
  }
  if (free < warnBelow) {
    return {
      name: "磁盘空间",
      status: "WARN",
      detail: `可用约 ${humanBytes(free)}（< 5 GiB，PRD 建议阈值）`,
      fix: "释放空间以满足 long render / 缓存",
    };
  }
  return {
    name: "磁盘空间",
    status: "PASS",
    detail: `可用约 ${humanBytes(free)}`,
    fix: "—",
  };
}

function checkPrlimitUnshare(): DoctorCheckRow {
  const pr = whichOnPath("prlimit");
  const un = whichOnPath("unshare");
  if (pr && un) {
    return {
      name: "prlimit / unshare",
      status: "PASS",
      detail: `prlimit=${pr}；unshare=${un}`,
      fix: "—",
    };
  }
  const miss: string[] = [];
  if (!pr) miss.push("prlimit");
  if (!un) miss.push("unshare");
  return {
    name: "prlimit / unshare",
    status: "FAIL",
    detail: `缺少：${miss.join(", ")}`,
    fix: "Linux：安装 util-linux（如 `apt install util-linux`），确保二者在 PATH 中",
  };
}

function padCell(s: string, w: number): string {
  const str = s.replace(/\s+/g, " ").trim();
  if (str.length >= w) return `${str.slice(0, w - 1)}…`;
  return str.padEnd(w, " ");
}

function printDoctorTable(rows: readonly DoctorCheckRow[]): void {
  const c0 = Math.max(6, ...rows.map((r) => r.name.length));
  const c1 = 6;
  const c2 = Math.min(42, Math.max(12, ...rows.map((r) => r.detail.length)));
  const c3 = Math.min(48, Math.max(16, ...rows.map((r) => r.fix.length)));

  const sep = `┌${"─".repeat(c0 + 2)}┬${"─".repeat(c1 + 2)}┬${"─".repeat(c2 + 2)}┬${"─".repeat(c3 + 2)}┐`;
  const mid = `├${"─".repeat(c0 + 2)}┼${"─".repeat(c1 + 2)}┼${"─".repeat(c2 + 2)}┼${"─".repeat(c3 + 2)}┤`;
  const bot = `└${"─".repeat(c0 + 2)}┴${"─".repeat(c1 + 2)}┴${"─".repeat(c2 + 2)}┴${"─".repeat(c3 + 2)}┘`;

  console.log(sep);
  console.log(
    `│ ${padCell("检查项", c0)} │ ${padCell("状态", c1)} │ ${padCell("详情", c2)} │ ${padCell("修复指引", c3)} │`,
  );
  console.log(mid);
  for (const r of rows) {
    console.log(
      `│ ${padCell(r.name, c0)} │ ${padCell(r.status, c1)} │ ${padCell(r.detail, c2)} │ ${padCell(r.fix, c3)} │`,
    );
  }
  console.log(bot);
}

export function doctorExitCode(rows: readonly DoctorCheckRow[]): 0 | 1 | 2 {
  const hasFail = rows.some((r) => r.status === "FAIL");
  const hasWarn = rows.some((r) => r.status === "WARN");
  if (hasFail) return 2;
  if (hasWarn) return 1;
  return 0;
}

/** 可注入依赖以便单测（不落盘浏览器）。 */
export interface DoctorRunOverrides {
  checkChromium?: (config: ResolvedAutovideoConfig) => Promise<DoctorCheckRow>;
  checkVoxcpmHealth?: (endpoint: string) => Promise<DoctorCheckRow>;
  checkAnthropicPing?: (config: ResolvedAutovideoConfig) => Promise<DoctorCheckRow>;
}

export async function runDoctorChecks(
  input: DoctorCliOptions,
  overrides?: DoctorRunOverrides,
): Promise<DoctorCheckRow[]> {
  const { config } = loadResolvedCliConfig({ argv: input.argv, cwd: input.cwd });
  const cacheDir = config.resolvedCacheDir;

  const rows: DoctorCheckRow[] = [];
  rows.push(await checkNodeVersion());
  rows.push(checkFfmpegVersion());
  rows.push(
    overrides?.checkChromium != null
      ? await overrides.checkChromium(config)
      : await checkChromium(config),
  );
  rows.push(await checkCjkFontModule());
  rows.push(
    overrides?.checkVoxcpmHealth != null
      ? await overrides.checkVoxcpmHealth(config.voxcpm.endpoint)
      : await checkVoxcpmHealth(config.voxcpm.endpoint),
  );
  rows.push(checkVoxcpmModelWeights(config.voxcpm.modelDir));
  rows.push(checkAnthropicApiKey(config.anthropic.apiKeyEnv));
  rows.push(
    overrides?.checkAnthropicPing != null
      ? await overrides.checkAnthropicPing(config)
      : await checkAnthropicPing(config),
  );
  rows.push(checkCacheWritable(cacheDir));
  rows.push(checkDiskSpace(cacheDir));
  rows.push(checkPrlimitUnshare());
  return rows;
}

export async function runDoctorCommand(input: DoctorCliOptions): Promise<number> {
  const rows = await runDoctorChecks(input);
  printDoctorTable(rows);
  const code = doctorExitCode(rows);
  if (code === 0) {
    console.log("\n退出码 0：全部 PASS。");
  } else if (code === 1) {
    console.log("\n退出码 1：存在 WARN，无 FAIL。");
  } else {
    console.log("\n退出码 2：存在 FAIL。请先修复上表 FAIL 项。");
  }
  return code;
}
