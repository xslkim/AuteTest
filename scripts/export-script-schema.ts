import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import { scriptSchema } from "../src/types/script.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "..", "schemas", "script.schema.json");

mkdirSync(dirname(outPath), { recursive: true });
const jsonSchema = zodToJsonSchema(scriptSchema, {
  name: "Script",
  $refStrategy: "none",
});

writeFileSync(outPath, `${JSON.stringify(jsonSchema, null, 2)}\n`, "utf8");
console.error(`Wrote ${outPath}`);
