import { evidence } from "../domain/evidence";
import type { DateKind, ExtractedDate } from "../domain/item";

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const MONTH_PATTERN =
  "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";

interface DateCandidate {
  raw: string;
  iso: string;
  start: number;
  end: number;
}

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

function monthNumber(raw: string): number | null {
  return MONTHS[raw.toLowerCase().replace(/\.$/, "")] ?? null;
}

export function parseEnglishDate(raw: string): string | null {
  const normalized = raw.trim().replace(/\s+/g, " ").replace(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b\s*,?\s*/i, "");
  const monthFirst = normalized.match(
    new RegExp(`^(${MONTH_PATTERN})\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})$`, "i"),
  );
  if (monthFirst) {
    const month = monthNumber(monthFirst[1]!);
    return month ? isoDate(Number(monthFirst[3]), month, Number(monthFirst[2])) : null;
  }

  const dayFirst = normalized.match(
    new RegExp(`^(\\d{1,2})\\s+(${MONTH_PATTERN})\\.?[,]?\\s+(\\d{4})$`, "i"),
  );
  if (dayFirst) {
    const month = monthNumber(dayFirst[2]!);
    return month ? isoDate(Number(dayFirst[3]), month, Number(dayFirst[1])) : null;
  }
  return null;
}

function pushCandidate(
  results: DateCandidate[],
  raw: string,
  start: number,
  year: number,
  month: number,
  day: number,
): void {
  const iso = isoDate(year, month, day);
  if (iso) {
    results.push({ raw, iso, start, end: start + raw.length });
  }
}

export function findDateCandidates(text: string): DateCandidate[] {
  const results: DateCandidate[] = [];
  const occupied: Array<[number, number]> = [];

  const crossMonthRange = new RegExp(
    `\\b(?:from[ \\t]+)?(${MONTH_PATTERN})\\.?[ \\t]+(\\d{1,2})[ \\t]*(?:[-–]|to)[ \\t]*(${MONTH_PATTERN})\\.?[ \\t]+(\\d{1,2}),?[ \\t\\n]+(\\d{4})\\b`,
    "gi",
  );
  for (const match of text.matchAll(crossMonthRange)) {
    const start = match.index;
    const firstMonth = monthNumber(match[1]!);
    const secondMonth = monthNumber(match[3]!);
    if (firstMonth === null || secondMonth === null) continue;
    const year = Number(match[5]);
    pushCandidate(results, `${match[1]} ${match[2]}, ${year}`, start, year, firstMonth, Number(match[2]));
    pushCandidate(results, `${match[3]} ${match[4]}, ${year}`, start, year, secondMonth, Number(match[4]));
    occupied.push([start, start + match[0].length]);
  }

  const monthRange = new RegExp(
    `\\b(${MONTH_PATTERN})\\.?[ \\t]+(\\d{1,2})[ \\t]*[-–][ \\t]*(\\d{1,2}),?[ \\t\\n]+(\\d{4})\\b`,
    "gi",
  );
  for (const match of text.matchAll(monthRange)) {
    const start = match.index;
    const month = monthNumber(match[1]!);
    if (month === null) continue;
    const year = Number(match[4]);
    pushCandidate(results, `${match[1]} ${match[2]}, ${match[4]}`, start, year, month, Number(match[2]));
    pushCandidate(
      results,
      `${match[1]} ${match[3]}, ${match[4]}`,
      start,
      year,
      month,
      Number(match[3]),
    );
    occupied.push([start, start + match[0].length]);
  }

  const dayRange = new RegExp(
    `\\b(\\d{1,2})[ \\t]*[-–][ \\t]*(\\d{1,2})[ \\t]+(${MONTH_PATTERN})\\.?[,]?[ \\t\\n]+(\\d{4})\\b`,
    "gi",
  );
  for (const match of text.matchAll(dayRange)) {
    const start = match.index;
    const month = monthNumber(match[3]!);
    if (month === null) continue;
    const year = Number(match[4]);
    pushCandidate(results, `${match[1]} ${match[3]} ${match[4]}`, start, year, month, Number(match[1]));
    pushCandidate(results, `${match[2]} ${match[3]} ${match[4]}`, start, year, month, Number(match[2]));
    occupied.push([start, start + match[0].length]);
  }

  const singlePatterns = [
    new RegExp(`\\b(${MONTH_PATTERN})\\.?[ \\t]+(\\d{1,2}),?[ \\t\\n]+(\\d{4})\\b`, "gi"),
    new RegExp(`\\b(\\d{1,2})[ \\t]+(${MONTH_PATTERN})\\.?[,]?[ \\t\\n]+(\\d{4})\\b`, "gi"),
  ];

  for (const [patternIndex, pattern] of singlePatterns.entries()) {
    for (const match of text.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (occupied.some(([left, right]) => start >= left && end <= right)) continue;

      const monthRaw = patternIndex === 0 ? match[1]! : match[2]!;
      const dayRaw = patternIndex === 0 ? match[2]! : match[1]!;
      const yearRaw = match[3]!;
      const month = monthNumber(monthRaw);
      if (month === null) continue;
      pushCandidate(results, match[0], start, Number(yearRaw), month, Number(dayRaw));
    }
  }

  return results
    .filter(
      (candidate, index, all) =>
        all.findIndex(
          (other) => other.start === candidate.start && other.iso === candidate.iso,
        ) === index,
    )
    .sort((a, b) => a.start - b.start || a.iso.localeCompare(b.iso));
}

function inferDeadlineKind(beforeDate: string, title: string): DateKind | null {
  const lower = beforeDate.toLowerCase();
  const titleLower = title.toLowerCase();
  const hasDeadlineCue =
    /deadline|apply by|applications? (?:close|received)|closes? on|received by|full consideration|accepted through|closure of/.test(
      lower,
    );
  if (!hasDeadlineCue) return null;
  if (/abstract/.test(lower)) return "abstract-deadline";
  if (/registration/.test(lower)) return "registration-deadline";
  if (/submission|submissions|call for papers/.test(lower) || /call for papers/.test(titleLower)) {
    return "submission-deadline";
  }
  if (/application|applications|apply|applicants|full consideration|accepted through/.test(lower)) {
    return "application-deadline";
  }
  return "other-deadline";
}

function looksLikeEventContext(context: string): boolean {
  return /conference|meeting|summer school|workshop|will be held|take place/i.test(context);
}

function sentenceBounds(text: string, start: number, end: number): [number, number] {
  const leftText = text.slice(0, start);
  const lastBoundary = Math.max(
    leftText.lastIndexOf("."),
    leftText.lastIndexOf("!"),
    leftText.lastIndexOf("?"),
  );
  const rightText = text.slice(end);
  const endings = [".", "!", "?"]
    .map((marker) => rightText.indexOf(marker))
    .filter((position) => position >= 0);
  const rightBoundary = endings.length > 0 ? end + Math.min(...endings) : text.length;
  return [lastBoundary + 1, rightBoundary];
}

export function extractDates(text: string, title: string): ExtractedDate[] {
  const candidates = findDateCandidates(text);
  return candidates.map((candidate, index) => {
    const [left, right] = sentenceBounds(text, candidate.start, candidate.end);
    const context = text.slice(left, right);
    // A previous date ends its own label's scope, even in punctuation-free
    // lists. Keep hard-wrapped context when there is no intervening date.
    const previous = candidates[index - 1];
    const labelStart = previous && previous.end <= candidate.start ? Math.max(left, previous.end) : left;
    const beforeDate = text.slice(labelStart, candidate.start);
    const deadlineKind = inferDeadlineKind(beforeDate, title);
    let kind: DateKind = deadlineKind ?? "unknown";
    if (!deadlineKind && /\bapplications?.*\bopen\s+on\s*$/i.test(beforeDate)) {
      kind = "application-open";
    }
    if (!deadlineKind && /\bstart(?:ing)?(?:\s+date)?\s*:?\s*$/i.test(beforeDate)) {
      kind = "start-date";
    }
    if (!deadlineKind && kind === "unknown" && looksLikeEventContext(context)) {
      const sameStart = candidates.filter((other) => other.start === candidate.start);
      kind = sameStart.length === 2 && candidate === sameStart[1] ? "event-end" : "event-start";
    }

    return {
      raw: candidate.raw,
      iso: candidate.iso,
      kind,
      evidence: evidence(
        `dates[${index}]`,
        deadlineKind ? `date.deadline.${deadlineKind}` : `date.${kind}`,
        candidate.raw,
        candidate.start,
        deadlineKind || kind !== "unknown" ? "high" : "medium",
      ),
    };
  });
}

export function extractMessageDate(raw: string, sourceOffset: number): ExtractedDate | null {
  // RFC email Date headers include a time and zone. Preserve the written
  // calendar date; do not convert it across time zones or accept numeric dates.
  const dateOnly = raw.replace(/\s+\d{1,2}:\d{2}(?::\d{2})?\s+(?:[+-]\d{4}|UT|UTC|GMT)(?:\s+\([^)]*\))?$/i, "");
  const iso = parseEnglishDate(dateOnly);
  if (!iso) return null;
  return {
    raw,
    iso,
    kind: "message-date",
    evidence: evidence("messageDate", "header.date.english", raw, sourceOffset),
  };
}

export function choosePrimaryDeadline(dates: readonly ExtractedDate[]): ExtractedDate | null {
  const priorities: DateKind[] = [
    "application-deadline",
    "submission-deadline",
    "abstract-deadline",
    "registration-deadline",
    "other-deadline",
  ];
  const deadlines = dates.filter((date) => date.evidence.ruleId.startsWith("date.deadline."));
  return (
    [...deadlines].sort(
      (a, b) => priorities.indexOf(a.kind) - priorities.indexOf(b.kind) || a.iso.localeCompare(b.iso),
    )[0] ?? null
  );
}
