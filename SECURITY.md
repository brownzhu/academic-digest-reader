# Security and privacy

Academic Digest Reader processes email, so privacy regressions are treated as
security issues.

## Data boundary

- Message text is parsed in browser memory.
- The extension does not upload message content or use remote APIs.
- Extension storage contains only the display-theme preference.
- Gmail access is an optional permission restricted to
  `https://mail.google.com/*` and can be revoked in Chrome.
- Links extracted from announcements open only after a user click.

## Reporting

Please report a vulnerability through GitHub's private security advisory
feature rather than a public issue. Do not include real email contents in the
report; use a minimal synthetic reproduction whenever possible.
