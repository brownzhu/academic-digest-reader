// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { highlightText } from "../../src/reader/text-search";

describe("original message search", () => {
  it("matches literal text case-insensitively without executing HTML or regex", () => {
    const element = document.createElement("pre");
    const text = '<img src=x onerror="alert(1)"> A+B a+b 中文';
    const matches = highlightText(element, text, "a+b");
    expect(matches).toHaveLength(2);
    expect(element.textContent).toBe(text);
    expect(element.querySelector("img")).toBeNull();
    expect(highlightText(element, text, "中文")).toHaveLength(1);
    expect(highlightText(element, text, "[")).toHaveLength(0);
    expect(highlightText(element, text, "")).toHaveLength(0);
    expect(element.textContent).toBe(text);
  });
  it("bounds highlight node count while retaining all text in large messages", () => {
    const element = document.createElement("pre");
    const text = "a ".repeat(2000);
    expect(highlightText(element, text, "a")).toHaveLength(1000);
    expect(element.textContent).toBe(text);
  });
});
