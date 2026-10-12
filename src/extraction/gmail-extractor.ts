import type { ExtractedMessage } from "./types";

/**
 * This function is passed directly to chrome.scripting.executeScript(). Keep
 * every runtime helper inside the function: imported closures are unavailable
 * in the isolated page execution context.
 */
export function extractCurrentGmailMessage(): ExtractedMessage {
  const warnings: string[] = [];

  function visible(element: Element): element is HTMLElement {
    if (!(element instanceof HTMLElement)) return false;
    if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    return [...element.getClientRects()].some((rect) => rect.width > 0 && rect.height > 0);
  }

  function cleanText(value: string | null | undefined): string | null {
    const cleaned = value?.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
    return cleaned || null;
  }

  function bodyText(element: HTMLElement): string {
    return (element.innerText || element.textContent || "")
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim();
  }

  function cleanHref(rawHref: string): string | null {
    try {
      const url = new URL(rawHref, location.href);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      if (/^(?:www\.)?google\.[^/]+$/i.test(url.hostname) && url.pathname === "/url") {
        const target = url.searchParams.get("q") ?? url.searchParams.get("url");
        if (target) {
          const parsedTarget = new URL(target);
          if (parsedTarget.protocol === "http:" || parsedTarget.protocol === "https:") {
            return parsedTarget.toString();
          }
        }
      }
      return url.toString();
    } catch {
      return null;
    }
  }

  function firstVisible(selectors: readonly string[], root: ParentNode = document): HTMLElement | null {
    for (const selector of selectors) {
      for (const element of root.querySelectorAll(selector)) {
        if (visible(element)) return element;
      }
    }
    return null;
  }

  function scoreCandidate(element: HTMLElement, text: string): number {
    const rect = element.getBoundingClientRect();
    const viewportIntersection = Math.max(
      0,
      Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0),
    );
    let score = Math.min(30, text.length / 500);
    score += Math.min(40, viewportIntersection / 10);
    if (/NA Digest[\s\S]{0,100}Volume\s+\d+\s*:\s*Issue\s+\d+/i.test(text)) score += 120;
    if (/IPNet Digest[\s\S]{0,60}Volume\s+\d+\s*,\s*Number\s+\d+/i.test(text)) score += 120;
    if (/Today's Topics:/i.test(text)) score += 30;
    if (/^From[ \t]*:.+\n\s*Date[ \t]*:.+\n\s*Subject[ \t]*:/m.test(text)) score += 30;
    return score;
  }

  const selectorGroups = [
    "[role='main'] .a3s",
    "[data-message-id] .a3s",
    ".a3s.aiL",
    ".a3s",
  ] as const;
  const candidates: Array<{ element: HTMLElement; selector: string; text: string }> = [];
  const seen = new Set<Element>();
  for (const selector of selectorGroups) {
    for (const element of document.querySelectorAll(selector)) {
      if (seen.has(element) || !visible(element)) continue;
      seen.add(element);
      const text = bodyText(element);
      if (text.length < 40) continue;
      candidates.push({ element, selector, text });
    }
  }

  if (candidates.length === 0) {
    return {
      source: "gmail-dom",
      sourceUrl: location.href,
      subject: null,
      sender: null,
      senderEmail: null,
      receivedDateText: null,
      plainText: "",
      links: [],
      extractionWarnings: ["No visible Gmail message body matched the supported selectors."],
      extractionConfidence: 0,
      diagnostics: {
        selector: "none",
        visibleCandidateCount: 0,
        selectedTextLength: 0,
        usedCandidateScoring: false,
      },
    };
  }

  const usedCandidateScoring = candidates.length > 1;
  const selected =
    candidates.length === 1
      ? candidates[0]!
      : [...candidates].sort(
          (left, right) =>
            scoreCandidate(right.element, right.text) - scoreCandidate(left.element, left.text),
        )[0]!;
  if (usedCandidateScoring) {
    warnings.push(`Selected one of ${candidates.length} visible Gmail message bodies.`);
  }

  const messageContainer =
    selected.element.closest<HTMLElement>(".adn, [data-message-id], [role='listitem']") ??
    selected.element.parentElement;
  const subjectElement = firstVisible(
    ["h2.hP", "[data-thread-perm-id] h2", "h2[role='heading']"],
    document,
  );
  const senderElement = firstVisible([".gD[email]", "[email][name]", ".gD"], messageContainer ?? document);
  const dateElement = firstVisible([".g3[title]", ".g3"], messageContainer ?? document);
  const senderEmailRaw = senderElement?.getAttribute("email");
  const senderEmail =
    senderEmailRaw && /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(senderEmailRaw)
      ? senderEmailRaw
      : null;
  const links = [...selected.element.querySelectorAll<HTMLAnchorElement>("a[href]")]
    .map((anchor) => ({ text: cleanText(anchor.innerText) ?? "", url: cleanHref(anchor.href) }))
    .filter((entry): entry is { text: string; url: string } => entry.url !== null)
    .filter(
      (entry, index, all) => all.findIndex((candidate) => candidate.url === entry.url) === index,
    );

  const clipped = [...(messageContainer ?? selected.element).querySelectorAll<HTMLAnchorElement>("a[href]")]
    .some(anchor => {
      try {
        const url = new URL(anchor.href, location.href);
        return url.hostname === "mail.google.com" && url.searchParams.get("view") === "lg";
      } catch { return false; }
    });
  if (clipped) warnings.push("Gmail marks this message as clipped. Use Gmail’s ‘View entire message’ link to check the complete content; only the displayed body was read.");

  const structuralMatch =
    /(?:NA|IPNet) Digest/i.test(selected.text) &&
    /Today's Topics:/i.test(selected.text) &&
    /^From[ \t]*:.+\n\s*Date[ \t]*:.+\n\s*Subject[ \t]*:/m.test(selected.text);

  return {
    source: "gmail-dom",
    sourceUrl: location.href,
    subject: cleanText(subjectElement?.innerText),
    sender: cleanText(senderElement?.getAttribute("name") ?? senderElement?.innerText),
    senderEmail,
    receivedDateText: cleanText(dateElement?.getAttribute("title") ?? dateElement?.innerText),
    plainText: selected.text,
    links,
    extractionWarnings: warnings,
    extractionConfidence: structuralMatch ? (usedCandidateScoring ? 0.95 : 1) : 0.65,
    diagnostics: {
      selector: selected.selector,
      visibleCandidateCount: candidates.length,
      selectedTextLength: selected.text.length,
      usedCandidateScoring,
    },
  };
}
