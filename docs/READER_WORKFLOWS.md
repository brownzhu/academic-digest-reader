# Reader workflows — v0.5.0

## Implemented

- Saved and read marks on announcement cards. The current-email workflow filter
  combines with category and text search. Reset restores all reader controls.
- Marks use newsletter identity plus announcement content, rather than an item
  position. Reordering announcements preserves their state; revised content
  gets a new identity. Only a derived key and two booleans are stored locally.
  There is no cross-email saved-content library.
- Write failures retain the previous mark and display a retryable error. Loading
  failures disable mark controls rather than risk overwriting unread state.
  Marking a card preserves its expanded original text.
- The 30-day view uses every explicit deadline, includes today and day 30, and
  displays/sorts by the next upcoming deadline. It does not schedule reminders.
- Manual paste supports other mailboxes without an account connection. A subject
  is optional; known parsers and the original-text view share the same pipeline.
  Empty inputs and text exceeding 1 million characters are rejected visibly.
- Original-text search highlights literal case-insensitive matches, safely renders
  markup as text, and navigates forwards/backwards. At most 1,000 matches are
  highlighted; the original text remains complete.

## Validation

Automated tests cover persistence/reopening, invalid stored records, different
newsletter identities, storage failure, combined filters, deadline boundaries,
expired primary versus upcoming secondary deadlines, safe HTML handling,
Chinese search, highlight limits, manual input and the actual reader DOM.

The localhost browser preview was also exercised with the 30-day view and pasted
Chinese text/search navigation. This is separate from installed-extension testing:
Chrome extension installation was previously blocked by automation policy.

## Future iterations (not implemented)

- Opt-in cross-email collection with explicit retention and deletion controls.
- Editable interest keywords and per-newsletter parsing fixtures.
- Calendar export and additional languages based on real representative samples.
