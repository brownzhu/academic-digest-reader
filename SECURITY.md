# Security and privacy

Academic Digest Reader processes email, so privacy regressions are treated as
security issues.

## Data boundary

- Message text is parsed in browser memory.
- The extension does not upload message content or call a custom remote API.
  Chrome account sync may transfer reading marks and theme through Google’s
  browser sync service when the user enables Chrome sync.
- Extension storage contains the theme preference and user-selected saved/read
  booleans keyed by identifiers derived from newsletter identity and item content.
  It does not store message bodies, titles, senders, or URLs. Identifiers are not
  an encryption mechanism. Marks and theme use `chrome.storage.sync`; old local
  preferences are retained as a migration backup. The standalone preview remains
  local-only. Migration explicitly allowlists these fields and strips extras.
- Pasted newsletters are processed in memory; the input is cleared after reading
  or cancellation. No clipboard is read automatically.
- Gmail access is an optional permission restricted to
  `https://mail.google.com/*` and can be revoked in Chrome.
- Links extracted from announcements open only after a user click.

## Reporting

Please report a vulnerability through GitHub's private security advisory
feature rather than a public issue. Do not include real email contents in the
report; use a minimal synthetic reproduction whenever possible.
