# Change Log

All notable changes to the Stringboard extension are documented in this file.
The format is based on [Keep a Changelog](http://keepachangelog.com/).

## [0.1.0] — 2026-05-17

Initial public release.

### Added
- `Stringboard: Open editor` command launches a singleton webview panel for the workspace.
- Auto-detection of `.arb` files under `lib/l10n/` with fallbacks for `lib/i18n/`, `assets/i18n/`, and `translations/`.
- ARB parser that recognizes `@@locale`, per-key `@key_name` metadata blocks, and translation entries.
- In-memory catalog model that unifies all locales into one ordered set of rows keyed off the template locale.
- HTML `<table>` grid rendered in the webview: sticky header, key + description + one column per locale, alternating row colors.
- Theme-aware styling — every color resolves to a VS Code CSS variable, so light, dark, and high-contrast themes work without changes.
- Inline cell editing via `contenteditable`; edits dispatch a `cell-changed` message to the extension on blur or `Enter`.
- Persistence: edits write back to the corresponding `.arb` file, preserving key order, metadata, and 2-space formatting (so `git diff` only shows the line you changed). Writes are debounced 300ms.
- Missing-translation highlighting — empty cells get an amber tint and an italic "missing" placeholder; the highlight clears live as you type.
