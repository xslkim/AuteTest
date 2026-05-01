import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  pngBufferIsBlankSmoke,
  scanForbiddenInSource,
  validateRenderSmoke,
  validateStatic,
} from "../src/ai/validate.js";

describe("scanForbiddenInSource", () => {
  it("rejects fs import", () => {
    const res = scanForbiddenInSource(
      `import fs from "fs";\nexport default function X() { return null; }`,
      "x.tsx",
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.message).toMatch(/禁止的 import/);
    }
  });

  it("rejects node:https", () => {
    const res = scanForbiddenInSource(
      `import * as h from "node:https";\nexport default function X() { return null; }`,
      "x.tsx",
    );
    expect(res.ok).toBe(false);
  });

  it("allows react and remotion", () => {
    const res = scanForbiddenInSource(
      `import React from "react";
import { AbsoluteFill } from "remotion";
export default function X() { return <AbsoluteFill />; }`,
      "x.tsx",
    );
    expect(res.ok).toBe(true);
  });
});

describe("pngBufferIsBlankSmoke", () => {
  it("treats solid red as non-blank", async () => {
    const { PNG } = await import("pngjs");
    const png = new PNG({ width: 4, height: 4 });
    for (let i = 0; i < png.data.length; i += 4) {
      png.data[i] = 255;
      png.data[i + 1] = 0;
      png.data[i + 2] = 0;
      png.data[i + 3] = 255;
    }
    const buf = PNG.sync.write(png);
    expect(pngBufferIsBlankSmoke(buf)).toBe(false);
  });
});

describe("validateStatic (tsc)", () => {
  it("fails on type error and returns stderr head", async () => {
    const dir = await mkdtemp(join(tmpdir(), "av-bad-tsc-"));
    const f = join(dir, "Bad.tsx");
    await writeFile(
      f,
      `import React from "react";
export default function Bad(props: { n: number }) {
  const x: string = props.n;
  return <div>{x}</div>;
}
`,
      "utf8",
    );
    try {
      const res = await validateStatic(f);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.reason).toBe("tsc");
        expect(res.tscStderrHead?.length).toBeGreaterThan(0);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

const runRemotionSmoke = process.env.RUN_VISUAL_VALIDATE !== "0";

describe.runIf(runRemotionSmoke)("validateRenderSmoke (integration)", () => {
  it("renders a non-blank still for a valid component", async () => {
    const dir = await mkdtemp(join(tmpdir(), "av-smoke-"));
    const f = join(dir, "Good.tsx");
    await writeFile(
      f,
      `import React from "react";

export default function Good(props: AnimationProps) {
  return (
    <div
      style={{
        width: props.width,
        height: props.height,
        backgroundColor: "rgb(200, 60, 80)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 48,
      }}
    >
      Smoke
    </div>
  );
}
`,
      "utf8",
    );
    try {
      const res = await validateRenderSmoke(f, 5, 30, {
        width: 320,
        height: 180,
      });
      expect(res.ok).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 180_000);
});
