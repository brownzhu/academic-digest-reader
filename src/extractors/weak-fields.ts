import { evidence } from "../domain/evidence";
import type { FieldEvidence } from "../domain/evidence";

export interface WeakFieldExtraction {
  organization: string | null;
  location: string | null;
  evidence: FieldEvidence[];
}

export function extractExplicitOrganizationAndLocation(text: string): WeakFieldExtraction {
  const extractedEvidence: FieldEvidence[] = [];
  const institution = text.match(/^Institution:\s*([^\n]+)$/im);
  if (institution?.index === undefined) {
    return { organization: null, location: null, evidence: extractedEvidence };
  }

  const fullValue = institution[1]!.trim();
  const valueOffset = institution.index + institution[0].indexOf(institution[1]!);
  const parts = fullValue.split(",").map((part) => part.trim()).filter(Boolean);
  const organization = parts[0] ?? null;
  const location = parts.length >= 3 ? parts.slice(1).join(", ") : null;

  if (organization) {
    extractedEvidence.push(
      evidence("organization", "weak-fields.explicit-institution", organization, valueOffset),
    );
  }
  if (location) {
    extractedEvidence.push(
      evidence(
        "location",
        "weak-fields.explicit-institution-location",
        location,
        valueOffset + fullValue.indexOf(parts[1]!),
      ),
    );
  }
  return { organization, location, evidence: extractedEvidence };
}
