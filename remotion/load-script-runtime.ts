/** Remotion/Web 环境与 Node 解码 script.json：`voiceRef` 等绝对路径在 JSON.stringify 后直接落盘时已为字符串字面量（无 `\u`/控制字符逃逸需求）。 */

export async function fetchScriptJson(
  relativePathUnderPublic: string,
): Promise<string> {
  const res = await fetch(new URL(`/${relativePathUnderPublic}`, document.baseURI).href);
  if (!res.ok) {
    throw new Error(`Failed to load script.json (${relativePathUnderPublic}): HTTP ${String(res.status)}`);
  }
  return res.text();
}
