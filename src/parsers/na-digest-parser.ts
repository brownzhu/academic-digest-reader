import { evidence } from "../domain/evidence";
import type { FieldEvidence } from "../domain/evidence";
import type { Digest } from "../domain/digest";
import { parseEnglishDate } from "../extractors/dates";
import { normalizeText } from "../utils/text";
import { buildItem, unambiguousLinks, type EntryHeader } from "./entry";
import type { DigestParser, ParserMetadata, ParserProbe } from "./parser";
import { DigestParseError } from "./parser";

const HEADER_PATTERN =
  /^NA Digest\s+(.+?)\s+Volume\s+(\d+)\s*:\s*Issue\s+(\d+)\s*$/im;
// Mailing-list archives and Gmail normally preserve a solid hyphen rule, but
// visual wrapping can insert horizontal whitespace into the line. Require at
// least 20 actual hyphens so forwarded-message labels cannot become segments.
const SEPARATOR_PATTERN = /^(?=[ \t-]{20,}$)(?:[ \t]*-){20,}[ \t-]*$/gm;

interface Segment {
  text: string;
  start: number;
}

function splitSegments(text: string): Segment[] {
  const separators = [...text.matchAll(SEPARATOR_PATTERN)];
  if (separators.length === 0) return [{ text, start: 0 }];

  const segments: Segment[] = [];
  let start = 0;
  for (const separator of separators) {
    const separatorStart = separator.index;
    segments.push({ text: text.slice(start, separatorStart).trim(), start });
    start = separatorStart + separator[0].length;
    while (text[start] === "\n") start += 1;
  }
  segments.push({ text: text.slice(start).trim(), start });
  return segments.filter((segment) => segment.text.length > 0);
}

function parseEntryHeader(segment: Segment): EntryHeader | null {
  const match = segment.text.match(
    /^From:[ \t]*([\s\S]*?)\nDate:[ \t]*([\s\S]*?)\nSubject:[ \t]*([\s\S]*?)\n[ \t]*\n([\s\S]*)$/,
  );
  if (!match) return null;
  const fromRaw = match[1]!.trim().replace(/\n[ \t]*/g, " ").replace(/[ \t]+/g, " ");
  const dateRaw = match[2]!.trim().replace(/\n[ \t]*/g, " ").replace(/[ \t]+/g, " ");
  const subjectSource = match[3]!.trim();
  const subject = subjectSource.replace(/\n[ \t]*/g, " ").replace(/[ \t]+/g, " ").trim();
  const body = match[4]!.trim();
  const fromOffset = segment.start + segment.text.indexOf(match[1]!);
  const dateOffset = segment.start + segment.text.indexOf(match[2]!, segment.text.indexOf("Date:"));
  const subjectOffset =
    segment.start + segment.text.indexOf(match[3]!, segment.text.indexOf("Subject:"));
  const bodyLocalOffset = body.length > 0 ? segment.text.indexOf(body, segment.text.indexOf("Subject:")) : -1;
  return {
    fromRaw,
    fromOffset,
    dateRaw,
    dateOffset,
    subject,
    subjectSource,
    subjectOffset,
    body,
    bodyOffset: bodyLocalOffset >= 0 ? segment.start + bodyLocalOffset : segment.start,
  };
}

function extractOriginalSubject(text: string, metadata?: ParserMetadata): string | null {
  if (metadata?.originalSubject) return metadata.originalSubject;
  return text.match(/^NA Digest,\s*V\.\s*\d+,\s*#\s*\d+\s*$/im)?.[0] ?? null;
}

function extractTopicLines(preamble: string): string[] {
  const match = preamble.match(/Today's Topics:\s*\n([\s\S]*?)(?:\n\s*See this issue|\n\s*Submissions,)/i);
  if (!match) return [];
  return match[1]!
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function comparableTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * RFC-style mail wrapping can turn one table-of-contents title into several
 * physical lines. Rejoin only when the result matches the already parsed
 * Subject headers in order; otherwise keep the raw lines and surface the
 * ordinary count/title diagnostics instead of guessing.
 */
function reconcileTopics(topicLines: readonly string[], subjects: readonly string[]): string[] {
  if (topicLines.length === 0 || subjects.length === 0) return [...topicLines];
  const reconciled: string[] = [];
  let lineIndex = 0;

  for (const subject of subjects) {
    let combined = "";
    let matched = false;
    for (let end = lineIndex; end < topicLines.length; end += 1) {
      combined = `${combined} ${topicLines[end]}`.trim();
      const combinedComparable = comparableTitle(combined);
      const subjectComparable = comparableTitle(subject);
      if (combinedComparable === subjectComparable) {
        reconciled.push(combined);
        lineIndex = end + 1;
        matched = true;
        break;
      }
      if (combinedComparable.length > subjectComparable.length + 12 || end - lineIndex >= 4) {
        break;
      }
    }
    if (!matched) return [...topicLines];
  }

  return lineIndex === topicLines.length ? reconciled : [...topicLines];
}

export class NaDigestParser implements DigestParser {
  readonly id = "na-digest";
  readonly version = "0.2.0";

  canParse(text: string, metadata?: ParserMetadata): ParserProbe {
    const normalized = normalizeText(text);
    const reasons: string[] = [];
    let confidence = 0;
    if (HEADER_PATTERN.test(normalized)) {
      confidence += 0.65;
      reasons.push("Matched NA Digest volume/issue header.");
    }
    if (/Today's Topics:/i.test(normalized)) {
      confidence += 0.15;
      reasons.push("Matched Today's Topics section.");
    }
    if (/^From:.+\nDate:.+\nSubject:/m.test(normalized)) {
      confidence += 0.2;
      reasons.push("Matched NA Digest entry header sequence.");
    }
    if (metadata?.originalSubject && /NA Digest/i.test(metadata.originalSubject)) {
      confidence = Math.min(1, confidence + 0.05);
      reasons.push("Original subject identifies NA Digest.");
    }
    return { parserId: this.id, confidence: Math.min(1, confidence), reasons };
  }

  parse(text: string, metadata?: ParserMetadata): Digest {
    const normalized = normalizeText(text);
    const header = normalized.match(HEADER_PATTERN);
    if (!header?.index && header?.index !== 0) {
      throw new DigestParseError("NA Digest header was not found.");
    }
    const publicationDateRaw = header[1]!.trim();
    const publicationDateIso = parseEnglishDate(publicationDateRaw.replace(/^\w+,\s*/, ""));
    const volume = header[2]!;
    const issue = header[3]!;
    const segments = splitSegments(normalized);
    const preamble = segments[0]?.text ?? "";
    const topicLines = extractTopicLines(preamble);
    const entryHeaders = segments
      .map(parseEntryHeader)
      .filter((entry): entry is EntryHeader => entry !== null);

    if (entryHeaders.length === 0) {
      throw new DigestParseError("No NA Digest entries with From/Date/Subject headers were found.");
    }

    const items = entryHeaders.map((entry, index) => buildItem(entry, index, volume, issue, "na", unambiguousLinks(normalized, metadata?.links)));
    const topics = reconcileTopics(
      topicLines,
      items.map((item) => item.title),
    );
    const warnings: string[] = [];
    if (topics.length > 0 && topics.length !== items.length) {
      warnings.push(`Topic count (${topics.length}) does not match parsed item count (${items.length}).`);
    }
    const titleMismatches = topics.filter(
      (topic, index) => comparableTitle(items[index]?.title ?? "") !== comparableTitle(topic),
    );
    if (titleMismatches.length > 0) {
      warnings.push(`${titleMismatches.length} topic title(s) do not match entry subjects by position.`);
    }
    if (!publicationDateIso) {
      warnings.push(`Unrecognized publication date: ${publicationDateRaw}`);
    }

    const editorMatch = preamble.match(/Today's Editor:\s*\n\s*([^\n]+)/i);
    const editor = editorMatch?.[1]?.trim() ?? null;
    const digestEvidence: FieldEvidence[] = [
      evidence("newsletterName", "digest.header.name", "NA Digest", header.index),
      evidence("volume", "digest.header.volume", volume, header.index + header[0].indexOf(volume)),
      evidence("issue", "digest.header.issue", issue, header.index + header[0].lastIndexOf(issue)),
    ];
    if (editor && editorMatch?.index !== undefined) {
      digestEvidence.push(
        evidence("editor", "digest.editor", editor, editorMatch.index + editorMatch[0].indexOf(editor)),
      );
    }

    return {
      schemaVersion: 1,
      parserId: this.id,
      parserVersion: this.version,
      source: metadata?.source ?? "gmail-copy",
      newsletterName: "NA Digest",
      volume,
      issue,
      publicationDate: publicationDateIso
        ? { raw: publicationDateRaw, iso: publicationDateIso }
        : null,
      editor,
      originalSubject: extractOriginalSubject(normalized, metadata),
      topics,
      items,
      evidence: digestEvidence,
      parseConfidence: warnings.length === 0 ? 1 : Math.max(0.8, 1 - warnings.length * 0.05),
      warnings,
    };
  }
}
