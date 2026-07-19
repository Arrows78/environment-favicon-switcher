# Architecture

Environment Favicon Switcher is a small WebExtension with one shared domain layer and four browser execution contexts. The design keeps matching and persistence deterministic while preventing UI and page code from inventing their own interpretation of a rule.

## Context map

```text
                     browser.storage.local / sync
                               ▲      │
                               │      ▼
                       ┌───────────────────┐
                       │ src/shared.js     │
                       │ schema, matching, │
                       │ validation, sync  │
                       └───────────────────┘
                         ▲       ▲       ▲
                         │       │       │
          ┌──────────────┘       │       └──────────────┐
          │                      │                      │
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│ options page     │   │ popup            │   │ content script   │
│ src/options.js   │   │ active-tab view  │   │ favicon + title  │
│ src/ui.js        │   │                  │   │                  │
└──────────────────┘   └────────┬─────────┘   └─────────┬────────┘
                                │ runtime messages      │
                                ▼                       ▼
                         ┌────────────────────────────────┐
                         │ background / service worker    │
                         │ badge text, color and tooltip  │
                         └────────────────────────────────┘
```

`config/defaults.js` is loaded before `src/shared.js` in every context that needs settings. Chromium enters through `src/service-worker.js`; Firefox can use the background script list declared in the manifest.

## Settings schema

Persisted data is normalized to schema version 2 before use:

```js
{
  schemaVersion: 2,
  enabled: true,
  titlePrefixEnabled: false,
  reapplyOnChanges: true,
  debug: false,
  groups: [
    { id, name, color }
  ],
  rules: [
    {
      id,
      groupId,
      enabled,
      name,
      label,
      color,
      priority,
      matchType,
      patterns,
      excludePatterns,
      favicon,
      keepOriginalFavicon
    }
  ]
}
```

Normalization supplies defaults, trims strings, bounds priority values, validates colors, removes blank patterns and clears group references that no longer exist. Existing settings without schema-v2 fields are migrated without requiring user action.

Stable rule and group IDs are important for import merging and UI updates. Array order is semantically relevant only as a tie breaker between equal-priority matching rules.

## Rule evaluation

`diagnoseUrl(url, settings)` is the canonical entry point.

1. Normalize settings and every rule.
2. Parse the URL once for hostname matching.
3. Evaluate all inclusion patterns with the rule's match type.
4. Evaluate exclusions only after an inclusion matched.
5. Mark a rule as matching only when it has an inclusion and no exclusion.
6. Sort matching evaluations by descending priority and then ascending source index.
7. Return the winner, all matches, all evaluations, pattern errors and conflict state.

The popup, options-page tester and content script consume this same diagnosis, preventing discrepancies between preview and runtime behavior.

### Match-mode invariants

- `contains` is case-insensitive and checks the complete URL string.
- `hostname` matches an exact host or a true subdomain boundary.
- `glob` is anchored to the complete URL and supports only `*` and `?` wildcards.
- `regex` is case-insensitive, length-limited and converted into a non-throwing evaluation result.
- Exclusions use the same mode as their owning rule.
- A disabled rule never matches.
- A globally disabled configuration exposes no winner.

## Favicon lifecycle

The content script owns exactly one element marked with `data-environment-favicon-switcher="true"`.

When a matching rule needs a replacement, the script creates or updates that element and appends it last in `<head>`. Existing page icon nodes remain untouched. When no replacement is needed, only the managed node is removed.

A mutation observer watches relevant icon and title changes. Reapplication is debounced, and mutations caused by the managed icon itself are ignored. This avoids feedback loops while keeping the extension effective on applications that rewrite their favicons after load.

## Title lifecycle

The content script distinguishes:

- `baseTitle`: the latest title owned by the application;
- `currentPrefix`: the prefix selected from the winning rule;
- `managedTitle`: the exact value last written by the extension.

A mutation equal to `managedTitle` is ignored as self-authored. Any other title change is captured as a new application title, after stripping the active prefix once. Disabling the extension or changing to a non-matching URL therefore restores the latest application value rather than the title from initial page load.

## SPA navigation

`history.pushState` and `history.replaceState` are wrapped once, and `popstate` plus periodic URL checks provide additional coverage. A URL change schedules a complete diagnosis. The interval is deliberately low frequency and only compares `location.href`; matching and storage reads remain event driven.

## Storage model

Local storage always contains a complete normalized `settings` object and acts as the recovery copy.

When synchronization is enabled:

1. Settings are JSON-serialized.
2. UTF-8 size is checked against the 80 KiB application limit.
3. Text is split without breaking Unicode code points, with each chunk at most 7,000 bytes.
4. A manifest records format version, schema version, chunk count, byte length, checksum and update time.
5. Chunks and manifest are written to `storage.sync`.
6. Stale chunks from an older, larger configuration are removed.

Reads verify the manifest, chunk presence, checksum, JSON syntax and top-level object shape. Any failure records a user-visible reason, switches the preference to local and returns the local backup.

The extra application limit is intentionally lower than browser-wide aggregate quotas so that embedded favicons fail predictably before partial writes become likely.

## Import/export

Exports use format version 1 and contain normalized schema-v2 settings. The envelope version and object shape are validated during import. A legacy raw settings object is accepted for backward compatibility.

Replace import adopts the imported settings. Merge import replaces groups and rules with matching IDs, retains unmatched current rules and appends new imported rules. Current global toggles remain unchanged during a merge.

## Browser API compatibility

`EnvFavicon.callApi` adapts callback-style Chrome APIs and Promise-style Firefox APIs to one Promise interface. Call sites bind storage methods to their storage-area object to preserve browser implementation context.

Background code is shared by the Chromium service worker and Firefox background scripts. Runtime messaging is best effort: inaccessible internal pages or destroyed contexts should not turn into unhandled rejections.

## Security invariants

- No user string is interpreted as HTML.
- No dynamic code execution is allowed.
- Generated favicon labels are restricted to letters and digits, length-limited and XML-escaped.
- Imported payloads and synchronized data must be top-level objects.
- Unknown versioned export formats are rejected.
- Regular-expression failures are represented as diagnostics, not exceptions crossing context boundaries.
- Packaged archives contain only runtime files listed by `scripts/package.mjs`.

`scripts/check.mjs` enforces these invariants where static checking is practical.

## Test strategy

`tests/shared.test.js` loads `config/defaults.js` and `src/shared.js` in an isolated Node VM with an in-memory Chrome storage implementation. Tests cover:

- schema migration and normalization;
- hostname boundaries, glob semantics and regular-expression failures;
- exclusions, priorities, tie breaking and global disablement;
- favicon generation and label sanitization;
- versioned/legacy imports and merge semantics;
- synchronized round trips, Unicode chunk boundaries, corruption, fallback and size limits.

`tests/ui.test.js` validates the options page and popup markup, CSS design tokens and `src/ui.js` behavior:

- semantic design token coverage (color, type, spacing, shape, elevation, motion);
- WCAG AA contrast ratios for text and feedback pairs in both themes;
- keyboard focus management, `aria-pressed` group semantics and live-region scoping;
- responsive layout reflow and unique static document IDs.

Browser smoke testing should additionally cover the options page, popup, title updates, page-owned favicon preservation, SPA navigation and packaged-manifest loading.
