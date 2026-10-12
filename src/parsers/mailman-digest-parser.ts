import { evidence } from "../domain/evidence";
import type { Digest } from "../domain/digest";
import { normalizeText } from "../utils/text";
import { buildItem, unambiguousLinks, type EntryHeader } from "./entry";
import { DigestParseError, type DigestParser, type ParserMetadata, type ParserProbe } from "./parser";

// GNU Mailman's plain-text digest format: numbered messages after hyphen rules.
// https://docs.mailman3.org/projects/mailman/en/latest/src/mailman/runners/docs/digester.html
const IDENTITY = /^(.+? Digest),\s*Vol(?:ume)?\.?\s+(\d+),\s*(?:Issue|Number)\s+(\d+)$/i;
const SEPARATOR = /^-{20,}[ \t]*$/gm;
const NUMBER = /^Message:[ \t]*(\d+)[ \t]*\n/i;

function identity(text: string, metadata?: ParserMetadata) {
  return metadata?.originalSubject?.trim().match(IDENTITY)
    ?? text.match(/^End of (.+? Digest,\s*Vol[^\n]+)$/im)?.[1]?.trim().match(IDENTITY)
    ?? null;
}

function sections(text: string): { text: string; start: number }[] {
  const rules = [...text.matchAll(SEPARATOR)];
  return rules.map((rule, index) => {
    const start = rule.index + rule[0].length;
    const raw = text.slice(start, rules[index + 1]?.index ?? text.length);
    return { text: raw.trim(), start: start + raw.indexOf(raw.trim()) };
  });
}

function parseHeader(text: string, start: number): EntryHeader | null {
  const marker = text.match(NUMBER);
  if (!marker) return null;
  const blockEnd = text.indexOf("\n\n", marker[0].length);
  if (blockEnd < 0) return null;
  const fields = new Map<string, { value: string; offset: number }>();
  let lastField: string | null = null;
  let offset = marker[0].length;
  for (const line of text.slice(offset, blockEnd).split("\n")) {
    const field = line.match(/^([A-Za-z][A-Za-z-]*):[ \t]*(.*)$/);
    if (field) {
      lastField = field[1]!.toLowerCase();
      if (fields.has(lastField)) return null;
      fields.set(lastField, { value: field[2]!, offset: offset + line.length - field[2]!.length });
    } else if (/^[ \t]+\S/.test(line) && lastField) {
      fields.get(lastField)!.value += `\n${line}`;
    } else return null;
    offset += line.length + 1;
  }
  const from = fields.get("from");
  const subject = fields.get("subject");
  const date = fields.get("date");
  const body = text.slice(blockEnd).trim();
  if (!from?.value.trim() || !subject?.value.trim() || !body) return null;
  return {
    fromRaw: from.value.trim(), fromOffset: start + from.offset + from.value.indexOf(from.value.trim()),
    dateRaw: date?.value.trim() ?? "", dateOffset: start + (date?.offset ?? 0),
    subject: subject.value.replace(/\s+/g, " ").trim(), subjectSource: subject.value.trim(),
    subjectOffset: start + subject.offset + subject.value.indexOf(subject.value.trim()),
    body, bodyOffset: start + text.indexOf(body, blockEnd),
  };
}

export class MailmanDigestParser implements DigestParser {
  readonly id = "mailman-digest";
  readonly version = "0.1.0";

  canParse(text: string, metadata?: ParserMetadata): ParserProbe {
    const normalized = normalizeText(text);
    const matched = Boolean(identity(normalized, metadata)) && /^Today's Topics:/im.test(normalized)
      && sections(normalized).some(section => NUMBER.test(section.text));
    return { parserId: this.id, confidence: matched ? 0.9 : 0,
      reasons: matched ? ["Matched digest identity, topics and numbered Mailman message sections."] : [] };
  }

  parse(text: string, metadata?: ParserMetadata): Digest {
    const normalized = normalizeText(text);
    const header = identity(normalized, metadata);
    if (!header || this.canParse(normalized, metadata).confidence < 0.8) {
      throw new DigestParseError("Mailman digest identity or numbered message structure was not found.");
    }
    const warnings: string[] = [];
    const items = [];
    let expected = 1;
    for (const section of sections(normalized)) {
      const marker = section.text.match(NUMBER);
      if (!marker) {
        // Only the known footer and end marker may be ignored silently.
        if (section.text && !/^Subject:\s*Digest Footer\b/i.test(section.text)
          && !/^End of .+ Digest,/i.test(section.text)) warnings.push("An unnumbered Mailman section was not parsed; check the original message.");
        continue;
      }
      const number = Number(marker[1]);
      if (number !== expected) warnings.push(`Expected message ${expected}, found ${number}; the digest may be incomplete or reordered.`);
      expected = number + 1;
      const entry = parseHeader(section.text, section.start);
      if (!entry) {
        warnings.push(`Message ${number} has incomplete or ambiguous headers/body; it was not parsed.`);
        continue;
      }
      items.push(buildItem(entry, items.length, header[2]!, header[3]!, "mailman", unambiguousLinks(normalized, metadata?.links)));
    }
    if (!items.length) throw new DigestParseError("No complete Mailman messages were found.");
    const preamble = normalized.slice(0, normalized.search(SEPARATOR));
    const topicsText = preamble.match(/^Today's Topics:\s*\n([\s\S]*)/im)?.[1] ?? "";
    const topics = [...topicsText.matchAll(/^\s*\d+\.[ \t]+([^\n]+(?:\n[ \t]+(?!\d+\.)\S[^\n]*)*)/gm)]
      .map(match => match[1]!.replace(/\s+/g, " ").trim());
    if (topics.length !== items.length) warnings.push(`Topic count (${topics.length}) does not match parsed item count (${items.length}).`);
    if (!/^End of .+ Digest,/im.test(normalized)) warnings.push("Mailman end marker is missing; the message may be clipped.");
    const identitySource = metadata?.originalSubject?.trim().match(IDENTITY) ? metadata.originalSubject : normalized;
    const rule = identitySource === normalized ? "digest.footer" : "metadata.originalSubject";
    const identityStart = identitySource.indexOf(header[0]);
    const digestEvidence = [
      evidence("newsletterName", rule, header[1]!, identityStart),
      evidence("volume", rule, header[2]!, identityStart + header[0].indexOf(header[2]!, header[1]!.length)),
      evidence("issue", rule, header[3]!, identityStart + header[0].lastIndexOf(header[3]!)),
    ];
    return {
      schemaVersion: 1, parserId: this.id, parserVersion: this.version,
      source: metadata?.source ?? "gmail-copy", newsletterName: header[1]!, volume: header[2]!, issue: header[3]!,
      publicationDate: null, editor: null, originalSubject: metadata?.originalSubject ?? null,
      topics, items, evidence: digestEvidence, parseConfidence: warnings.length ? 0.8 : 0.95, warnings,
    };
  }
}
