# Chrome cloud sync — v0.6.0

## Scope

The installed extension synchronizes saved/read booleans keyed by derived item
identifiers, plus the display theme. No email bodies, titles, addresses, URLs,
Gmail credentials or pasted text enter sync storage. No new permission or server
is required; the existing `storage` permission provides `chrome.storage.sync`.

This is reading-state synchronization, not a mailbox backup or cross-email library.

## Activation

1. Install/reload the v0.6.0 build in Chrome.
2. Use the same Chrome account and enable syncing of extensions/settings.
3. Verify the reader has the same extension ID on both devices. An unpacked
   extension without a manifest public key can acquire a different ID depending
   on its installation path. This change intentionally does not replace the
   existing extension identity or alter Chrome account settings.
4. Mark a parsed announcement saved/read on one device, then open the same issue
   and content on the other. Theme changes also propagate to open reader panels.

A Chrome Web Store identity or a shared manifest public key is the durable way
to distribute a consistent extension ID. Public keys are not secrets. Do not
replace the ID of an existing installation without transferring its data first:
Chrome isolates storage by extension identity.

The localhost preview cannot synchronize with Chrome accounts. A write resolving
only means Chrome accepted the storage update. It does not establish that cloud
sync is enabled, online, or delivered to another device. The UI deliberately
states the prerequisites instead of reporting a misleading “Synced” timestamp.

## Migration and failures

- Migrate only allowlisted local flags and theme, and strip all extra fields.
- Preserve any existing cloud value, including a false/unmarked record.
- Record completion locally only after the sync write succeeds. Do not delete
  the source data. Failed attempts can be retried on reopening.
- After completion, do not reimport old local records when a cloud key is removed.
- Normal writes go only to sync. Quota/access failures keep the old UI value and
  show an error; there is no silent local-only success.
- Chrome queues offline writes and syncs later. Updates from `storage.onChanged`
  update displayed marks and theme without re-reading Gmail.
- Different items use separate records. Same-item simultaneous edits use Chrome's
  conflict behavior; this release does not implement per-field conflict merging.

## Limits and verification

Chrome Sync has finite total/per-record storage, record count and write limits.
This implementation does not evict user marks to make room: quota rejection is
visible and existing records remain intact. Large libraries need a later storage
strategy rather than silently discarded bookmarks.

Tests simulate migration, precedence, retry, no resurrection after removal,
allowlisted payloads, rejected writes, namespace filtering, event cleanup,
original local-preview behavior, and live DOM updates from Chrome change events.
Actual delivery between two signed-in Chrome installations is not verified in
this session. Installation/account settings were not changed by the agent.

Sources:
- https://developer.chrome.com/docs/extensions/reference/api/storage
- https://developer.chrome.com/docs/extensions/reference/manifest/key
