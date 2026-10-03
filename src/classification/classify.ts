import { evidence } from "../domain/evidence";
import type { FieldEvidence } from "../domain/evidence";
import type { Category } from "../domain/item";
import { CATEGORY_RULES } from "./rules";

export interface Classification {
  category: Category;
  evidence: FieldEvidence;
}

export function classifyItem(title: string, body: string): Classification {
  for (const [source, confidence, offset] of [
    [title, "high", 0],
    [body, "medium", title.length + 1],
  ] as const) {
    for (const rule of CATEGORY_RULES) {
      for (const pattern of rule.patterns) {
        const match = source.match(pattern);
        if (match?.index !== undefined) {
          return {
            category: rule.category,
            evidence: evidence(
              "category",
              rule.id,
              match[0],
              offset + match.index,
              confidence,
            ),
          };
        }
      }
    }
  }
  return {
    category: "Other",
    evidence: evidence("category", "category.fallback-other", title, 0, "low"),
  };
}
