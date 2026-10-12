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

describe("reading workflow filters", () => {
  it("combines saved/unread state with search and category", () => {
    const postdoc = digest.items.find(item => item.category === "Postdoc")!;
    const flags = (item: typeof postdoc) => ({ saved: item === postdoc, read: item === postdoc });
    expect(selectItems(digest.items, state({ workflow: "saved", filter: "Postdoc" }), flags)).toEqual([postdoc]);
    expect(selectItems(digest.items, state({ workflow: "saved", query: "nonexistent-word" }), flags)).toEqual([]);
    expect(selectItems(digest.items, state({ workflow: "unread" }), flags)).toHaveLength(16);
  });
  it("finds a future registration deadline even after the primary deadline expires", () => {
    const source = digest.items.find(item => item.deadline)!;
    const deadline = source.deadline!;
    const item = { ...source, deadline: { ...deadline, iso: "2026-10-01" }, dates: [
      { ...deadline, iso: "2026-10-01" },
      { ...deadline, iso: "2026-10-30", kind: "registration-deadline" as const },
    ] };
    const now = new Date(2026, 9, 7);
    expect(selectItems([item], state({ workflow: "due" }), undefined, now)).toEqual([item]);
    expect(selectItems([{ ...item, dates: [] }], state({ workflow: "due" }), undefined, now)).toEqual([]);
  });
  it("includes today and day 30, excludes expired and day 31", () => {
    const source = digest.items.find(item => item.deadline)!;
    const items = ["2026-10-06", "2026-10-07", "2026-11-06", "2026-11-07"].map(iso => ({
      ...source, deadline: { ...source.deadline!, iso }, dates: [],
    }));
    expect(selectItems(items, state({ workflow: "due", sort: "deadline" }), undefined, new Date(2026, 9, 7))).toEqual(items.slice(1, 3));
  });
});
