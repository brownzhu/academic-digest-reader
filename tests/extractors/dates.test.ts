import { describe, expect, it } from "vitest";
import {
  choosePrimaryDeadline,
  extractDates,
  parseEnglishDate,
} from "../../src/extractors/dates";

describe("English date extraction", () => {
  it.each([
    ["October 15, 2026", "2026-10-15"],
    ["15 October 2026", "2026-10-15"],
    ["Oct. 15, 2026", "2026-10-15"],
  ])("parses %s", (raw, expected) => {
    expect(parseEnglishDate(raw)).toBe(expected);
  });

  it("rejects ambiguous and invalid dates", () => {
    expect(parseEnglishDate("10/11/26")).toBeNull();
    expect(parseEnglishDate("February 30, 2026")).toBeNull();
  });

  it("distinguishes event ranges from explicit deadlines", () => {
    const text =
      "The conference will be held 10-12 February 2027. Registration deadline: 18 December 2026.";
    const dates = extractDates(text, "Example Conference");
    expect(dates.map((date) => [date.iso, date.kind])).toEqual([
      ["2027-02-10", "event-start"],
      ["2027-02-12", "event-end"],
      ["2026-12-18", "registration-deadline"],
    ]);
    expect(choosePrimaryDeadline(dates)?.iso).toBe("2026-12-18");
  });

  it("does not turn an uncued date into a deadline", () => {
    const dates = extractDates("The report was published October 2, 2026.", "Report");
    expect(choosePrimaryDeadline(dates)).toBeNull();
  });

  it("keeps hard-wrapped event context and labels application opening dates", () => {
    const eventDates = extractDates(
      "The meeting will be held at Ulm University,\nUlm, Germany, March 8-12, 2027.",
      "Annual Meeting",
    );
    expect(eventDates.map((date) => date.kind)).toEqual(["event-start", "event-end"]);
    expect(extractDates("Applications will open on October 1, 2026.", "Summer School")[0]?.kind).toBe(
      "application-open",
    );
  });

  it("extracts cross-month and repeated-month ranges without inventing years", () => {
    const dates = extractDates(
      "The summer school will be held from June 14 to June 25, 2027. Start: January 1-September 1, 2027, by agreement.",
      "Summer School",
    );
    expect(dates.map((date) => [date.iso, date.kind])).toEqual([
      ["2027-06-14", "event-start"],
      ["2027-06-25", "event-end"],
      ["2027-01-01", "start-date"],
      ["2027-09-01", "start-date"],
    ]);
  });
});
