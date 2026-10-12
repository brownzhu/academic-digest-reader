import { classifyItem } from "../classification/classify";
import { evidence } from "../domain/evidence";
import type { FieldEvidence } from "../domain/evidence";
import type { DigestItem } from "../domain/item";
import { extractCompensation } from "../extractors/compensation";
import {
  choosePrimaryDeadline,
  extractDates,
  extractMessageDate,
} from "../extractors/dates";
import { extractUrls } from "../extractors/urls";
import { extractExplicitOrganizationAndLocation } from "../extractors/weak-fields";
import { scoreRelevance } from "../relevance/score";
import { escapeRegExp, stableHash } from "../utils/text";

export interface EntryHeader {
  fromRaw: string;
  fromOffset: number;
  dateRaw: string;
  dateOffset: number;
  subject: string;
  subjectSource: string;
  subjectOffset: number;
  body: string;
  bodyOffset: number;
}

function parseSender(fromRaw: string, offset: number): {
  sender: string | null;
  senderEmail: string | null;
  evidence: FieldEvidence[];
  warnings: string[];
} {
  const resultEvidence: FieldEvidence[] = [];
  const warnings: string[] = [];
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const emailMatch = fromRaw.match(emailPattern);
  const senderEmail = emailMatch?.[0] ?? null;
  let sender: string | null = fromRaw;
  if (senderEmail) {
    sender = fromRaw
      .replace(emailPattern, "")
      .replace(/[<>]/g, "")
      .replace(/\s+,/g, ",")
      .replace(/[,;]\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
    resultEvidence.push(
      evidence(
        "senderEmail",
        "header.from.email",
        senderEmail,
        offset + fromRaw.indexOf(senderEmail),
      ),
    );
  } else if (/[©@]/.test(fromRaw)) {
    warnings.push("From field resembles an email address but is not syntactically valid; senderEmail left null.");
  }
  sender = sender || fromRaw || null;
  if (sender) {
    resultEvidence.push(evidence("sender", "header.from.name", fromRaw, offset));
  }
  return { sender, senderEmail, evidence: resultEvidence, warnings };
}

export function buildItem(header: EntryHeader, index: number, volume: string, issue: string, prefix = "na", links: readonly { text: string; url: string }[] = []): DigestItem {
  const sender = parseSender(header.fromRaw, header.fromOffset);
  const messageDate = extractMessageDate(header.dateRaw, header.dateOffset);
  const classification = classifyItem(header.subject, header.body);
  const dates = extractDates(header.body, header.subject);
  const compensation = extractCompensation(header.body);
  const weakFields = extractExplicitOrganizationAndLocation(header.body);
  const urls = extractUrls(header.body);
  for (const link of links) {
    const pattern = linkTextPattern(link.text);
    const match = pattern ? pattern.exec(header.body) : null;
    if (!match || match.index === undefined || urls.some((entry) => entry.url === link.url)) continue;
    try {
      if (!["http:", "https:"].includes(new URL(link.url).protocol)) continue;
    } catch { continue; }
    urls.push({ url: link.url, evidence: evidence(`urls[${urls.length}]`, "url.html-anchor", match[0], match.index) });
  }
  const relevance = scoreRelevance(`${header.subject}\n${header.body}`);
  const itemEvidence: FieldEvidence[] = [
    evidence("title", "header.subject", header.subjectSource, header.subjectOffset),
    classification.evidence,
    ...sender.evidence,
    ...(messageDate ? [messageDate.evidence] : []),
    ...compensation.evidence,
    ...weakFields.evidence,
    evidence("originalBody", "segment.body", header.body, header.bodyOffset),
  ];

  const warnings = [...sender.warnings];
  if (!messageDate) warnings.push(header.dateRaw ? `Unrecognized message Date header: ${header.dateRaw}` : "No message Date header was supplied.");
  const unknownDateCount = dates.filter(
    (date) => date.kind === "unknown" && !date.evidence.ruleId.startsWith("date.deadline."),
  ).length;
  if (unknownDateCount > 0) {
    warnings.push(`${unknownDateCount} date(s) retained without a reliable semantic type.`);
  }

  return {
    id: `${prefix}-${volume}-${issue}-${index + 1}-${stableHash(header.subject.toLowerCase())}`,
    originalIndex: index,
    title: header.subject,
    category: classification.category,
    sender: sender.sender,
    senderEmail: sender.senderEmail,
    messageDate,
    organization: weakFields.organization,
    location: weakFields.location,
    dates,
    deadline: choosePrimaryDeadline(dates),
    salary: compensation.salary,
    funding: compensation.funding,
    tags: relevance.matches.map((match) => match.keyword),
    urls,
    originalBody: header.body,
    relevance,
    evidence: itemEvidence,
    extractionConfidence: Math.max(0, 1 - warnings.length * 0.05),
    warnings,
  };
}


function linkTextPattern(text: string): RegExp | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length ? new RegExp(words.map(escapeRegExp).join("\\s+"), "g") : null;
}

/** No card assignment when a label identifies multiple positions or URLs. */
export function unambiguousLinks(text: string, links: readonly { text: string; url: string }[] = []) {
  return links.filter(link => {
    const pattern = linkTextPattern(link.text);
    if (!pattern || [...text.matchAll(pattern)].length !== 1) return false;
    const label = link.text.replace(/\s+/g, " ").trim();
    return !links.some(other => other.url !== link.url && other.text.replace(/\s+/g, " ").trim() === label);
  });
}
