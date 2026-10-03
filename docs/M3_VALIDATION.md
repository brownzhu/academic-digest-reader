# M3 validation record

Date: 2026-10-03 (Europe/Berlin)

## Checked-in regression fixture

Source: privacy-safe synthetic NA Digest modeled on the structural features of
the verified messages, including 17 entries, deterministic fields, and
transport wrapping cases.

- Golden topics: 17
- Parsed announcements: 17
- Duplicate item identifiers: 0
- Digest warnings: 0
- All populated core fields carry evidence records

The public fixture contains only fictional names, `example.org` addresses, and
synthetic announcement prose. Its golden title list is maintained separately
so parser changes cannot silently redefine the expected result. The original
user-supplied fixture is deliberately excluded from version control.

## Read-only live Gmail audit

The Gmail adapter was inspected against an already-open forwarded NA Digest
message (Vol. 26, Issue 39). No click, message mutation, download, or mailbox
write was performed, and the live email body was not saved to the project.

- `[role='main'] .a3s`: 1 candidate, 1 visible
- selected body length: 28,433 characters
- message subject, sender, and received-date selectors: present
- parsed announcements using the same segmentation/header reconciliation
  rules as the extension: 17
- empty announcement bodies: 0
- wrapped Subject headers: 12
- raw table-of-contents physical lines: 24
- reconciled table-of-contents titles: 17
- positional Subject/title mismatches after conservative reconciliation: 0

This audit exposed both folded Subject headers and a folded multi-author From
header. Those cases are now covered by parser regression tests.

## Acceptance checks

Run from the project root:

```sh
npm run check
npm test
npm run build
npm run parse:fixture
```

Expected behavior:

- TypeScript reports no errors.
- All Vitest suites pass.
- Vite emits `dist/manifest.json`, `dist/sidepanel.html`, the reader assets,
  and the service worker.
- Fixture parsing reports 17 items and 0 digest warnings.

Final v0.2.2 acceptance run:

- 8 test files, 42 tests passed, including the first-use optional Gmail
  permission flow;
- Side Panel DOM startup rendered 17 cards and all primary interactions passed;
- required permissions contain only `activeTab`, `scripting`, `sidePanel`, and
  `storage`; Gmail access is a user-granted optional permission limited to
  `https://mail.google.com/*`;
- production JavaScript contains no `fetch`, `XMLHttpRequest`, `sendBeacon`,
  or `WebSocket` calls;
- all four PNG icon sizes referenced by the manifest were emitted.
