import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import {
  assertCompiledScript,
  parseScriptJson,
  scriptSchema,
} from "../src/types/script.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("script IR", () => {
  it("parses minimal fixture via Zod", () => {
    const raw = JSON.parse(
      readFileSync(join(__dirname, "fixtures", "minimal-script.json"), "utf8"),
    );
    const script = parseScriptJson(raw);
    expect(script.blocks).toHaveLength(1);
    expect(script.blocks[0]?.id).toBe("B01");
  });

  it("minimal fixture validates against exported JSON Schema", () => {
    const raw = JSON.parse(
      readFileSync(join(__dirname, "fixtures", "minimal-script.json"), "utf8"),
    );
    const schema = JSON.parse(
      readFileSync(join(__dirname, "..", "schemas", "script.schema.json"), "utf8"),
    );
    const ajv = new Ajv({ strict: false, allErrors: true });
    const validate = ajv.compile(schema);
    const ok = validate(raw);
    if (!ok) {
      console.error(validate.errors);
    }
    expect(ok).toBe(true);
  });

  it("assertCompiledScript({}) throws (missing required fields)", () => {
    expect(() => assertCompiledScript({})).toThrow();
  });

  it("scriptSchema shape matches PRD root keys", () => {
    const keys = scriptSchema.keyof().options;
    expect(keys).toEqual(
      expect.arrayContaining(["meta", "blocks", "artifacts", "assets"]),
    );
    expect(keys).toHaveLength(4);
  });
});
