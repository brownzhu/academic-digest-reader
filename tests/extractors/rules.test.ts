import { describe, expect, it } from "vitest";
import { classifyItem } from "../../src/classification/classify";
import { extractCompensation } from "../../src/extractors/compensation";
import { extractUrls } from "../../src/extractors/urls";
import { extractExplicitOrganizationAndLocation } from "../../src/extractors/weak-fields";
import { scoreRelevance } from "../../src/relevance/score";

describe("deterministic field rules", () => {
  it("applies category precedence", () => {
    expect(classifyItem("Postdoctoral position at a conference center", "").category).toBe("Postdoc");
    expect(classifyItem("Call for papers: workshop special issue", "").category).toBe("Call for Papers");
  });

  it("requires an explicit salary cue", () => {
    expect(extractCompensation("Salary: CAD $62,500 per year plus benefits").salary).toBe(
      "CAD $62,500 per year",
    );
    expect(extractCompensation("The book costs $59.00.").salary).toBeNull();
  });

  it("extracts only valid HTTP(S) URLs", () => {
    expect(extractUrls("See https://example.org/a, ftp://example.org/b and javascript:alert(1)")).toEqual([
      expect.objectContaining({ url: "https://example.org/a" }),
    ]);
  });

  it("rejoins conservative plain-text URL line wraps", () => {
    expect(extractUrls("Visit https://\nexample.org/path")[0]).toMatchObject({
      url: "https://example.org/path",
      evidence: { ruleId: "url.http-wrapped" },
    });
    expect(extractUrls("Visit https://example.org/long/\ncontinued-path")[0]?.url).toBe(
      "https://example.org/long/continued-path",
    );
  });

  it("does not emit a second partial URL from inside a wrapped redirect URL", () => {
    const urls = extractUrls(
      "https://urldefense.com/v3/__https://github.com/example/long-\npath__;token$",
    );
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatchObject({
      url: "https://github.com/example/long-path",
      evidence: { ruleId: "url.known-redirect" },
    });
  });

  it("keeps organization/location null without an explicit Institution field", () => {
    expect(
      extractExplicitOrganizationAndLocation(
        "Simon Fraser University's Department of Mathematics (Metro Vancouver) invites applications.",
      ),
    ).toMatchObject({ organization: null, location: null });
    expect(
      extractExplicitOrganizationAndLocation("Institution: Morgan State University, Baltimore, MD, USA"),
    ).toMatchObject({
      organization: "Morgan State University",
      location: "Baltimore, MD, USA",
    });
  });

  it("reports transparent keyword matches and a reproducible score", () => {
    const result = scoreRelevance("Inverse problems for PDEs using finite elements and SciML.");
    expect(result.matches.map((match) => match.keyword)).toEqual([
      "inverse problems",
      "PDE",
      "finite element",
      "scientific machine learning",
    ]);
    expect(result.score).toBe(14);
  });
});
