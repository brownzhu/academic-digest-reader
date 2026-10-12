// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { itemFlagKey } from "../../src/reader/item-flags";
import { createParserRegistry } from "../../src/parsers/supported-parsers";
import type { ExtractionResponse } from "../../src/runtime/messages";
import { fixture, PROJECT_ROOT } from "../helpers";

const contains = vi.fn(async () => false);
const request = vi.fn(async () => true);
const changeListeners: Array<(changes: Record<string, chrome.storage.StorageChange>, area: string) => void> = [];
const changeListener = (listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void) => { changeListeners.push(listener); };
const storageSet = vi.fn(async (_values: unknown) => undefined);
const sendMessage = vi.fn(async (): Promise<ExtractionResponse> => ({
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
        sync: { get: vi.fn(async () => ({})), set: storageSet },
        onChanged: { addListener: changeListener, removeListener: vi.fn() },
        local: {
          get: vi.fn(async () => ({})),
          set: storageSet,
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

  it("renders IPNet from the Gmail response and keeps named journal links on its card", async () => {
    sendMessage.mockResolvedValueOnce({
      ok: true,
      message: {
        source: "gmail-dom",
        sourceUrl: "https://mail.google.com/mail/u/0/#inbox/test",
        subject: "IPNet Digest, Volume 33, Number 9",
        sender: "Editor Example", senderEmail: "editor@example.org", receivedDateText: null,
        plainText: readFileSync(resolve(PROJECT_ROOT, "tests/fixtures/ipnet-digest/ipnet-synthetic-v33n9.txt"), "utf8"),
        links: [{ text: "A synthetic paper on inverse imaging", url: "https://example.org/paper/1" }],
        extractionWarnings: [], extractionConfidence: 1,
        diagnostics: { selector: ".a3s", visibleCandidateCount: 1, selectedTextLength: 100, usedCandidateScoring: false },
      },
    });
    document.getElementById("refresh-button")?.click();
    await vi.waitFor(() => expect(document.getElementById("newsletter-name")?.textContent).toBe("IPNet Digest"));
    expect(document.querySelectorAll(".item-card")).toHaveLength(5);
    expect(document.querySelector(".item-card h2")?.textContent).toBe("Conference advertising on IPNET");
    expect(document.getElementById("digest-notice-list")?.textContent).toContain("University Assistant");
    expect(document.querySelectorAll(".item-card")[4]?.querySelector(".primary-link")?.getAttribute("href")).toBe("https://example.org/paper/1");
  });


  it("shows unfamiliar newsletters as literal original text and clears stale parsed fields", async () => {
    const text = "Unknown newsletter\n<img src=x onerror=alert(1)>\nA second announcement with no reliable separators.";
    sendMessage.mockResolvedValueOnce({ ok: true, message: {
      source: "gmail-dom", sourceUrl: "https://mail.google.com/mail/u/0/#inbox/test",
      subject: "A different newsletter", sender: null, senderEmail: null, receivedDateText: null,
      plainText: text, links: [{ text: "Unsafe", url: "javascript:alert(1)" }, { text: "Read more", url: "https://example.org/news" }],
      extractionWarnings: [], extractionConfidence: 0.65,
      diagnostics: { selector: ".a3s", visibleCandidateCount: 1, selectedTextLength: text.length, usedCandidateScoring: false },
    } });
    document.getElementById("refresh-button")?.click();
    const original = document.getElementById("original-message-view")!;
    await vi.waitFor(() => expect(original.hidden).toBe(false));
    expect(original.querySelector("pre")?.textContent).toBe(text);
    expect(original.querySelector("img")).toBeNull();
    expect(original.querySelectorAll("a")).toHaveLength(1);
    expect(document.getElementById("digest-overview")?.hidden).toBe(true);
    expect(document.getElementById("item-list")?.hidden).toBe(true);
    expect(document.getElementById("issue-meta")?.textContent).toBe("");
    expect(document.getElementById("status-title")?.textContent).toBe("Original message view");
    expect(document.getElementById("refresh-feedback")?.dataset.state).toBe("success");
    expect(document.getElementById("refresh-feedback-detail")?.textContent).toContain("Original message loaded");

    document.getElementById("refresh-button")?.click();
    await vi.waitFor(() => expect(document.getElementById("newsletter-name")?.textContent).toBe("NA Digest"));
    expect(original.hidden).toBe(true);
    expect(original.textContent).toBe("");
    expect(document.querySelectorAll(".item-card")).toHaveLength(17);
  });

  it("routes Mailman digests through the same production reader", async () => {
    sendMessage.mockResolvedValueOnce({ ok: true, message: {
      source: "gmail-dom", sourceUrl: "https://mail.google.com/mail/u/0/#inbox/test",
      subject: "Example Research Digest, Vol 4, Issue 12", sender: null, senderEmail: null, receivedDateText: null,
      plainText: readFileSync(resolve(PROJECT_ROOT, "tests/fixtures/mailman-digest/mailman-synthetic.txt"), "utf8"),
      links: [], extractionWarnings: [], extractionConfidence: 0.65,
      diagnostics: { selector: ".a3s", visibleCandidateCount: 1, selectedTextLength: 100, usedCandidateScoring: false },
    } });
    document.getElementById("refresh-button")?.click();
    await vi.waitFor(() => expect(document.getElementById("newsletter-name")?.textContent).toBe("Example Research Digest"));
    expect(document.querySelectorAll(".item-card")).toHaveLength(3);
    expect(document.getElementById("original-message-view")?.hidden).toBe(true);
  });


  it("keeps flags unchanged and offers retry when local persistence fails", async () => {
    storageSet.mockRejectedValueOnce(new Error("quota exceeded"));
    const save = document.querySelector<HTMLButtonElement>(".flag-saved")!;
    expect(save.getAttribute("aria-pressed")).toBe("false");
    save.click();
    await vi.waitFor(() => expect(document.getElementById("action-feedback")?.hidden).toBe(false));
    expect(document.getElementById("action-feedback")?.textContent).toContain("Could not save");
    expect(save.getAttribute("aria-pressed")).toBe("false");
    expect(save.disabled).toBe(false);
  });


  it("updates cards and theme when another Chrome context changes synced preferences", () => {
    const digest = createParserRegistry().parse(readFileSync(resolve(PROJECT_ROOT, "tests/fixtures/mailman-digest/mailman-synthetic.txt"), "utf8"));
    const key = itemFlagKey(digest, digest.items[0]!);
    const listener = changeListeners[0]!;
    listener({ [key]: { newValue: { saved: true, read: true } }, displayMode: { newValue: "dark" } }, "sync");
    expect(document.querySelector(".flag-saved")?.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".flag-read")?.getAttribute("aria-pressed")).toBe("true");
    expect(document.documentElement.dataset.theme).toBe("dark");
    listener({ [key]: {}, displayMode: {} }, "sync");
    expect(document.querySelector(".flag-saved")?.getAttribute("aria-pressed")).toBe("false");
    expect(document.documentElement.dataset.theme).toBe("system");
    expect(document.getElementById("sync-status")?.textContent).toContain("Chrome Sync");
  });


  it("shows refresh progress, completion time/count and confirmation for unchanged mail", async () => {
    const result = await sendMessage();
    let complete!: (value: ExtractionResponse) => void;
    let started = false;
    sendMessage.mockImplementationOnce(() => {
      started = true;
      return new Promise<ExtractionResponse>(resolve => { complete = resolve; });
    });
    const button = document.getElementById("refresh-button") as HTMLButtonElement;
    const banner = document.getElementById("refresh-feedback")!;
    button.click();
    expect(banner.hidden).toBe(false);
    expect(banner.dataset.state).toBe("loading");
    expect(button.disabled).toBe(true);
    await vi.waitFor(() => expect(started).toBe(true));
    expect(document.getElementById("retry-button")?.hasAttribute("disabled")).toBe(true);
    complete(result);
    await vi.waitFor(() => expect(banner.dataset.state).toBe("success"));
    expect(document.getElementById("refresh-feedback-title")?.textContent).toBe("✓ Email refreshed");
    expect(document.getElementById("refresh-feedback-detail")?.textContent).toMatch(/\d{2}:\d{2}.*17 announcements loaded/);
    expect(button.disabled).toBe(false);
    expect(banner.getAttribute("aria-live")).toBe("polite");

    button.click();
    expect(banner.dataset.state).toBe("loading");
    await vi.waitFor(() => expect(banner.dataset.state).toBe("success"));
    expect(document.getElementById("refresh-feedback-detail")?.textContent).toContain("No changes since last read");
    if (!result.ok) throw new Error("Expected a successful fixture extraction");
    sendMessage.mockResolvedValueOnce({ ...result, message: { ...result.message, links: [{ text: "Updated link", url: "https://example.org/updated" }] } });
    button.click();
    await vi.waitFor(() => expect(banner.dataset.state).toBe("success"));
    expect(document.getElementById("refresh-feedback-detail")?.textContent).not.toContain("No changes since last read");
  });

  it("replaces the previous success notice on extraction and permission failures", async () => {
    const button = document.getElementById("refresh-button") as HTMLButtonElement;
    const banner = document.getElementById("refresh-feedback")!;
    sendMessage.mockResolvedValueOnce({ ok: false, error: { code: "no-message-body", message: "Open a message first.", diagnostics: [] } });
    button.click();
    await vi.waitFor(() => expect(banner.dataset.state).toBe("error"));
    expect(banner.textContent).toContain("Open a message first.");
    expect(banner.textContent).not.toContain("announcements loaded");
    expect(button.disabled).toBe(false);

    sendMessage.mockRejectedValueOnce(new Error("Background unavailable"));
    button.click();
    await vi.waitFor(() => expect(banner.dataset.state).toBe("error"));
    expect(banner.textContent).toContain("could not contact Gmail");
    expect(button.disabled).toBe(false);

    request.mockResolvedValueOnce(false);
    button.click();
    await vi.waitFor(() => expect(banner.textContent).toContain("Gmail access was not granted"));
    expect(banner.dataset.state).toBe("error");
    expect(button.disabled).toBe(false);

    request.mockRejectedValueOnce(new Error("Permission unavailable"));
    button.click();
    await vi.waitFor(() => expect(banner.textContent).toContain("Could not request Gmail access"));
    expect(banner.dataset.state).toBe("error");
    expect(button.disabled).toBe(false);
  });

});
