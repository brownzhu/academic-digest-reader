import { extractCurrentGmailMessage } from "../extraction/gmail-extractor";
import type { ExtractionResponse } from "../runtime/messages";
import { isExtractCurrentMessageRequest } from "../runtime/messages";
import { classifyActiveTabUrl, isInjectionPermissionError } from "../runtime/tab-access";

async function configureSidePanel(): Promise<void> {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

async function extractFromActiveTab(): Promise<ExtractionResponse> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) {
    return {
      ok: false,
      error: {
        code: "no-active-tab",
        message: "Academic Digest Reader could not identify the active browser tab.",
        diagnostics: [],
      },
    };
  }
  if (classifyActiveTabUrl(tab.url) === "other") {
    return {
      ok: false,
      error: {
        code: "not-gmail",
        message: "Open a Gmail message, then click Academic Digest Reader again.",
        diagnostics: [tab.url ? `Active URL: ${tab.url}` : "The active tab URL was unavailable."],
      },
    };
  }

  try {
    const injection = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractCurrentGmailMessage,
    });
    const message = injection[0]?.result;
    if (!message || message.plainText.length === 0) {
      return {
        ok: false,
        error: {
          code: "no-message-body",
          message: "Academic Digest Reader could not confidently locate the current Gmail message body.",
          diagnostics: message
            ? [
                ...message.extractionWarnings,
                `Visible candidates: ${message.diagnostics.visibleCandidateCount}`,
              ]
            : ["The injected extractor returned no result."],
        },
      };
    }
    return { ok: true, message };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const permissionDenied = isInjectionPermissionError(detail);
    return {
      ok: false,
      error: {
        code: permissionDenied ? "permission-denied" : "script-failed",
        message: permissionDenied
          ? "Close the Side Panel, return to the Gmail message, and click the Academic Digest Reader toolbar icon to grant one-time access."
          : "Academic Digest Reader could not read the current Gmail page.",
        diagnostics: [detail],
      },
    };
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void configureSidePanel();
});

chrome.runtime.onStartup.addListener(() => {
  void configureSidePanel();
});

void configureSidePanel();

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isExtractCurrentMessageRequest(message)) return false;
  void extractFromActiveTab().then(sendResponse);
  return true;
});
