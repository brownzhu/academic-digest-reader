import { evidence } from "../domain/evidence";
import type { KeywordMatch } from "../domain/item";
import { escapeRegExp } from "../utils/text";
import {
  DEFAULT_KEYWORD_PROFILE,
  type KeywordDefinition,
} from "./default-profile";

export interface RelevanceResult {
  score: number;
  matches: KeywordMatch[];
}

function phrasePattern(phrase: string): RegExp {
  const escaped = phrase.split(/\s+/).map(escapeRegExp).join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu");
}

export function scoreRelevance(
  text: string,
  profile: readonly KeywordDefinition[] = DEFAULT_KEYWORD_PROFILE,
): RelevanceResult {
  const matches: KeywordMatch[] = [];
  const occupied: Array<[number, number]> = [];
  for (const definition of profile) {
    const aliases = [definition.keyword, ...(definition.aliases ?? [])];
    const occurrences = aliases
      .flatMap((alias) => [...text.matchAll(phrasePattern(alias))])
      .filter((match) => {
        const start = match.index;
        const end = start + match[0].length;
        return !occupied.some(([left, right]) => start < right && end > left);
      });
    if (occurrences.length === 0) continue;
    occupied.push(
      ...occurrences.map(
        (match) => [match.index, match.index + match[0].length] as [number, number],
      ),
    );
    matches.push({
      keyword: definition.keyword,
      weight: definition.weight,
      occurrences: occurrences.length,
      evidence: occurrences.map((match, index) =>
        evidence(
          `relevance.matches.${definition.keyword}[${index}]`,
          "relevance.keyword",
          match[0],
          match.index,
        ),
      ),
    });
  }

  return {
    score: matches.reduce((sum, match) => sum + match.weight * match.occurrences, 0),
    matches: matches.sort((a, b) => b.weight - a.weight || a.keyword.localeCompare(b.keyword)),
  };
}
