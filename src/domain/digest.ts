import type { FieldEvidence } from "./evidence";
import type { DigestItem } from "./item";

export interface LocalDate {
  raw: string;
  iso: string;
}

export interface Digest {
  schemaVersion: 1;
  parserId: string;
  parserVersion: string;
  source: string;
  newsletterName: string;
  volume: string | null;
  issue: string | null;
  publicationDate: LocalDate | null;
  editor: string | null;
  originalSubject: string | null;
  topics: string[];
  items: DigestItem[];
  evidence: FieldEvidence[];
  parseConfidence: number;
  warnings: string[];
}
