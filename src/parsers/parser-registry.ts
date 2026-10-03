import type { DigestParser, ParserMetadata, ParserProbe } from "./parser";
import { DigestParseError } from "./parser";

export class ParserRegistry {
  constructor(private readonly parsers: readonly DigestParser[]) {}

  probe(text: string, metadata?: ParserMetadata): ParserProbe[] {
    return this.parsers
      .map((parser) => parser.canParse(text, metadata))
      .sort((a, b) => b.confidence - a.confidence);
  }

  parse(text: string, metadata?: ParserMetadata) {
    const probes = this.probe(text, metadata);
    const best = probes[0];
    if (!best || best.confidence < 0.8) {
      throw new DigestParseError("No supported digest parser matched confidently.", [
        ...probes.map((probe) => `${probe.parserId}: ${probe.confidence}`),
      ]);
    }

    const parser = this.parsers.find((candidate) => candidate.id === best.parserId);
    if (!parser) {
      throw new DigestParseError(`Parser ${best.parserId} is not registered.`);
    }
    return parser.parse(text, metadata);
  }
}
