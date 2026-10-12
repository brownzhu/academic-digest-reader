import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IpnetDigestParser } from "../../src/parsers/ipnet-digest-parser";
import { NaDigestParser } from "../../src/parsers/na-digest-parser";
import { ParserRegistry } from "../../src/parsers/parser-registry";
import { normalizeText } from "../../src/utils/text";

const fixture = readFileSync(new URL("../fixtures/ipnet-digest/ipnet-synthetic-v33n9.txt", import.meta.url), "utf8");
const golden = JSON.parse(readFileSync(new URL("../fixtures/ipnet-digest/ipnet-synthetic-v33n9.golden.json", import.meta.url), "utf8"));
const parser = new IpnetDigestParser();
const registry = new ParserRegistry([new NaDigestParser(), parser]);

describe("IPNet Digest", () => {
  it("selects IPNet and keeps all five announcements in source order, using actual subjects", () => {
    const digest = registry.parse(fixture);
    expect(digest).toMatchObject({ newsletterName: golden.newsletterName, volume: golden.volume, issue: golden.issue, editor: golden.editor });
    expect(digest.publicationDate?.iso).toBe(golden.publicationDate);
    expect(digest.items.map(item => item.title)).toEqual(golden.titles);
    expect(digest.items[0]?.category).toBe("Conference");
    expect(digest.items[4]?.category).toBe("Journal / New Issue");
    expect(digest.items[4]?.originalBody).not.toContain("::::");
    expect(digest.warnings).toHaveLength(2);
    expect(digest.warnings[0]).toContain("University Assistant");
    expect(digest.warnings[0]).toContain("Conference advertising");
    expect(digest.items.map(item => item.messageDate?.iso)).toEqual(["2026-10-05", "2026-09-27", "2026-10-02", "2026-09-24", "2026-09-14"]);
    expect(digest.items[0]?.deadline?.iso).toBe("2026-11-30");
    expect(digest.items[1]?.dates.filter(date => date.kind.endsWith("deadline")).map(date => date.kind)).toEqual([
      "abstract-deadline", "other-deadline", "application-deadline", "registration-deadline", "registration-deadline",
    ]);
  });

  it("keeps exact normalized source spans for all digest and header evidence", () => {
    const normalized = normalizeText(fixture);
    const digest = parser.parse(fixture);
    for (const entry of [...digest.evidence, ...digest.items.flatMap(item => item.evidence.filter(e => e.ruleId.startsWith("header.") || e.field === "originalBody"))]) {
      expect(normalized.slice(entry.start, entry.end), entry.field).toBe(entry.sourceText);
    }
  });

  it("retains named HTML paper links only on their matching announcement, with evidence", () => {
    const digest = registry.parse(fixture, { links: [
      { text: "A synthetic paper on inverse imaging", url: "https://example.org/paper/1" },
      { text: "A synthetic paper on stable reconstruction", url: "javascript:alert(1)" },
      { text: "absent text", url: "https://example.org/unrelated" },
    ] });
    expect(digest.items[4]?.urls).toHaveLength(1);
    expect(digest.items[4]?.urls[0]).toMatchObject({ url: "https://example.org/paper/1", evidence: { ruleId: "url.html-anchor", sourceText: "A synthetic paper on inverse imaging" } });
    expect(digest.items[0]?.urls.map(url => url.url)).toEqual(["https://example.org/imaging"]);
  });

  it("supports NBSP, CRLF, plain dot rules and folded Subject headers", () => {
    const wrapped = fixture.replaceAll("………………………………………………………", ".".repeat(50))
      .replaceAll("Applied Mathematics Congress, 12–16 July 2027", "Applied Mathematics Congress,\n12–16 July 2027")
      .replaceAll(" ", "\u00a0").replaceAll("\n", "\r\n");
    expect(parser.parse(wrapped).items.map(item => item.title)).toEqual(golden.titles);
  });

  it("warns on truncated and malformed sections instead of silently dropping them", () => {
    expect(parser.parse(fixture.replace(/:{5,}end:{5,}/, "")).warnings.join(" ")).toContain("may be clipped");
    const malformed = fixture.replace("Subject:  Conference advertising on IPNET", "Missing subject");
    const result = parser.parse(malformed);
    expect(result.items).toHaveLength(4);
    expect(result.warnings.join(" ")).toContain("incomplete From/Date/Subject");
    expect(() => parser.parse("IPNet Digest Volume 33, Number 9 7 October 2026\nToday's Topics:\nNothing")).toThrow("No IPNet Digest entries");
    expect(() => registry.parse("Other Digest\nToday's Topics:\nFrom: Someone\nDate: Today\nSubject: Anything")).toThrow("No supported digest parser");
  });
});
