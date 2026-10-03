export interface ExtractedLink {
  text: string;
  url: string;
}

export interface ExtractedMessage {
  source: "gmail-dom";
  sourceUrl: string;
  subject: string | null;
  sender: string | null;
  senderEmail: string | null;
  receivedDateText: string | null;
  plainText: string;
  links: ExtractedLink[];
  extractionWarnings: string[];
  extractionConfidence: number;
  diagnostics: {
    selector: string;
    visibleCandidateCount: number;
    selectedTextLength: number;
    usedCandidateScoring: boolean;
  };
}

export interface ExtractionFailure {
  code:
    | "not-gmail"
    | "no-active-tab"
    | "no-message-body"
    | "permission-denied"
    | "script-failed"
    | "unsupported-message";
  message: string;
  diagnostics: string[];
  rawTextPreview?: string;
}
