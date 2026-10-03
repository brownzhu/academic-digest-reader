import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NaDigestParser } from "../src/parsers/na-digest-parser";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = resolve(
  projectRoot,
  "tests/fixtures/na-digest/na-digest-synthetic-v26n40.txt",
);
const outputPath = resolve(projectRoot, "artifacts/na-digest-synthetic.normalized.json");
const text = await readFile(fixturePath, "utf8");
const digest = new NaDigestParser().parse(text, { source: "gmail-copy" });

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(digest, null, 2)}\n`, "utf8");
console.log(`Parsed ${digest.items.length} items with ${digest.warnings.length} digest warning(s).`);
console.log(`Wrote ${outputPath}`);
