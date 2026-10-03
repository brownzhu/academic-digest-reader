import type { FieldEvidence } from "./evidence";

export type Category =
  | "Conference"
  | "Workshop"
  | "Summer School"
  | "PhD"
  | "Postdoc"
  | "Faculty"
  | "Job"
  | "Call for Papers"
  | "Journal / New Issue"
  | "Software"
  | "Book"
  | "Research / Open Problem"
  | "Other";

export type DateKind =
  | "message-date"
  | "application-deadline"
  | "submission-deadline"
  | "abstract-deadline"
  | "registration-deadline"
  | "other-deadline"
  | "event-start"
  | "event-end"
  | "application-open"
  | "start-date"
  | "unknown";

export interface ExtractedDate {
  raw: string;
  iso: string;
  kind: DateKind;
  evidence: FieldEvidence;
}

export interface DigestUrl {
  url: string;
  evidence: FieldEvidence;
}

export interface KeywordMatch {
  keyword: string;
  weight: number;
  occurrences: number;
  evidence: FieldEvidence[];
}

export interface DigestItem {
  id: string;
  originalIndex: number;
  title: string;
  category: Category;
  sender: string | null;
  senderEmail: string | null;
  messageDate: ExtractedDate | null;
  organization: string | null;
  location: string | null;
  dates: ExtractedDate[];
  deadline: ExtractedDate | null;
  salary: string | null;
  funding: string | null;
  tags: string[];
  urls: DigestUrl[];
  originalBody: string;
  relevance: {
    score: number;
    matches: KeywordMatch[];
  };
  evidence: FieldEvidence[];
  extractionConfidence: number;
  warnings: string[];
}
