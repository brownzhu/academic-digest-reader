import type { ExtractedMessage, ExtractionFailure } from "../extraction/types";

export interface ExtractCurrentMessageRequest {
  type: "extract-current-gmail-message";
}

export type ExtractionResponse =
  | { ok: true; message: ExtractedMessage }
  | { ok: false; error: ExtractionFailure };

export function isExtractCurrentMessageRequest(
  value: unknown,
): value is ExtractCurrentMessageRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "extract-current-gmail-message"
  );
}
