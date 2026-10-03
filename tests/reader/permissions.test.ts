// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fixture, PROJECT_ROOT } from "../helpers";

const contains = vi.fn(async () => false);
const request = vi.fn(async () => true);
const sendMessage = vi.fn(async () => ({
  ok: true as const,
  message: {
    source: "gmail-dom" as const,
    sourceUrl: "https://mail.google.com/mail/u/0/#inbox/test",
    subject: "NA Digest, V. 26, # 40",
    sender: "Editor Example",
    senderEmail: "editor@example.org",
    receivedDateText: "October 2, 2026",
    plainText: fixture("na-digest-synthetic-v26n40.txt"),
    links: [],
    extractionWarnings: [],
    extractionConfidence: 1,
    diagnostics: {
      selector: "[role='main'] .a3s",
      visibleCandidateCount: 1,
      selectedTextLength: 1,
      usedCandidateScoring: false,
    },
  },
}));

beforeAll(async () => {
  const html = readFileSync(resolve(PROJECT_ROOT, "sidepanel.html"), "utf8");
  document.documentElement.innerHTML = html
    .replace(/^<!doctype html>/i, "")
    .replace(/<link[^>]+rel="stylesheet"[^>]*>/i, "")
    .replace(/<script[\s\S]*?<\/script>/i, "");

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      runtime: { id: "test-extension", sendMessage },
      permissions: { contains, request },
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
        },
      },
    },
  });
  await import("../../src/reader/main");
});

describe("optional Gmail permission flow", () => {
  it("requests only Gmail access from a user click and then renders the current digest", async () => {
    expect(document.getElementById("status-title")?.textContent).toBe(
      "Allow access to the open Gmail message",
    );
    document.getElementById("retry-button")?.click();
    await vi.waitFor(() =>
      expect(document.getElementById("source-label")?.textContent).toBe("Current Gmail message"),
    );

    expect(request).toHaveBeenCalledWith({ origins: ["https://mail.google.com/*"] });
    expect(sendMessage).toHaveBeenCalledWith({ type: "extract-current-gmail-message" });
    expect(document.querySelectorAll(".item-card")).toHaveLength(17);
  });
});
