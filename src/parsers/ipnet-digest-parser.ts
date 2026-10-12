import type { Digest } from "../domain/digest";
import { evidence } from "../domain/evidence";
import { parseEnglishDate } from "../extractors/dates";
import { normalizeText } from "../utils/text";
import { buildItem, unambiguousLinks, type EntryHeader } from "./entry";
import { DigestParseError, type DigestParser, type ParserMetadata, type ParserProbe } from "./parser";

const HEADER = /^IPNet Digest[ \t,]+Volume\s+(\d+)\s*,\s*Number\s+(\d+)\s+([^\n]+)$/im;
// IPNet uses repeated Unicode ellipses; accept equivalent plain-text dot rules.
const RULE = /^[ \t]*(?:[…\.][ \t]*){10,}$/gm;
const FOOTER = /^[ \t]*:{5,}[ \t]*end[ \t]*:{5,}.*$/im;

function entryHeader(text: string, start: number): EntryHeader | null {
  const match = text.match(/^From[ \t]*:[ \t]*([^\n]+)\n\s*Date[ \t]*:[ \t]*([^\n]+)\n\s*Subject[ \t]*:[ \t]*([^\n]+(?:\n(?!\s*\n)[^\n]+)*)\n[ \t]*\n([\s\S]+)$/i);
  if (!match) return null;
  const fromRaw = match[1]!.trim();
  const dateRaw = match[2]!.trim();
  const subjectSource = match[3]!.trim();
  const body = match[4]!.trim();
  if (!body) return null;
  const dateLabel = text.search(/\n\s*Date[ \t]*:/i);
  const subjectLabel = text.search(/\n\s*Subject[ \t]*:/i);
  const subjectOffset = text.indexOf(subjectSource, subjectLabel);
  return {
    fromRaw, dateRaw, subjectSource, body,
    subject: subjectSource.replace(/\s+/g, " "),
    fromOffset: start + text.indexOf(fromRaw),
    dateOffset: start + text.indexOf(dateRaw, dateLabel),
    subjectOffset: start + subjectOffset,
    bodyOffset: start + text.indexOf(body, subjectOffset + subjectSource.length),
  };
}

function comparable(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export class IpnetDigestParser implements DigestParser {
  readonly id = "ipnet-digest";
  readonly version = "0.1.0";

  canParse(text: string): ParserProbe {
    const normalized = normalizeText(text);
    const matched = HEADER.test(normalized);
    return { parserId: this.id, confidence: matched ? 0.95 : 0,
      reasons: matched ? ["Matched IPNet Digest volume/number/date header."] : [] };
  }

  parse(text: string, metadata?: ParserMetadata): Digest {
    const normalized = normalizeText(text);
    const header = normalized.match(HEADER);
    if (!header || header.index === undefined) throw new DigestParseError("IPNet Digest header was not found.");
    const volume = header[1]!;
    const issue = header[2]!;
    const dateRaw = header[3]!.trim();
    const dateIso = parseEnglishDate(dateRaw);
    const footer = normalized.match(FOOTER);
    const content = normalized.slice(0, footer?.index ?? normalized.length);
    const rules = [...content.matchAll(RULE)];
    const preamble = content.slice(0, rules[0]?.index ?? content.length);
    const warnings: string[] = [];
    const headers: EntryHeader[] = [];
    for (let index = 0; index < rules.length; index += 1) {
      const rawStart = rules[index]!.index + rules[index]![0].length;
      const raw = content.slice(rawStart, rules[index + 1]?.index ?? content.length);
      const segment = raw.trim();
      if (!segment) continue;
      const entry = entryHeader(segment, rawStart + raw.indexOf(segment));
      if (entry) headers.push(entry);
      else warnings.push(`IPNet section ${index + 1} has incomplete From/Date/Subject headers or body; it was not parsed.`);
    }
    if (!headers.length) throw new DigestParseError("No IPNet Digest entries with From/Date/Subject headers were found.");
    const items = headers.map((entry, index) => buildItem(entry, index, volume, issue, "ipnet", unambiguousLinks(normalized, metadata?.links)));
    const topicBlock = preamble.match(/Today's Topics:[ \t]*\n([\s\S]*?)(?=\n[ \t]*Submissions for IPNet Digest\s*:|$)/i)?.[1] ?? "";
    const topics = topicBlock.split(/\n/).map((line) => line.trim().replace(/^\d+[.)][ \t]+/, "")).filter(Boolean);
    if (topics.length && topics.length !== items.length) warnings.push(`Topic count (${topics.length}) does not match parsed item count (${items.length}).`);
    topics.forEach((topic, index) => {
      if (comparable(topic) !== comparable(items[index]?.title ?? "")) {
        warnings.push(`Topic ${index + 1} (“${topic}”) does not match its announcement subject${items[index] ? ` (“${items[index]!.title}”)` : ""}. Announcement headers are used for cards.`);
      }
    });
    if (!footer) warnings.push("IPNet end marker is missing; this message may be clipped. In Gmail, open “View entire message” to check for missing content.");
    if (!dateIso) warnings.push(`Unrecognized publication date: ${dateRaw}`);
    const editorMatch = preamble.match(/Today's Editor:[ \t]*(?:\n[ \t]*)?([^\n]+)/i);
    // Large horizontal gaps separate the name from the affiliation in IPNet.
    const editor = editorMatch?.[1]?.trim().split(/[ \t]{2,}/)[0] ?? null;
    const digestEvidence = [
      evidence("newsletterName", "digest.header.name", "IPNet Digest", header.index),
      evidence("volume", "digest.header.volume", volume, header.index + header[0].search(/Volume\s+/i) + header[0].match(/Volume\s+/i)![0].length),
      evidence("issue", "digest.header.issue", issue, header.index + header[0].search(/Number\s+/i) + header[0].match(/Number\s+/i)![0].length),
    ];
    if (editor && editorMatch?.index !== undefined) digestEvidence.push(evidence("editor", "digest.editor", editor, editorMatch.index + editorMatch[0].indexOf(editor)));
    return {
      schemaVersion: 1, parserId: this.id, parserVersion: this.version,
      source: metadata?.source ?? "gmail-copy", newsletterName: "IPNet Digest", volume, issue,
      publicationDate: dateIso ? { raw: dateRaw, iso: dateIso } : null,
      editor, originalSubject: metadata?.originalSubject ?? null, topics, items,
      evidence: digestEvidence, parseConfidence: Math.max(0.8, 1 - warnings.length * 0.05), warnings,
    };
  }
}
