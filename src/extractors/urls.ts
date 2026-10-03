import { evidence } from "../domain/evidence";
import type { DigestUrl } from "../domain/item";

interface UrlCandidate {
  raw: string;
  joined: string;
  start: number;
  end: number;
}

function trimTrailingPunctuation(value: string): string {
  let result = value;
  while (/[.,;:!?]$/.test(result)) result = result.slice(0, -1);
  while (result.endsWith(")") && (result.match(/\(/g)?.length ?? 0) < (result.match(/\)/g)?.length ?? 0)) {
    result = result.slice(0, -1);
  }
  return result;
}

function unwrapKnownRedirect(url: string): string {
  const proofpoint = url.match(
    /^https?:\/\/urldefense\.com\/v3\/__(https?:\/\/.*?)__;[^\s]*$/i,
  );
  if (!proofpoint) return url;
  try {
    const destination = new URL(proofpoint[1]!);
    return destination.protocol === "http:" || destination.protocol === "https:"
      ? destination.toString().replace(/\/$/, "")
      : url;
  } catch {
    return url;
  }
}

function tokenEnd(text: string, start: number): number {
  let end = start;
  while (end < text.length && !/[\s<>"'\]]/.test(text[end]!)) end += 1;
  return end;
}

function nextLineToken(
  text: string,
  newlineIndex: number,
): { start: number; end: number; token: string } | null {
  let start = newlineIndex + 1;
  while (text[start] === " " || text[start] === "\t") start += 1;
  if (text[start] === "\n" || start >= text.length) return null;
  const end = tokenEnd(text, start);
  const token = text.slice(start, end);
  if (!token || /^(?:From:|Date:|Subject:|[-*])/.test(token)) return null;
  return { start, end, token };
}

function shouldJoinWrappedPart(joined: string): boolean {
  return (
    joined === "http://" ||
    joined === "https://" ||
    /[\/-]$/.test(joined) ||
    /^https?:\/\/urldefense\.com\/v3\//i.test(joined)
  );
}

function scanUrlCandidates(text: string): UrlCandidate[] {
  const candidates: UrlCandidate[] = [];
  let coveredUntil = -1;
  for (const startMatch of text.matchAll(/https?:\/\//gi)) {
    const start = startMatch.index;
    if (start < coveredUntil) continue;
    let end = tokenEnd(text, start);
    let joined = text.slice(start, end);

    while (end < text.length && text[end] === "\n" && shouldJoinWrappedPart(joined)) {
      const continuation = nextLineToken(text, end);
      if (!continuation) break;
      joined += continuation.token;
      end = continuation.end;
    }

    candidates.push({ raw: text.slice(start, end), joined, start, end });
    coveredUntil = end;
  }
  return candidates;
}

export function extractUrls(text: string): DigestUrl[] {
  const urls: DigestUrl[] = [];
  for (const candidate of scanUrlCandidates(text)) {
    const wrappedUrl = trimTrailingPunctuation(candidate.joined);
    const url = unwrapKnownRedirect(wrappedUrl);
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    } catch {
      continue;
    }
    if (urls.some((entry) => entry.url === url)) continue;
    urls.push({
      url,
      evidence: evidence(
        `urls[${urls.length}]`,
        url !== wrappedUrl
          ? "url.known-redirect"
          : candidate.raw.includes("\n")
            ? "url.http-wrapped"
            : "url.http",
        candidate.raw,
        candidate.start,
      ),
    });
  }
  return urls;
}
