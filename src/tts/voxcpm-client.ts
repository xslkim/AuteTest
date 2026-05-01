import { readFile } from "node:fs/promises";

/** PRD §6.2.3 — `/v1/speech` JSON 体中与配置对齐的推理字段 */
export interface VoxcpmSpeakParams {
  cfgValue: number;
  inferenceTimesteps: number;
  denoise: boolean;
  retryBadcase: boolean;
}

export interface VoxcpmClientOptions {
  /** 例如 `http://127.0.0.1:8000`，勿尾斜杠 */
  baseUrl: string;
  /** 可注入以便单测 mock */
  fetchImpl?: typeof fetch;
}

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    const t = await res.text();
    return t.length > 512 ? `${t.slice(0, 512)}…` : t;
  } catch {
    return "";
  }
}

export class VoxcpmClient {
  private readonly baseUrl: string;

  private readonly fetchImpl: typeof fetch;

  constructor(options: VoxcpmClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl.trim());
    const g = globalThis as typeof globalThis & { fetch?: typeof fetch };
    this.fetchImpl = options.fetchImpl ?? g.fetch?.bind(globalThis);
    if (typeof this.fetchImpl !== "function") {
      throw new Error("全局缺少 fetch；Node 20+ 必需");
    }
  }

  /** `GET /health` 返回 200 且 JSON 含 `status` 视为可用 */
  async health(): Promise<boolean> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/health`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { status?: string };
      return data.status === "ok";
    } catch {
      return false;
    }
  }

  /** `POST /v1/voices`，上传参考 WAV，返回 `voice_id` */
  async registerVoice(wavPath: string): Promise<string> {
    const buf = await readFile(wavPath);
    const wav_base64 = buf.toString("base64");
    const res = await this.fetchImpl(`${this.baseUrl}/v1/voices`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ wav_base64 }),
    });
    if (!res.ok) {
      const detail = await readErrorBody(res);
      throw new Error(
        `POST /v1/voices failed: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`,
      );
    }
    const data = (await res.json()) as { voice_id?: string };
    if (!data.voice_id || typeof data.voice_id !== "string") {
      throw new Error("POST /v1/voices: 响应缺少 voice_id");
    }
    return data.voice_id;
  }

  /** `POST /v1/speech`，返回 WAV 二进制 */
  async speak(
    text: string,
    voiceId: string,
    params: VoxcpmSpeakParams,
    options?: { signal?: AbortSignal },
  ): Promise<Buffer> {
    const body = {
      text,
      voice_id: voiceId,
      cfg_value: params.cfgValue,
      inference_timesteps: params.inferenceTimesteps,
      denoise: params.denoise,
      retry_badcase: params.retryBadcase,
    };
    const res = await this.fetchImpl(`${this.baseUrl}/v1/speech`, {
      method: "POST",
      headers: {
        Accept: "audio/wav,*/*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: options?.signal,
    });
    if (!res.ok) {
      const detail = await readErrorBody(res);
      throw new Error(
        `POST /v1/speech failed: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`,
      );
    }
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  }
}
