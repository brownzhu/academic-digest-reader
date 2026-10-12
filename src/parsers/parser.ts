import type { Digest } from "../domain/digest";

export interface ParserMetadata {
  originalSubject?: string | null;
  source?: string;
  links?: readonly { text: string; url: string }[];
}

export interface ParserProbe {
  parserId: string;
  confidence: number;
  reasons: string[];
}

export interface DigestParser {
  readonly id: string;
  readonly version: string;
  canParse(text: string, metadata?: ParserMetadata): ParserProbe;
  parse(text: string, metadata?: ParserMetadata): Digest;
}

export class DigestParseError extends Error {
  constructor(
    message: string,
    readonly diagnostics: string[] = [],
  ) {
    super(message);
    this.name = "DigestParseError";
  }
}
