import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createParserRegistry } from "../../src/parsers/supported-parsers";
import { normalizeText } from "../../src/utils/text";

const fixture = readFileSync(new URL("../fixtures/mailman-digest/mailman-synthetic.txt", import.meta.url), "utf8");
const golden = JSON.parse(readFileSync(new URL("../fixtures/mailman-digest/mailman-synthetic.golden.json", import.meta.url), "utf8"));
const registry = createParserRegistry();
const subject = "Example Research Digest, Vol 4, Issue 12";

describe("Mailman digest", () => {
  it("parses ordered numbered messages with reordered/folded headers and optional dates", () => {
    const result = registry.parse(fixture, { originalSubject: subject });
    expect(result).toMatchObject({ parserId: "mailman-digest", newsletterName: golden.newsletterName, volume: golden.volume, issue: golden.issue });
    expect(result.items.map(item => item.title)).toEqual(golden.titles);
    expect(result.items.map(item => item.category)).toEqual(golden.categories);
    expect(result.items.map(item => item.messageDate?.iso ?? null)).toEqual(["2026-10-07", "2026-10-07", null]);
    expect(result.items[1]?.senderEmail).toBe("blair@example.org");
    expect(result.items[2]?.warnings).toContain("No message Date header was supplied.");
    expect(result.items[0]?.deadline?.iso).toBe("2026-11-30");
    expect(result.items[1]?.deadline?.iso).toBe("2026-12-15");
    expect(result.items[2]?.originalBody).not.toContain("unsubscribe");
    expect(result.warnings).toEqual([]);
  });

  it("finds identity in the footer when there is no subject metadata", () => {
    const result = registry.parse(fixture);
    const normalized = normalizeText(fixture);
    for (const entry of result.evidence) expect(normalized.slice(entry.start, entry.end)).toBe(entry.sourceText);
    for (const item of result.items) {
      for (const entry of item.evidence.filter(e => e.field === "title" || e.field === "originalBody" || e.field === "senderEmail")) {
        expect(normalized.slice(entry.start, entry.end), entry.field).toBe(entry.sourceText);
      }
    }
  });

  it("handles CRLF, preserves uniquely identified links and rejects ambiguous repeated labels", () => {
    const result = registry.parse(fixture.replaceAll("\n", "\r\n"), { links: [
      { text: "Workshop website", url: "https://example.org/workshop" },
      { text: "Read more", url: "https://example.org/job" },
      { text: "Read more", url: "https://example.org/book" },
    ] });
    expect(result.items[0]?.urls.map(url => url.url)).toEqual(["https://example.org/workshop"]);
    expect(result.items[1]?.urls).toEqual([]);
    expect(result.items[2]?.urls).toEqual([]);
  });

  it("reports incomplete sections, missing numbers and clipping", () => {
    const broken = fixture.replace("Message: 2", "Message: 5").replace("From: Casey Example <casey@example.org>", "From: ").replace(/End of Example Research Digest[^\n]+/, "");
    const result = registry.parse(broken, { originalSubject: subject });
    expect(result.items).toHaveLength(2);
    expect(result.warnings.join(" ")).toContain("Expected message 2, found 5");
    expect(result.warnings.join(" ")).toContain("Message 3 has incomplete");
    expect(result.warnings.join(" ")).toContain("end marker is missing");
  });

  it("does not interpret an ordinary forwarded email or arbitrary numbered list as a digest", () => {
    expect(() => registry.parse("From: Someone\nSubject: A meeting\n\nMessage: 1\nHello")).toThrow();
    expect(() => registry.parse("Today's Topics:\n1. Something\nMessage: 1\nFrom: Someone\nSubject: Something\n\nHello", { originalSubject: subject })).toThrow();
    expect(() => registry.parse(fixture.replaceAll(/^From:/gm, "Missing-From:"), { originalSubject: subject })).toThrow();
  });
});
