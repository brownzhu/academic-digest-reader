import digestJson from "../../artifacts/na-digest-synthetic.normalized.json";
import type { Digest } from "../domain/digest";
import type { DigestItem, ExtractedDate } from "../domain/item";
import { NaDigestParser } from "../parsers/na-digest-parser";
import type { ExtractionResponse } from "../runtime/messages";
import { applyDisplayMode, loadDisplayMode, saveDisplayMode } from "./settings";
import {
  deadlineStatus,
  selectItems,
  type DisplayMode,
  type FilterValue,
  type ReaderState,
  type SortMode,
} from "./state";

const fixtureDigest = digestJson as unknown as Digest;
const GMAIL_ORIGIN_PATTERN = "https://mail.google.com/*";
let currentDigest = fixtureDigest;
const parser = new NaDigestParser();
const state: ReaderState = { query: "", filter: "all", sort: "original" };

function requiredElement<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing required element #${id}`);
  return node as T;
}

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
  expanded.hidden = true;

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
  if (item.deadline) {
    const status = deadlineStatus(item.deadline.iso);
    const deadlineFact = node("div", `fact deadline deadline-${status.state}`);
    deadlineFact.append(
      node("span", "fact-label", DATE_LABELS[item.deadline.kind]),
      node("strong", "fact-value", formatDate(item.deadline.iso)),
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
  const expandButton = node("button", "text-button", "Expand");
  expandButton.type = "button";
  expandButton.setAttribute("aria-controls", expanded.id);
  expandButton.setAttribute("aria-expanded", "false");
  expandButton.addEventListener("click", () => {
    const willOpen = expanded.hidden;
    expanded.hidden = !willOpen;
    expandButton.textContent = willOpen ? "Collapse" : "Expand";
    expandButton.setAttribute("aria-expanded", String(willOpen));
  });
  actions.append(expandButton);

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
  const selected = selectItems(currentDigest.items, state);
  list.replaceChildren(...selected.map(createCard));
  resultCount.textContent = `${selected.length} of ${currentDigest.items.length} items`;
  emptyState.hidden = selected.length > 0;
}

function renderOverview(digest: Digest, notices: readonly string[] = []): void {
  overviewTotal.textContent = String(digest.items.length);
  overviewRelevant.textContent = String(
    digest.items.filter((item) => item.relevance.score > 0).length,
  );
  overviewDeadlines.textContent = String(
    digest.items.filter(
      (item) => item.deadline && deadlineStatus(item.deadline.iso).daysRemaining >= 0,
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
  searchInput.value = "";
  sortSelect.value = "original";
  for (const candidate of filterStrip.querySelectorAll<HTMLButtonElement>("button[data-filter]")) {
    candidate.setAttribute("aria-pressed", String(candidate.dataset.filter === "all"));
  }
}

function showReader(): void {
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

function useFixturePreview(): void {
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
  try {
    // Keep the request as the first awaited browser operation so it remains
    // directly associated with the user's button click.
    const granted = await chrome.permissions.request({ origins: [GMAIL_ORIGIN_PATTERN] });
    if (!granted) {
      showPermissionPrompt(true);
      return;
    }
  } catch (error) {
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
  refreshButton.textContent = "Reading…";
  showStatus("Reading current Gmail message…", "Email content remains local in this browser.", [], true);
  let response: ExtractionResponse;
  try {
    response = (await chrome.runtime.sendMessage({
      type: "extract-current-gmail-message",
    })) as ExtractionResponse;
  } catch (error) {
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
    showStatus("Could not read this message", response.error.message, [
      ...response.error.diagnostics,
      ...(response.error.rawTextPreview ? [`Raw preview:\n${response.error.rawTextPreview}`] : []),
    ]);
    refreshButton.disabled = false;
    refreshButton.textContent = "Read current email";
    return;
  }

  const extracted = response.message;
  try {
    currentDigest = parser.parse(extracted.plainText, {
      originalSubject: extracted.subject,
      source: extracted.source,
    });
  } catch (error) {
    showStatus(
      "Could not parse this message",
      "The Gmail body was extracted, but it did not match the supported NA Digest structure.",
      [
        error instanceof Error ? error.message : String(error),
        ...extracted.extractionWarnings,
        `Selector: ${extracted.diagnostics.selector}`,
        `Visible candidates: ${extracted.diagnostics.visibleCandidateCount}`,
        `Extracted characters: ${extracted.diagnostics.selectedTextLength}`,
        `Raw preview:\n${extracted.plainText.slice(0, 1200)}`,
      ],
    );
    refreshButton.disabled = false;
    refreshButton.textContent = "Read current email";
    return;
  }

  resetReaderControls();
  initializeHeader(
    currentDigest,
    "Current Gmail message",
    `${currentDigest.items.length} announcements · Parsed locally from ${extracted.subject ?? "opened message"}`,
  );
  renderOverview(currentDigest, extracted.extractionWarnings);
  showReader();
  render();
  refreshButton.disabled = false;
  refreshButton.textContent = "Refresh email";
}

searchInput.addEventListener("input", () => {
  state.query = searchInput.value;
  render();
});

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

themeSelect.addEventListener("change", () => {
  const mode = themeSelect.value as DisplayMode;
  applyDisplayMode(mode);
  void saveDisplayMode(mode);
});

refreshButton.addEventListener("click", () => {
  void requestGmailAccessAndLoad();
});

retryButton.addEventListener("click", () => {
  void requestGmailAccessAndLoad();
});

fixtureButton.addEventListener("click", useFixturePreview);

const initialTheme = await loadDisplayMode();
themeSelect.value = initialTheme;
applyDisplayMode(initialTheme);
refreshButton.hidden = !extensionRuntime;
useFixturePreview();
if (extensionRuntime) await initializeExtensionReader();
