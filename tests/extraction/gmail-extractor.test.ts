// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractCurrentGmailMessage } from "../../src/extraction/gmail-extractor";
import { NaDigestParser } from "../../src/parsers/na-digest-parser";
import { fixture } from "../helpers";

function rect(top = 20, height = 400): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    bottom: top + height,
    left: 0,
    right: 600,
    width: 600,
    height,
    toJSON: () => ({}),
  };
}

function installVisibleLayout(): void {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
    rect(),
  ] as unknown as DOMRectList);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect());
}

function mountMessage(text: string): HTMLElement {
  const main = document.createElement("main");
  main.setAttribute("role", "main");
  main.innerHTML = `
    <h2 class="hP">NA Digest, V. 26, # 40</h2>
    <div class="adn" data-message-id="message-1">
      <span class="gD" name="Editor Example" email="editor@example.org">Editor Example</span>
      <span class="g3" title="Fri, Oct 2, 2026, 14:28">14:28</span>
      <div class="a3s aiL"></div>
    </div>
  `;
  document.body.append(main);
  const body = main.querySelector<HTMLElement>(".a3s")!;
  Object.defineProperty(body, "innerText", { configurable: true, value: text });
  return body;
}

beforeEach(() => {
  document.body.replaceChildren();
  installVisibleLayout();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Gmail DOM extraction", () => {
  it("extracts one visible Gmail body and its message metadata", () => {
    const body = mountMessage(
      "NA Digest Friday, October 02, 2026 Volume 26 : Issue 40\nToday's Topics:\nA\n\nFrom: A a@example.org\nDate: October 1, 2026\nSubject: A\n\nBody text",
    );
    const anchor = document.createElement("a");
    anchor.href = "https://www.google.com/url?q=https%3A%2F%2Fexample.org%2Fpaper";
    anchor.innerText = "paper";
    body.append(anchor);

    const result = extractCurrentGmailMessage();
    expect(result).toMatchObject({
      subject: "NA Digest, V. 26, # 40",
      sender: "Editor Example",
      senderEmail: "editor@example.org",
      receivedDateText: "Fri, Oct 2, 2026, 14:28",
      extractionConfidence: 1,
      diagnostics: {
        selector: "[role='main'] .a3s",
        visibleCandidateCount: 1,
        usedCandidateScoring: false,
      },
    });
    expect(result.links).toEqual([{ text: "paper", url: "https://example.org/paper" }]);
  });

  it("uses scoring only when multiple visible message bodies exist", () => {
    mountMessage("A regular short email with enough text to be considered a visible Gmail message body.");
    const digestBody = document.createElement("div");
    digestBody.className = "a3s aiL";
    Object.defineProperty(digestBody, "innerText", {
      configurable: true,
      value:
        "NA Digest Friday, October 02, 2026 Volume 26 : Issue 40\nToday's Topics:\nA\nFrom: A a@example.org\nDate: October 1, 2026\nSubject: A",
    });
    document.querySelector("[role='main']")!.append(digestBody);

    const result = extractCurrentGmailMessage();
    expect(result.plainText).toContain("NA Digest Friday");
    expect(result.diagnostics).toMatchObject({
      visibleCandidateCount: 2,
      usedCandidateScoring: true,
    });
    expect(result.extractionWarnings[0]).toContain("Selected one of 2");
  });

  it("ignores hidden bodies and fails safely when none are visible", () => {
    const body = mountMessage("A sufficiently long message body that is hidden and must not be selected.");
    body.style.display = "none";
    const result = extractCurrentGmailMessage();
    expect(result.plainText).toBe("");
    expect(result.extractionConfidence).toBe(0);
    expect(result.diagnostics.visibleCandidateCount).toBe(0);
  });

  it("feeds the real Gmail-copied NA Digest into the existing parser", () => {
    mountMessage(fixture("na-digest-synthetic-v26n40.txt"));
    const extracted = extractCurrentGmailMessage();
    const digest = new NaDigestParser().parse(extracted.plainText, {
      originalSubject: extracted.subject,
      source: extracted.source,
    });
    expect(extracted.extractionConfidence).toBe(1);
    expect(digest.items).toHaveLength(17);
    expect(digest.warnings).toEqual([]);
  });
});
