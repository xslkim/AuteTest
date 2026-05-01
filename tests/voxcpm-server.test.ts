import { describe, expect, it } from "vitest";

import { parseVoxcpmEndpoint } from "../src/tts/voxcpm-server.js";

describe("parseVoxcpmEndpoint", () => {
  it("解析显式端口", () => {
    expect(parseVoxcpmEndpoint("http://127.0.0.1:8123")).toEqual({
      host: "127.0.0.1",
      port: 8123,
    });
  });

  it("无 scheme 时补全 http", () => {
    expect(parseVoxcpmEndpoint("127.0.0.1:9000")).toEqual({
      host: "127.0.0.1",
      port: 9000,
    });
  });

  it("http 且无端口时默认 8000（与 PRD 默认 endpoint 一致）", () => {
    expect(parseVoxcpmEndpoint("http://127.0.0.1")).toEqual({
      host: "127.0.0.1",
      port: 8000,
    });
  });
});
