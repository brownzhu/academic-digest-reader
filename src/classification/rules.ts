import type { Category } from "../domain/item";

export interface CategoryRule {
  id: string;
  category: Category;
  patterns: RegExp[];
}

// Order is intentional: specific position and publication categories precede
// broad event/job terms so one item receives one deterministic category.
export const CATEGORY_RULES: readonly CategoryRule[] = [
  {
    id: "category.summer-school",
    category: "Summer School",
    patterns: [/\bsummer school\b/i],
  },
  {
    id: "category.phd",
    category: "PhD",
    patterns: [/\bph\.?d\.?\s+(?:position|student|studentship)\b/i, /\bdoctoral\s+(?:position|student)\b/i],
  },
  {
    id: "category.postdoc",
    category: "Postdoc",
    patterns: [/\bpostdoc(?:toral)?\b/i],
  },
  {
    id: "category.faculty",
    category: "Faculty",
    patterns: [
      /\btenure[- ]track\b/i,
      /\bassistant professor\b/i,
      /\bfaculty position\b/i,
      /\bprofessorship\b/i,
    ],
  },
  {
    id: "category.call-for-papers",
    category: "Call for Papers",
    patterns: [
      /\bcall for papers\b/i,
      /\bcall for submissions\b/i,
      /\bspecial issue\b/i,
      /\bsoliciting submissions\b/i,
    ],
  },
  {
    id: "category.journal-issue",
    category: "Journal / New Issue",
    patterns: [/\bcontents?,\s+.*(?:volume|issue)\b/i, /\bnew (?:volume|issue)\b/i],
  },
  {
    id: "category.software",
    category: "Software",
    patterns: [
      /\b(?:software|library)\s+(?:release|version)\b/i,
      /\brelease of (?:the )?.*\blibrary\b/i,
      /\binspect .* in a browser\b/i,
    ],
  },
  {
    id: "category.book",
    category: "Book",
    patterns: [/\bnew book\b/i, /\bmonograph\b/i, /\bbook .*free to download\b/i],
  },
  {
    id: "category.open-problem",
    category: "Research / Open Problem",
    patterns: [/\bopen problems?\b/i],
  },
  {
    id: "category.workshop",
    category: "Workshop",
    patterns: [/\bworkshop\b/i],
  },
  {
    id: "category.conference",
    category: "Conference",
    patterns: [/\bconference\b/i, /\bannual meeting\b/i],
  },
  {
    id: "category.job",
    category: "Job",
    patterns: [/\bjob\b/i, /\bposition\b/i, /\bopening\b/i],
  },
] as const;
