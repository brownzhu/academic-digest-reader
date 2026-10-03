import { evidence } from "../domain/evidence";
import type { FieldEvidence } from "../domain/evidence";

export interface CompensationExtraction {
  salary: string | null;
  funding: string | null;
  evidence: FieldEvidence[];
}

export function extractCompensation(text: string): CompensationExtraction {
  const extractedEvidence: FieldEvidence[] = [];
  let salary: string | null = null;
  let funding: string | null = null;

  const salaryMatch = text.match(
    /\b(?:salary|stipend)\s*:\s*((?:CAD|USD|EUR|GBP)?\s*[$€£]\s*[\d,]+(?:\.\d+)?(?:\s*(?:per year|\/year|annually))?)/i,
  );
  if (salaryMatch?.index !== undefined) {
    salary = salaryMatch[1]!.replace(/\s+/g, " ").trim();
    const valueOffset = salaryMatch.index + salaryMatch[0].indexOf(salaryMatch[1]!);
    extractedEvidence.push(evidence("salary", "compensation.explicit-salary", salaryMatch[1]!, valueOffset));
  }

  const fundingPatterns = [
    /\b(travel\s+and\s+accommodation\s+support\s+for\s+all\s+selected\s+participants)\b/i,
    /\b(fully funded)\b/i,
    /\b(generous professional travel allowance)\b/i,
  ];
  for (const pattern of fundingPatterns) {
    const match = text.match(pattern);
    if (match?.index !== undefined) {
      funding = match[1]!.replace(/\s+/g, " ").trim();
      const valueOffset = match.index + match[0].indexOf(match[1]!);
      extractedEvidence.push(evidence("funding", "compensation.explicit-funding", match[1]!, valueOffset));
      break;
    }
  }

  return { salary, funding, evidence: extractedEvidence };
}
