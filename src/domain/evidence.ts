export type Confidence = "high" | "medium" | "low";

export interface FieldEvidence {
  field: string;
  ruleId: string;
  sourceText: string;
  start: number;
  end: number;
  confidence: Confidence;
}

export function evidence(
  field: string,
  ruleId: string,
  sourceText: string,
  start: number,
  confidence: Confidence = "high",
): FieldEvidence {
  return {
    field,
    ruleId,
    sourceText,
    start,
    end: start + sourceText.length,
    confidence,
  };
}
