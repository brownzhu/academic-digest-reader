import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Digest } from "../src/domain/digest";
import { NaDigestParser } from "../src/parsers/na-digest-parser";

export const PROJECT_ROOT = resolve(import.meta.dirname, "..");

export function fixture(name: string): string {
  return readFileSync(resolve(PROJECT_ROOT, "tests/fixtures/na-digest", name), "utf8");
}

export function parseGoldenDigest(): Digest {
  return new NaDigestParser().parse(fixture("na-digest-synthetic-v26n40.txt"), {
    source: "gmail-copy",
  });
}
