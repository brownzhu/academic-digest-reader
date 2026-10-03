import { describe, expect, it } from "vitest";
import { deadlineStatus, selectItems, type ReaderState } from "../../src/reader/state";
import { parseGoldenDigest } from "../helpers";

const digest = parseGoldenDigest();

function state(overrides: Partial<ReaderState> = {}): ReaderState {
  return { query: "", filter: "all", sort: "original", ...overrides };
}

describe("reader selection", () => {
  it("preserves all 17 items in original order by default", () => {
    const selected = selectItems(digest.items, state());
    expect(selected).toHaveLength(17);
    expect(selected.map((item) => item.originalIndex)).toEqual([...Array(17).keys()]);
  });

  it("searches title, body, category, and tags locally", () => {
    expect(selectItems(digest.items, state({ query: "CAD $62,500" }))).toHaveLength(1);
    expect(selectItems(digest.items, state({ query: "inverse problems" })).map((item) => item.originalIndex)).toEqual([
      5,
      12,
    ]);
    expect(selectItems(digest.items, state({ query: "journal / new issue" }))).toHaveLength(3);
  });

  it("applies primary, relevant, and grouped Other filters", () => {
    expect(selectItems(digest.items, state({ filter: "Postdoc" }))).toHaveLength(3);
    expect(selectItems(digest.items, state({ filter: "Faculty" }))).toHaveLength(2);
    expect(selectItems(digest.items, state({ filter: "relevant" })).length).toBeGreaterThan(0);
    expect(selectItems(digest.items, state({ filter: "other" })).map((item) => item.category)).toEqual([
      "Research / Open Problem",
      "Book",
      "Summer School",
      "Journal / New Issue",
      "Journal / New Issue",
      "Journal / New Issue",
    ]);
  });

  it("sorts relevance transparently and restores source order", () => {
    const relevant = selectItems(digest.items, state({ sort: "relevance" }));
    expect(relevant[0]?.relevance.score).toBeGreaterThanOrEqual(relevant[1]?.relevance.score ?? 0);
    expect(selectItems(relevant, state({ sort: "original" })).map((item) => item.originalIndex)).toEqual([
      ...Array(17).keys(),
    ]);
  });

  it("places missing deadlines after dated items", () => {
    const selected = selectItems(digest.items, state({ sort: "deadline" }));
    const firstMissing = selected.findIndex((item) => item.deadline === null);
    expect(firstMissing).toBeGreaterThan(0);
    expect(selected.slice(0, firstMissing).every((item) => item.deadline !== null)).toBe(true);
    expect(selected.slice(firstMissing).every((item) => item.deadline === null)).toBe(true);
  });
});

describe("deadline display", () => {
  const now = new Date(2026, 9, 3);

  it("uses local date-only arithmetic", () => {
    expect(deadlineStatus("2026-10-15", now)).toMatchObject({
      label: "12 days remaining",
      state: "soon",
      daysRemaining: 12,
    });
    expect(deadlineStatus("2026-10-03", now).state).toBe("today");
    expect(deadlineStatus("2026-10-02", now).state).toBe("expired");
    expect(deadlineStatus("2027-04-30", now).state).toBe("normal");
  });
});
