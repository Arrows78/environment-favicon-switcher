# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow the number declared in `manifest.json`.

## [Unreleased]

## [2.3.0] - 2026-07-19

### Added

- Semantic design token system covering color, typography, spacing, shape, elevation and motion.
- Dynamic UI adapter (`src/ui.js`) for focus management, rule card a11y enhancement and live region scoping.
- WCAG AA contrast compliance for text and feedback pairs in both light and dark themes.
- `prefers-reduced-motion`, `forced-colors` and responsive layout support.
- Tests for design token coverage, contrast ratios and keyboard accessibility.
- Design system, UI audit and verification documentation.

### Changed

- Redesigned options page and popup with new design tokens and layout system.
- Group filters now use pressed buttons instead of incomplete tab semantics.
- Live regions scoped to concise status messages only.

## [2.2.0] - 2026-07-18

### Added

- Explicit rule priorities with stable order-based tie breaking.
- Exclusion patterns to prevent a rule from applying to selected URLs.
- A `glob` matching mode alongside substring, hostname and regular-expression matching.
- Detailed URL diagnostics showing the winning rule, competing rules, exclusions and invalid patterns.
- An options-page URL tester that can use a pasted URL or the active tab.
- Rule filtering, grouping, duplication and reordering controls.
- SVG favicon generation from a short label and color.
- Versioned configuration import and export with optional merge behavior.
- Optional browser synchronization through synchronized extension storage.
- UTF-8 chunking, integrity checks and an explicit 80 KiB synchronized configuration limit.
- Automatic local fallback when synchronization is unavailable, corrupt or too large.
- Live updates when local or synchronized settings change.
- Dependency-free Node.js tests for matching, migrations, imports and storage behavior.
- Static repository validation, deterministic extension packaging and GitHub Actions CI.
- Architecture documentation, a contribution guide and a security policy.
- English and French translations for the new workflows.

### Changed

- Migrated settings to schema version 2 while preserving compatible data from previous configurations.
- Redesigned the options page around diagnostics, validation and advanced rule editing.
- Expanded the popup with the active rule, label, priority, winning pattern and conflicts.
- Made rule resolution deterministic and independent from accidental array ordering.
- Strengthened normalization of persisted groups, rules and settings.
- Updated the extension version to `2.2.0`.

### Fixed

- Preserved favicon elements owned by the website instead of modifying or removing them.
- Restored the original title and favicon state when an environment is no longer active.
- Improved support for SPA navigation, title changes and dynamic favicon mutations.
- Refreshed toolbar badges after rule, priority, label, color or active-tab changes.
- Cleared stale badges on pages that the extension cannot access.
- Rejected malformed persisted settings and unsupported import envelopes.
- Protected against incomplete synchronized data and checksum mismatches.
- Improved compatibility between Firefox and Chromium WebExtension APIs.

### Security

- Removed user-controlled HTML injection paths from the popup and options page.
- Added automated checks that reject unsafe DOM sinks and dynamic code execution such as `innerHTML`, `insertAdjacentHTML`, `eval` and `new Function` in extension code.
- Sanitized labels before embedding them in generated SVG favicons.

## [2.1.0] - 2026-07-14

### Added

- Complete extension internationalization with English and French translations.
- Automatic locale selection through the WebExtension `_locales` system.
- Configurable environment groups.
- Group tabs in the options page.
- Group creation and normalization in the shared configuration model.

### Changed

- Replaced company-specific defaults with generic local, development, review, staging and production examples.
- Replaced legacy ICO favicons with generic PNG icons.
- Refreshed the main extension icons.
- Reorganized and modernized the options page.
- Improved the popup and shared visual styles.
- Updated the documentation for the generic presets.
- Updated the extension version to `2.1.0`.

## [2.0.0] - 2026-07-14

### Added

- Initial Manifest V3 WebExtension structure for Firefox and Chromium browsers.
- Manifest, icons and permissions required by the extension.
- Centralized environment rules and default settings.
- Enableable rules associating URL patterns with a name, label, color and favicon.
- URL substring, hostname and regular-expression matching modes.
- Settings normalization and local persistence.
- Active-URL environment detection.
- Favicon replacement when a rule matches.
- Optional page-title prefix using the environment label.
- Automatic reapplication after dynamic page changes.
- Background and service-worker scripts for extension state updates.
- A colored toolbar badge showing the detected environment.
- A popup showing the active environment and a shortcut to configuration.
- A complete environment-management options page.
- Rule activation, editing, creation and deletion from the interface.
- Initial configuration import and export.
- Installation, configuration and usage documentation.
