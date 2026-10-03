import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { DigestItem } from "../../src/domain/item";
import { NaDigestParser } from "../../src/parsers/na-digest-parser";
import { ParserRegistry } from "../../src/parsers/parser-registry";
import { fixture, parseGoldenDigest, PROJECT_ROOT } from "../helpers";

interface GoldenManifest {
  newsletterName: string;
  volume: string;
  issue: string;
  publicationDate: string;
  editor: string;
  itemCount: number;
  titles: string[];
}

const golden = JSON.parse(
  readFileSync(
    resolve(PROJECT_ROOT, "tests/fixtures/na-digest/na-digest-synthetic-v26n40.golden.json"),
    "utf8",
  ),
) as GoldenManifest;

function byTitle(items: readonly DigestItem[], prefix: string): DigestItem {
  const item = items.find((candidate) => candidate.title.startsWith(prefix));
  if (!item) throw new Error(`Missing item starting with ${prefix}`);
  return item;
}

describe("NaDigestParser golden fixture", () => {
  it("matches all 17 manually verified topics exactly once and in source order", () => {
    const digest = parseGoldenDigest();
    expect(digest.newsletterName).toBe(golden.newsletterName);
    expect(digest.volume).toBe(golden.volume);
    expect(digest.issue).toBe(golden.issue);
    expect(digest.publicationDate?.iso).toBe(golden.publicationDate);
    expect(digest.editor).toBe(golden.editor);
    expect(digest.items).toHaveLength(golden.itemCount);
    expect(digest.topics).toHaveLength(golden.itemCount);
    expect(digest.items.map((item) => item.title)).toEqual(golden.titles);
    expect(new Set(digest.items.map((item) => item.id)).size).toBe(golden.itemCount);
    expect(digest.warnings).toEqual([]);
  });

  it("does not turn the table of contents or digest footer into items", () => {
    const digest = parseGoldenDigest();
    expect(digest.items.some((item) => item.title === "Today's Topics")).toBe(false);
    expect(digest.items.some((item) => /End of Digest/i.test(item.title))).toBe(false);
    expect(digest.items.every((item) => item.originalBody.length > 0)).toBe(true);
  });

  it("classifies the representative announcement types deterministically", () => {
    const { items } = parseGoldenDigest();
    expect(byTitle(items, "Open problems").category).toBe("Research / Open Problem");
    expect(byTitle(items, "Announcing the release").category).toBe("Software");
    expect(byTitle(items, "PDE Lab").category).toBe("Software");
    expect(byTitle(items, "New Book").category).toBe("Book");
    expect(byTitle(items, "Call for submissions").category).toBe("Call for Papers");
    expect(byTitle(items, "Mathematics and Image Analysis").category).toBe("Conference");
    expect(byTitle(items, "Call for Applications").category).toBe("Summer School");
    expect(byTitle(items, "PhD position").category).toBe("PhD");
    expect(byTitle(items, "Postdoc: SciML").category).toBe("Postdoc");
    expect(byTitle(items, "Tenure Track").category).toBe("Faculty");
    expect(byTitle(items, "Contents, Applied Mathematics").category).toBe("Journal / New Issue");
    expect(byTitle(items, "Call for papers").category).toBe("Call for Papers");
  });

  it("extracts explicit deadlines, salary, funding, and URLs without guessing weak fields", () => {
    const { items } = parseGoldenDigest();
    const mia = byTitle(items, "Mathematics and Image Analysis");
    expect(mia.deadline).toMatchObject({ iso: "2026-12-18", kind: "registration-deadline" });

    const summerSchool = byTitle(items, "Call for Applications");
    expect(summerSchool.deadline).toMatchObject({ iso: "2027-01-08", kind: "application-deadline" });
    expect(summerSchool.funding).toBe("travel and accommodation support for all selected participants");

    const sfu = byTitle(items, "Postdoc: SciML");
    expect(sfu.deadline).toMatchObject({ iso: "2026-11-15", kind: "application-deadline" });
    expect(sfu.salary).toBe("CAD $62,500 per year");
    expect(sfu.organization).toBeNull();
    expect(sfu.location).toBeNull();
    expect(sfu.urls.some((url) => url.url === "https://example.org/jobs/sciml-weather")).toBe(true);

    const kth = byTitle(items, "Tenure-track Assistant");
    expect(kth.deadline).toMatchObject({ iso: "2026-10-15", kind: "application-deadline" });
    expect(kth.senderEmail).toBeNull();
    expect(kth.warnings.some((warning) => warning.includes("not syntactically valid"))).toBe(true);

    const acom = byTitle(items, "Call for papers");
    expect(acom.deadline).toMatchObject({ iso: "2027-04-30", kind: "submission-deadline" });
  });

  it("keeps relevance numerical internally and exposes the actual matched keywords", () => {
    const { items } = parseGoldenDigest();
    const mia = byTitle(items, "Mathematics and Image Analysis");
    const keywords = mia.relevance.matches.map((match) => match.keyword);
    expect(mia.relevance.score).toBeGreaterThan(0);
    expect(keywords).toContain("inverse problems");
    expect(keywords).toContain("imaging");
    expect(keywords).toContain("PDE");
    expect(mia.tags).toEqual(keywords);
  });

  it("attaches evidence to every populated extracted field", () => {
    const { items } = parseGoldenDigest();
    for (const item of items) {
      for (const field of ["title", "category", "sender", "messageDate", "originalBody"]) {
        expect(item.evidence.some((entry) => entry.field === field), `${item.title}: ${field}`).toBe(true);
      }
      if (item.senderEmail) {
        expect(item.evidence.some((entry) => entry.field === "senderEmail")).toBe(true);
      }
      if (item.salary) expect(item.evidence.some((entry) => entry.field === "salary")).toBe(true);
      if (item.funding) expect(item.evidence.some((entry) => entry.field === "funding")).toBe(true);
      for (const date of item.dates) expect(date.evidence.sourceText.length).toBeGreaterThan(0);
      for (const url of item.urls) expect(url.evidence.sourceText.length).toBeGreaterThan(0);
      for (const match of item.relevance.matches) expect(match.evidence.length).toBe(match.occurrences);
    }
  });
});

describe("NA-only parser registry", () => {
  const registry = new ParserRegistry([new NaDigestParser()]);

  it("accepts the privacy-safe synthetic NA Digest fixture", () => {
    expect(registry.parse(fixture("na-digest-synthetic-v26n40.txt")).items).toHaveLength(17);
  });

  it("rejects unrelated or unsupported digests instead of applying a generic fallback", () => {
    expect(() => registry.parse("Today's Topics:\n1. Something else")).toThrow(
      "No supported digest parser matched confidently.",
    );
  });

  it("fails clearly on a recognizable but malformed NA Digest", () => {
    const malformed = "NA Digest Friday, October 02, 2026 Volume 26 : Issue 40\nToday's Topics:\nA";
    expect(() => new NaDigestParser().parse(malformed)).toThrow(
      "No NA Digest entries with From/Date/Subject headers were found.",
    );
  });
});

describe("NA Digest transport wrapping", () => {
  it("rejoins wrapped table-of-contents and Subject lines only when they agree", () => {
    const wrapped = `NA Digest Friday, October 02, 2026 Volume 26 : Issue 39

Today's Topics:

Conference on Applied Mathematics, 9-11
November 2026
Short second item

Submissions, questions, etc. should be sent to editor@example.org.

------------------------------ -------------------------

From: Alice Example <alice@example.org>
Date: October 1, 2026
Subject: Conference on Applied Mathematics, 9-11
November 2026

The meeting will take place in November.

-------------------------------------------------------

From: Bob Example <bob@example.org>,
Coauthor Example <coauthor@example.org>
Date: October 2, 2026
Subject: Short second item

This is the second announcement.

-------------------------------------------------------`;

    const digest = new NaDigestParser().parse(wrapped, { source: "gmail-dom" });
    expect(digest.items.map((item) => item.title)).toEqual([
      "Conference on Applied Mathematics, 9-11 November 2026",
      "Short second item",
    ]);
    expect(digest.topics).toEqual(digest.items.map((item) => item.title));
    expect(digest.warnings).toEqual([]);
    expect(digest.items[1]?.senderEmail).toBe("bob@example.org");
    expect(digest.items[1]?.sender).toBe("Bob Example, Coauthor Example");
    const titleEvidence = digest.items[0]!.evidence.find((entry) => entry.field === "title");
    expect(titleEvidence?.sourceText).toBe(
      "Conference on Applied Mathematics, 9-11\nNovember 2026",
    );
  });
});
