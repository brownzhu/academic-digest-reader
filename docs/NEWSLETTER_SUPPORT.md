# Newsletter support and the IPNet fix

## Why Volume 33, Number 9 failed

The original reader instantiated `NaDigestParser` directly. IPNet identifies
issues as `Volume 33, Number 9`, separates announcements with Unicode ellipses,
and inserts blank lines between From/Date/Subject headers. NA's grammar could
not recognize this structure. The inspected IPNet email also has a contents
entry about a university position where the actual first announcement describes
a conference. The reader preserves the actual subject and reports the mismatch.

## Code map

| File | Responsibility |
| --- | --- |
| `src/parsers/ipnet-digest-parser.ts` | IPNet identity, ellipsis rules, headers, footer and contents diagnostics |
| `src/parsers/mailman-digest-parser.ts` | Numbered Mailman messages with folded or reordered headers |
| `src/parsers/supported-parsers.ts` | Single production registry for supported formats |
| `src/parsers/entry.ts` | Shared item extraction and conservative association of HTML links |
| `src/extractors/dates.ts` | English weekdays, RFC email dates, independent deadline labels |
| `src/extraction/gmail-extractor.ts` | Current-message extraction, hyperlinks and Gmail clipping warning |
| `src/reader/main.ts` | Parser selection, cards, diagnostics and original-message view |

## Format boundaries

- NA/IPNet: complete From/Date/Subject blocks required. Existing NA golden
  expectations remain unchanged.
- IPNet: spaced colons, NBSP, CRLF, blank header lines and folded subjects are
  accepted; missing end markers and contents disagreements remain visible.
- Mailman: English `Today's Topics`, digest identity from subject or footer,
  long hyphen separators and `Message: N` blocks. From and Subject are required;
  Date can be missing. Repeated headers are rejected as ambiguous. MIME digests,
  encoded-word header decoding and translated field labels are not supported.
- Other mail: original text and web links remain readable; the UI does not
  pretend it extracted separate announcements. An unavailable Gmail body is
  still an extraction error.
- Dates are never inferred from ambiguous numeric forms. RFC Date parsing
  preserves the written date rather than converting it across time zones.
- HTML link labels must identify exactly one position in the message and one
  destination to be associated with a card. Repeated labels such as “Read more”
  are deliberately omitted from cards. Plain-text URLs remain extractable.

## Validation and privacy

Synthetic fixtures and independently specified golden titles cover IPNet and
Mailman. Parser tests cover malformed sections, numbering gaps, clipping,
folded headers, optional dates, evidence spans, and ambiguous links. Reader DOM
tests exercise all three formats and switching to/from the original-message
view, including literal HTML text and rejected unsafe URL schemes.

The IPNet fixture models the observed October 7, 2026 email's structure but uses
fictional people and example.org addresses. Real email is not committed or sent
to a service. Browser installation and live extension validation remain separate
from automated tests; Chrome automation blocked the installation page in this
session.

Reference: [GNU Mailman digest examples](https://docs.mailman3.org/projects/mailman/en/latest/src/mailman/runners/docs/digester.html).
