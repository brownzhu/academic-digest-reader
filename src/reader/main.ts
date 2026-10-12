import { FLAGS_PREFIX, hasChromeSync, isReadingFlags, isTheme, observeReadingData, readingStorageNotice } from "./reading-storage";
import { EMPTY_FLAGS, itemFlagKey, loadItemFlags, saveItemFlags, type ItemFlagMap } from "./item-flags";
import { extractUrls } from "../extractors/urls";
import { highlightText } from "./text-search";
import digestJson from "../../artifacts/na-digest-synthetic.normalized.json";
import type { Digest } from "../domain/digest";
import type { DigestItem, ExtractedDate } from "../domain/item";
import { createParserRegistry } from "../parsers/supported-parsers";
import type { ExtractedMessage } from "../extraction/types";
import type { ExtractionResponse } from "../runtime/messages";
import { applyDisplayMode, loadDisplayMode, saveDisplayMode } from "./settings";
import {
  deadlineStatus,
  nextDeadline,
  type WorkflowFilter,
  selectItems,
  type DisplayMode,
  type FilterValue,
  type ReaderState,
  type SortMode,
} from "./state";

const fixtureDigest = digestJson as unknown as Digest;
const GMAIL_ORIGIN_PATTERN = "https://mail.google.com/*";
let currentDigest = fixtureDigest;
const parser = createParserRegistry();
let itemFlags: ItemFlagMap = {};
let flagStorageAvailable = true;
const expandedItems = new Set<string>();
const state: ReaderState = { query: "", filter: "all", sort: "original" };

function requiredElement<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing required element #${id}`);
  return node as T;
}

const workflowSelect = requiredElement<HTMLSelectElement>("workflow-select");
const feedback = requiredElement<HTMLElement>("action-feedback");
const originalView = requiredElement<HTMLElement>("original-message-view");
const list = requiredElement<HTMLElement>("item-list");
const emptyState = requiredElement<HTMLElement>("empty-state");
const resultCount = requiredElement<HTMLElement>("result-count");
const searchInput = requiredElement<HTMLInputElement>("search-input");
const sortSelect = requiredElement<HTMLSelectElement>("sort-select");
const themeSelect = requiredElement<HTMLSelectElement>("theme-select");
const filterStrip = requiredElement<HTMLElement>("filter-strip");
const readerControls = requiredElement<HTMLElement>("reader-controls");
const digestOverview = requiredElement<HTMLElement>("digest-overview");
const overviewTotal = requiredElement<HTMLElement>("overview-total");
const overviewRelevant = requiredElement<HTMLElement>("overview-relevant");
const overviewDeadlines = requiredElement<HTMLElement>("overview-deadlines");
const digestNotice = requiredElement<HTMLDetailsElement>("digest-notice");
const digestNoticeSummary = requiredElement<HTMLElement>("digest-notice-summary");
const digestNoticeList = requiredElement<HTMLElement>("digest-notice-list");
const statusPanel = requiredElement<HTMLElement>("status-panel");
const statusTitle = requiredElement<HTMLElement>("status-title");
const statusMessage = requiredElement<HTMLElement>("status-message");
const statusActions = requiredElement<HTMLElement>("status-actions");
const diagnosticPreview = requiredElement<HTMLDetailsElement>("diagnostic-preview");
const diagnosticText = requiredElement<HTMLElement>("diagnostic-text");
const refreshFeedback = requiredElement<HTMLElement>("refresh-feedback");
let lastReadMessage: string | null = null;
const refreshButton = requiredElement<HTMLButtonElement>("refresh-button");
const retryButton = requiredElement<HTMLButtonElement>("retry-button");
const fixtureButton = requiredElement<HTMLButtonElement>("fixture-button");
const extensionRuntime = typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function showRefreshFeedback(status: "loading" | "success" | "error", title: string, detail: string): void {
  refreshFeedback.dataset.state = status;
  refreshFeedback.hidden = false;
  requiredElement("refresh-feedback-title").textContent = title;
  requiredElement("refresh-feedback-detail").textContent = detail;
}

function clearRefreshFeedback(): void {
  refreshFeedback.hidden = true;
  refreshFeedback.removeAttribute("data-state");
  requiredElement("refresh-feedback-title").textContent = "";
  requiredElement("refresh-feedback-detail").textContent = "";
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(year!, month! - 1, day!));
}

const DATE_LABELS: Record<ExtractedDate["kind"], string> = {
  "message-date": "Message date",
  "application-deadline": "Application deadline",
  "submission-deadline": "Submission deadline",
  "abstract-deadline": "Abstract deadline",
  "registration-deadline": "Registration deadline",
  "other-deadline": "Deadline",
  "event-start": "Event starts",
  "event-end": "Event ends",
  "application-open": "Applications open",
  "start-date": "Start date",
  unknown: "Detected date",
};

function addFact(container: HTMLElement, label: string, value: string, className = ""): void {
  const fact = node("div", `fact ${className}`.trim());
  fact.append(node("span", "fact-label", label), node("strong", "fact-value", value));
  container.append(fact);
}

function createExpandedContent(item: DigestItem): HTMLElement {
  const expanded = node("section", "expanded-content");
  expanded.id = `details-${item.id}`;
  expanded.hidden = !expandedItems.has(itemFlagKey(currentDigest, item));

  const details = node("dl", "metadata-list");
  const metadata: Array<[string, string | null]> = [
    ["Sender", item.sender],
    ["Email", item.senderEmail],
    ["Organization", item.organization],
    ["Location", item.location],
  ];
  for (const [label, value] of metadata) {
    if (!value) continue;
    details.append(node("dt", undefined, label), node("dd", undefined, value));
  }
  if (details.children.length > 0) expanded.append(details);

  if (item.dates.length > 0) {
    expanded.append(node("h3", undefined, "Detected dates"));
    const dateList = node("ul", "detail-list");
    for (const date of item.dates) {
      const entry = node("li");
      entry.append(
        node("span", "detail-label", DATE_LABELS[date.kind]),
        node("span", undefined, formatDate(date.iso)),
      );
      dateList.append(entry);
    }
    expanded.append(dateList);
  }

  if (item.urls.length > 0) {
    expanded.append(node("h3", undefined, "Links"));
    const linkList = node("ul", "link-list");
    for (const [index, entry] of item.urls.entries()) {
      const anchor = node("a", undefined, `Open link ${index + 1}`);
      anchor.href = entry.url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.setAttribute("aria-label", `Open link ${index + 1}: ${entry.url}`);
      const listItem = node("li");
      listItem.append(anchor, node("span", "link-host", new URL(entry.url).hostname));
      linkList.append(listItem);
    }
    expanded.append(linkList);
  }

  expanded.append(node("h3", undefined, "Original announcement"));
  expanded.append(node("pre", "original-text", item.originalBody));

  const diagnostic = node("details", "diagnostic-details");
  diagnostic.append(node("summary", undefined, "Extraction details"));
  const diagnosticList = node("ul", "diagnostic-list");
  diagnosticList.append(
    node("li", undefined, `Confidence: ${Math.round(item.extractionConfidence * 100)}%`),
    node("li", undefined, `Parser item ID: ${item.id}`),
    node("li", undefined, `Evidence records: ${item.evidence.length}`),
  );
  for (const warning of item.warnings) {
    diagnosticList.append(node("li", "diagnostic-warning", warning));
  }
  diagnostic.append(diagnosticList);
  expanded.append(diagnostic);
  return expanded;
}

function createCard(item: DigestItem): HTMLElement {
  const article = node("article", "item-card");
  article.dataset.category = item.category;
  const flagKey = itemFlagKey(currentDigest, item);
  const flags = itemFlags[flagKey] ?? EMPTY_FLAGS;
  article.dataset.read = String(flags.read);

  const heading = node("div", "card-heading");
  const titleBlock = node("div");
  titleBlock.append(node("p", "category-label", item.category), node("h2", undefined, item.title));
  heading.append(titleBlock, node("span", "item-index", String(item.originalIndex + 1).padStart(2, "0")));
  article.append(heading);

  if (item.organization || item.location) {
    article.append(
      node("p", "affiliation", [item.organization, item.location].filter(Boolean).join(" · ")),
    );
  }

  const facts = node("div", "fact-grid");
  const displayedDeadline = state.workflow === "due" ? nextDeadline(item) : item.deadline;
  if (displayedDeadline) {
    const status = deadlineStatus(displayedDeadline.iso);
    const deadlineFact = node("div", `fact deadline deadline-${status.state}`);
    deadlineFact.append(
      node("span", "fact-label", DATE_LABELS[displayedDeadline.kind]),
      node("strong", "fact-value", formatDate(displayedDeadline.iso)),
      node("span", "deadline-status", status.label),
    );
    facts.append(deadlineFact);
  }
  if (item.salary) addFact(facts, "Salary", item.salary);
  if (item.funding) addFact(facts, "Funding", item.funding);
  if (facts.children.length > 0) article.append(facts);

  if (item.relevance.matches.length > 0) {
    const matched = node("p", "matched-keywords");
    matched.append(
      node("span", undefined, `Matched ${item.relevance.matches.length}:`),
      document.createTextNode(` ${item.relevance.matches.map((match) => match.keyword).join(" · ")}`),
    );
    article.append(matched);
  }

  const expanded = createExpandedContent(item);
  const actions = node("div", "card-actions");
  const expandButton = node("button", "text-button", expanded.hidden ? "Expand" : "Collapse");
  expandButton.type = "button";
  expandButton.setAttribute("aria-controls", expanded.id);
  expandButton.setAttribute("aria-expanded", String(!expanded.hidden));
  expandButton.addEventListener("click", () => {
    const willOpen = expanded.hidden;
    expanded.hidden = !willOpen;
    if (willOpen) expandedItems.add(flagKey); else expandedItems.delete(flagKey);
    expandButton.textContent = willOpen ? "Collapse" : "Expand";
    expandButton.setAttribute("aria-expanded", String(willOpen));
  });
  actions.append(expandButton);

  for (const field of ["saved", "read"] as const) {
    const labels = field === "saved" ? ["Save", "Saved"] : ["Mark read", "Mark unread"];
    const button = node("button", `text-button flag-${field}`, labels[flags[field] ? 1 : 0]);
    button.type = "button";
    button.setAttribute("aria-pressed", String(flags[field]));
    button.disabled = !flagStorageAvailable;
    button.addEventListener("click", async () => {
      // Keep the other control disabled until persistence completes, so a rapid
      // second click cannot overwrite a just-saved flag with stale state.
      const flagButtons = actions.querySelectorAll<HTMLButtonElement>(".flag-saved, .flag-read");
      flagButtons.forEach(control => { control.disabled = true; });
      const updated = { ...(itemFlags[flagKey] ?? EMPTY_FLAGS), [field]: !(itemFlags[flagKey] ?? EMPTY_FLAGS)[field] };
      try {
        await saveItemFlags(flagKey, updated);
        itemFlags[flagKey] = updated;
        feedback.hidden = true;
        render();
      } catch {
        feedback.textContent = hasChromeSync() ? "Could not save to Chrome Sync storage. The previous mark is unchanged. Check storage limits or try again." : "Could not save the reading mark on this device. Please try again.";
        feedback.hidden = false;
        flagButtons.forEach(control => { control.disabled = false; });
      }
    });
    actions.append(button);
  }


  const primaryUrl = item.urls[0]?.url;
  if (primaryUrl) {
    const link = node("a", "primary-link", "Open link");
    link.href = primaryUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    actions.append(link);
  }

  article.append(actions, expanded);
  return article;
}

function render(): void {
  const selected = selectItems(currentDigest.items, state, item => itemFlags[itemFlagKey(currentDigest, item)] ?? EMPTY_FLAGS);
  list.replaceChildren(...selected.map(createCard));
  resultCount.textContent = `${selected.length} of ${currentDigest.items.length} items`;
  emptyState.hidden = selected.length > 0;
  emptyState.textContent = state.workflow === "due" ? "No matching deadlines in the next 30 days." : state.workflow === "saved" ? "No saved announcements match in this email." : "No announcements match the current filters.";
}

function renderOverview(digest: Digest, notices: readonly string[] = []): void {
  overviewTotal.textContent = String(digest.items.length);
  overviewRelevant.textContent = String(
    digest.items.filter((item) => item.relevance.score > 0).length,
  );
  overviewDeadlines.textContent = String(
    digest.items.filter(
      (item) => nextDeadline(item) !== null,
    ).length,
  );
  const uniqueNotices = [...new Set([...digest.warnings, ...notices])];
  digestNotice.hidden = uniqueNotices.length === 0;
  digestNotice.open = false;
  digestNoticeSummary.textContent = `${uniqueNotices.length} parsing notice${uniqueNotices.length === 1 ? "" : "s"}`;
  digestNoticeList.replaceChildren(...uniqueNotices.map((message) => node("li", undefined, message)));
}

function initializeHeader(digest: Digest, sourceLabel: string, note: string): void {
  requiredElement("source-label").textContent = sourceLabel;
  requiredElement("newsletter-name").textContent = digest.newsletterName;
  const parts = [
    digest.volume ? `Vol. ${digest.volume}` : null,
    digest.issue ? `Issue ${digest.issue}` : null,
    digest.publicationDate ? formatDate(digest.publicationDate.iso) : null,
  ].filter(Boolean);
  requiredElement("issue-meta").textContent = parts.join(" · ");
  requiredElement("stage-note").textContent = note;
}

function resetReaderControls(): void {
  state.query = "";
  state.filter = "all";
  state.sort = "original";
  state.workflow = "all";
  workflowSelect.value = "all";
  searchInput.value = "";
  sortSelect.value = "original";
  for (const candidate of filterStrip.querySelectorAll<HTMLButtonElement>("button[data-filter]")) {
    candidate.setAttribute("aria-pressed", String(candidate.dataset.filter === "all"));
  }
}

function showReader(): void {
  originalView.hidden = true;
  originalView.replaceChildren();
  statusPanel.hidden = true;
  statusPanel.removeAttribute("aria-busy");
  digestOverview.hidden = false;
  readerControls.hidden = false;
  list.hidden = false;
}

function showStatus(
  title: string,
  message: string,
  diagnostics: readonly string[] = [],
  loading = false,
): void {
  originalView.hidden = true;
  originalView.replaceChildren();
  retryButton.hidden = false;
  statusPanel.hidden = false;
  statusPanel.dataset.state = loading ? "loading" : "error";
  statusPanel.setAttribute("aria-busy", String(loading));
  statusTitle.textContent = title;
  statusMessage.textContent = message;
  statusActions.hidden = loading;
  diagnosticPreview.hidden = diagnostics.length === 0;
  diagnosticPreview.open = false;
  diagnosticText.textContent = diagnostics.join("\n\n");
  digestOverview.hidden = true;
  digestNotice.hidden = true;
  readerControls.hidden = true;
  list.hidden = true;
  emptyState.hidden = true;
}

function showOriginalMessage(message: ExtractedMessage): void {
  statusPanel.dataset.state = "original";
  retryButton.hidden = message.source === "pasted-text";
  requiredElement("source-label").textContent = message.source === "pasted-text" ? "Pasted newsletter" : "Current Gmail message";
  requiredElement("newsletter-name").textContent = message.subject ?? "Opened message";
  requiredElement("stage-note").textContent = "Original message · announcement parsing unavailable · content stays local";
  for (const warning of message.extractionWarnings) originalView.append(node("p", "diagnostic-warning", warning));
  originalView.append(node("h2", undefined, "Original message"));
  const searchLabel = node("label", "search-field");
  const search = node("input");
  search.type = "search";
  search.placeholder = "Find in this message…";
  search.setAttribute("aria-label", "Find in original message");
  searchLabel.append(search);
  const searchActions = node("div", "card-actions");
  const matchCount = node("span", "storage-note", "Enter text to find matches");
  matchCount.setAttribute("aria-live", "polite");
  const previous = node("button", "text-button", "Previous");
  const next = node("button", "text-button", "Next");
  previous.type = next.type = "button";
  previous.disabled = next.disabled = true;
  const originalText = node("pre", "original-text", message.plainText);
  let matches: HTMLElement[] = [];
  let active = -1;
  function selectMatch(direction: number): void {
    if (!matches.length) return;
    matches[active]?.removeAttribute("data-active");
    active = (active + direction + matches.length) % matches.length;
    matches[active]!.dataset.active = "true";
    matches[active]!.scrollIntoView?.({ block: "nearest" });
    matchCount.textContent = `${active + 1} of ${matches.length}${matches.length === 1000 ? "+" : ""} matches`;
  }
  search.addEventListener("input", () => {
    matches = highlightText(originalText, message.plainText, search.value);
    active = -1;
    previous.disabled = next.disabled = matches.length === 0;
    matchCount.textContent = search.value.trim() ? "No matches" : "Enter text to find matches";
    if (matches.length) selectMatch(1);
  });
  previous.addEventListener("click", () => selectMatch(-1));
  next.addEventListener("click", () => selectMatch(1));
  searchActions.append(previous, next, matchCount);
  originalView.append(searchLabel, searchActions, originalText);
  const links = node("ul", "link-list");
  for (const link of message.links) {
    try { if (!["http:", "https:"].includes(new URL(link.url).protocol)) continue; }
    catch { continue; }
    const anchor = node("a", undefined, link.text || link.url);
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    const li = node("li");
    li.append(anchor);
    links.append(li);
  }
  if (links.children.length) originalView.append(node("h2", undefined, "Message links"), links);
  originalView.hidden = false;
}

function useFixturePreview(): void {
  clearRefreshFeedback();
  currentDigest = fixtureDigest;
  resetReaderControls();
  initializeHeader(
    currentDigest,
    "Local fixture",
    `${currentDigest.items.length} announcements · Fixture preview`,
  );
  renderOverview(currentDigest);
  showReader();
  render();
}

function showPermissionPrompt(wasDenied = false): void {
  if (wasDenied) showRefreshFeedback("error", "Refresh not completed", "Gmail access was not granted. Allow access to try again.");
  refreshButton.disabled = false;
  refreshButton.textContent = "Allow Gmail access";
  retryButton.disabled = false;
  retryButton.textContent = "Allow Gmail access";
  showStatus(
    wasDenied ? "Gmail access was not granted" : "Allow access to the open Gmail message",
    "Click “Allow Gmail access”. Chrome will ask for permission limited to mail.google.com; email content remains local.",
  );
}

async function requestGmailAccessAndLoad(): Promise<void> {
  if (!extensionRuntime) {
    useFixturePreview();
    return;
  }

  refreshButton.disabled = true;
  retryButton.disabled = true;
  refreshButton.textContent = "Refreshing…";
  showRefreshFeedback("loading", "Refreshing email…", "Checking access to the current Gmail message.");
  try {
    // Keep the request as the first awaited browser operation so it remains
    // directly associated with the user's button click.
    const granted = await chrome.permissions.request({ origins: [GMAIL_ORIGIN_PATTERN] });
    if (!granted) {
      showPermissionPrompt(true);
      return;
    }
  } catch (error) {
    showRefreshFeedback("error", "Refresh failed", "Could not request Gmail access. Please try again.");
    showStatus(
      "Could not request Gmail access",
      "Reload this extension on chrome://extensions, then try again.",
      [error instanceof Error ? error.message : String(error)],
    );
    refreshButton.disabled = false;
    retryButton.disabled = false;
    refreshButton.textContent = "Allow Gmail access";
    retryButton.textContent = "Allow Gmail access";
    return;
  }

  retryButton.disabled = false;
  retryButton.textContent = "Retry current email";
  await loadCurrentGmailMessage();
}

async function initializeExtensionReader(): Promise<void> {
  const hasGmailAccess = await chrome.permissions.contains({
    origins: [GMAIL_ORIGIN_PATTERN],
  });
  if (hasGmailAccess) {
    await loadCurrentGmailMessage();
  } else {
    showPermissionPrompt();
  }
}

async function loadCurrentGmailMessage(): Promise<void> {
  if (!extensionRuntime) {
    useFixturePreview();
    return;
  }

  refreshButton.disabled = true;
  refreshButton.textContent = "Refreshing…";
  retryButton.disabled = true;
  showRefreshFeedback("loading", "Refreshing email…", "Reading the open Gmail message and updating the reader.");
  requiredElement("newsletter-name").textContent = "Academic Digest Reader";
  requiredElement("issue-meta").textContent = "";
  requiredElement("stage-note").textContent = "";
  showStatus("Reading current Gmail message…", "Email content remains local in this browser.", [], true);
  let response: ExtractionResponse;
  try {
    response = (await chrome.runtime.sendMessage({
      type: "extract-current-gmail-message",
    })) as ExtractionResponse;
  } catch (error) {
    showRefreshFeedback("error", "Refresh failed", "The reader could not contact Gmail. Please try again.");
    retryButton.disabled = false;
    showStatus(
      "Could not read Gmail",
      "Academic Digest Reader could not contact its background service.",
      [error instanceof Error ? error.message : String(error)],
    );
    refreshButton.disabled = false;
    refreshButton.textContent = "Read current email";
    return;
  }

  if (!response.ok) {
    showRefreshFeedback("error", "Refresh failed", response.error.message);
    retryButton.disabled = false;
    showStatus("Could not read this message", response.error.message, [
      ...response.error.diagnostics,
      ...(response.error.rawTextPreview ? [`Raw preview:\n${response.error.rawTextPreview}`] : []),
    ]);
    refreshButton.disabled = false;
    refreshButton.textContent = "Read current email";
    return;
  }

  const message = response.message;
  const contentSignature = JSON.stringify([message.subject, message.plainText, message.links]);
  const unchanged = lastReadMessage === contentSignature;
  const parsed = presentMessage(message);
  lastReadMessage = contentSignature;
  const completedAt = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(new Date());
  const result = parsed ? `${currentDigest.items.length} announcements loaded` : "Original message loaded; announcement parsing unavailable";
  showRefreshFeedback("success", "✓ Email refreshed", `${completedAt} · ${result}${unchanged ? " · No changes since last read." : "."}`);
  retryButton.disabled = false;
}

function presentMessage(extracted: ExtractedMessage): boolean {
  requiredElement("issue-meta").textContent = "";
  try {
    currentDigest = parser.parse(extracted.plainText, {
      originalSubject: extracted.subject,
      source: extracted.source,
      links: extracted.links,
    });
  } catch (error) {
    showStatus(
      "Original message view",
      "This format could not be split reliably into announcements. The full extracted message is shown below; no announcement fields have been inferred.",
      [
        error instanceof Error ? error.message : String(error),
        ...extracted.extractionWarnings,
        `Selector: ${extracted.diagnostics.selector}`,
        `Visible candidates: ${extracted.diagnostics.visibleCandidateCount}`,
        `Extracted characters: ${extracted.diagnostics.selectedTextLength}`,
        `Raw preview:\n${extracted.plainText.slice(0, 1200)}`,
      ],
    );
    showOriginalMessage(extracted);
    refreshButton.disabled = false;
    refreshButton.textContent = "Refresh email";
    return false;
  }

  resetReaderControls();
  initializeHeader(
    currentDigest,
    extracted.source === "pasted-text" ? "Pasted newsletter" : "Current Gmail message",
    `${currentDigest.items.length} announcements · Parsed locally from ${extracted.subject ?? "opened message"}`,
  );
  renderOverview(currentDigest, extracted.extractionWarnings);
  showReader();
  render();
  refreshButton.disabled = false;
  refreshButton.textContent = "Refresh email";
  return true;
}

const pastePanel = requiredElement<HTMLElement>("paste-panel");
const pasteToggle = requiredElement<HTMLButtonElement>("paste-toggle");
const pasteSubject = requiredElement<HTMLInputElement>("paste-subject");
const pasteBody = requiredElement<HTMLTextAreaElement>("paste-body");
const pasteError = requiredElement<HTMLElement>("paste-error");
function closePastePanel(): void {
  pastePanel.hidden = true;
  pasteToggle.setAttribute("aria-expanded", "false");
  pasteSubject.value = pasteBody.value = "";
  pasteError.hidden = true;
}
pasteToggle.addEventListener("click", () => {
  if (!pastePanel.hidden) { closePastePanel(); return; }
  pastePanel.hidden = false;
  pasteToggle.setAttribute("aria-expanded", "true");
  pasteBody.focus();
});
requiredElement("paste-cancel").addEventListener("click", closePastePanel);
requiredElement("paste-read").addEventListener("click", () => {
  const text = pasteBody.value.trim();
  if (!text || text.length > 1_000_000) {
    pasteError.textContent = text ? "Please paste less than 1 million characters at a time." : "Paste a message body first.";
    pasteError.hidden = false;
    return;
  }
  const subject = pasteSubject.value.trim() || null;
  closePastePanel();
  clearRefreshFeedback();
  presentMessage({
    source: "pasted-text", sourceUrl: "", subject,
    sender: null, senderEmail: null, receivedDateText: null, plainText: text,
    links: extractUrls(text).map(link => ({ text: link.url, url: link.url })),
    extractionWarnings: [], extractionConfidence: 1,
    diagnostics: { selector: "manual-paste", visibleCandidateCount: 1, selectedTextLength: text.length, usedCandidateScoring: false },
  });
});

searchInput.addEventListener("input", () => {
  state.query = searchInput.value;
  render();
});

workflowSelect.addEventListener("change", () => {
  state.workflow = workflowSelect.value as WorkflowFilter;
  if (state.workflow === "due") { state.sort = "deadline"; sortSelect.value = "deadline"; }
  render();
});
requiredElement("reset-filters").addEventListener("click", () => { resetReaderControls(); render(); });

sortSelect.addEventListener("change", () => {
  state.sort = sortSelect.value as SortMode;
  render();
});

filterStrip.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-filter]");
  if (!button) return;
  state.filter = button.dataset.filter as FilterValue;
  for (const candidate of filterStrip.querySelectorAll<HTMLButtonElement>("button[data-filter]")) {
    candidate.setAttribute("aria-pressed", String(candidate === button));
  }
  render();
});

themeSelect.addEventListener("change", async () => {
  const mode = themeSelect.value as DisplayMode;
  const previous = document.documentElement.dataset.theme as DisplayMode;
  themeSelect.disabled = true;
  try {
    await saveDisplayMode(mode);
    applyDisplayMode(mode);
    feedback.hidden = true;
  } catch {
    themeSelect.value = previous;
    feedback.textContent = "Could not save the theme. Your previous setting is unchanged; please try again.";
    feedback.hidden = false;
  } finally { themeSelect.disabled = false; }
});

refreshButton.addEventListener("click", () => {
  void requestGmailAccessAndLoad();
});

retryButton.addEventListener("click", () => {
  void requestGmailAccessAndLoad();
});

fixtureButton.addEventListener("click", useFixturePreview);

try { itemFlags = await loadItemFlags(); }
catch {
  flagStorageAvailable = false;
  feedback.textContent = "Reading marks could not be loaded or migrated. Existing data is preserved. Reopen the reader to retry; mark controls are disabled.";
  feedback.hidden = false;
}
requiredElement("sync-status").textContent = readingStorageNotice();
let initialTheme: DisplayMode = "system";
try { initialTheme = await loadDisplayMode(); }
catch {
  feedback.textContent = "Reading settings could not be loaded or migrated. Existing data is preserved. Reopen the reader to retry.";
  feedback.hidden = false;
}
observeReadingData(changes => {
  let flagsChanged = false;
  for (const [key, change] of Object.entries(changes)) {
    if (key.startsWith(FLAGS_PREFIX)) {
      if (isReadingFlags(change.newValue)) itemFlags[key] = { saved: change.newValue.saved, read: change.newValue.read };
      else if (change.newValue === undefined) delete itemFlags[key];
      else continue;
      flagsChanged = true;
    }
    if (key === "displayMode" && (isTheme(change.newValue) || change.newValue === undefined)) {
      const mode = change.newValue ?? "system";
      themeSelect.value = mode;
      applyDisplayMode(mode);
    }
  }
  if (flagsChanged && !list.hidden) render();
});
themeSelect.value = initialTheme;
applyDisplayMode(initialTheme);
refreshButton.hidden = !extensionRuntime;
useFixturePreview();
if (extensionRuntime) await initializeExtensionReader();
