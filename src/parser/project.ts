import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

export interface LoadedProjectFile {
  /** `project.json` 所在目录（绝对路径） */
  projectRootDir: string;
  /** `project.json` 绝对路径 */
  projectFilePath: string;
  /** `meta` 字段指向的文件（绝对路径） */
  metaPathAbs: string;
  /** `blocks` 中每个内容文件的绝对路径（顺序与 JSON 一致） */
  blockPathsAbs: string[];
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function assertFileExists(absPath: string, label: string): void {
  if (!existsSync(absPath)) {
    throw new Error(`${label} 不存在或不可访问: ${absPath}`);
  }
}

/**
 * 读取并校验 `project.json`：`meta` / `blocks` 相对路径解析为绝对路径并校验文件存在。
 *
 * @param projectJsonPath `project.json` 的路径（绝对或相对 `cwd`）
 */
export function loadProjectFile(
  projectJsonPath: string,
  cwd: string,
): LoadedProjectFile {
  const projectFilePath = resolvePath(cwd, projectJsonPath);
  assertFileExists(projectFilePath, "project.json");

  const projectRootDir = resolvePath(projectFilePath, "..");
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(projectFilePath, "utf8")) as unknown;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`无法解析 JSON: ${projectFilePath}: ${msg}`);
  }

  if (!isPlainRecord(raw)) {
    throw new Error(`project.json 顶层必须是对象: ${projectFilePath}`);
  }

  const extraKeys = Object.keys(raw).filter((k) => k !== "meta" && k !== "blocks");
  if (extraKeys.length > 0) {
    throw new Error(
      `project.json 仅允许 meta / blocks 字段；多余键: ${extraKeys.join(", ")}`,
    );
  }

  const metaRaw = raw.meta;
  const blocksRaw = raw.blocks;

  if (typeof metaRaw !== "string" || !metaRaw.trim()) {
    throw new Error(`project.json 缺少非空字符串字段 meta: ${projectFilePath}`);
  }
  if (!Array.isArray(blocksRaw) || blocksRaw.length === 0) {
    throw new Error(
      `project.json.blocks 必须为非空字符串数组: ${projectFilePath}`,
    );
  }

  const metaPathAbs = resolvePath(projectRootDir, metaRaw);
  assertFileExists(metaPathAbs, "meta 文件");

  const blockPathsAbs: string[] = [];
  for (let i = 0; i < blocksRaw.length; i++) {
    const p = blocksRaw[i];
    if (typeof p !== "string" || !p.trim()) {
      throw new Error(
        `project.json.blocks[${i}] 必须为非空字符串: ${projectFilePath}`,
      );
    }
    const abs = resolvePath(projectRootDir, p);
    assertFileExists(abs, `内容文件 blocks[${i}]`);
    blockPathsAbs.push(abs);
  }

  return {
    projectRootDir,
    projectFilePath,
    metaPathAbs,
    blockPathsAbs,
  };
}
