import { describe, expect, it } from "vitest";
import { isExtractCurrentMessageRequest } from "../../src/runtime/messages";
import { classifyActiveTabUrl, isInjectionPermissionError } from "../../src/runtime/tab-access";

describe("extension messages", () => {
  it("accepts only the supported extraction request", () => {
    expect(isExtractCurrentMessageRequest({ type: "extract-current-gmail-message" })).toBe(true);
    expect(isExtractCurrentMessageRequest({ type: "extract-generic-message" })).toBe(false);
    expect(isExtractCurrentMessageRequest(null)).toBe(false);
  });
});

describe("active tab access", () => {
  it("does not mistake an unavailable activeTab URL for a non-Gmail page", () => {
    expect(classifyActiveTabUrl(undefined)).toBe("unknown");
    expect(classifyActiveTabUrl("https://mail.google.com/mail/u/0/#inbox/abc")).toBe("gmail");
    expect(classifyActiveTabUrl("https://example.com/mail.google.com/")).toBe("other");
    expect(classifyActiveTabUrl("chrome://extensions")).toBe("other");
  });

  it("recognizes Chrome injection permission failures", () => {
    expect(isInjectionPermissionError("Cannot access contents of the page. Extension manifest must request permission.")).toBe(true);
    expect(isInjectionPermissionError("Unexpected execution failure")).toBe(false);
  });
});
