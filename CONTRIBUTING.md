# Contributing

Thank you for improving Environment Favicon Switcher. Keep changes focused, testable and safe in every extension context.

## Prerequisites

- Node.js 20 or newer.
- npm, included with Node.js.
- A current Chromium-family browser for unpacked-extension testing.
- Firefox 109 or newer for Firefox-specific testing when behavior is affected.

Install the project metadata with:

```bash
npm ci
```

The extension has no runtime npm dependency. Node is only used for tests, validation and packaging.

## Development workflow

1. Create a focused branch such as `feat/url-suggestions` or `fix/title-restoration`.
2. Change the smallest appropriate layer: the shared engine, extension context, UI, translations or documentation.
3. Add or update tests for matching, normalization and storage behavior.
4. Add every new UI message to both `_locales/en/messages.json` and `_locales/fr/messages.json`.
5. Run the complete build before committing:

   ```bash
   npm run build
   ```

6. Test the unpacked extension in the affected browser contexts.

## Architectural rules

- Keep rule matching and settings normalization in `src/shared.js`; do not duplicate them in popup, options or content scripts.
- Treat normalized settings as the boundary between persisted data and runtime logic.
- Preserve page-owned favicon elements. The content script may only create, move or remove its own managed element.
- Never build markup from user-controlled values. Use `textContent`, DOM methods and explicit attributes.
- Do not add remote code or analytics.
- Keep browser API calls compatible with both callback-style Chromium APIs and Promise-style Firefox APIs.
- Keep the packaged extension free of tests, repository metadata and development scripts.
- Avoid adding dependencies when a small, reviewed standard-library implementation is sufficient.

More detail is available in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Tests and checks

```bash
npm test                  # Node test suite
npm run lint              # Static repository validation
npm run validate          # Both of the above
npm run package:extension # Deterministic runtime ZIP
npm run build             # Complete release gate
```

The static validator checks JavaScript and JSON syntax, manifest and HTML references, locale parity, translation usage, unsafe runtime sinks, default settings and repository file size.

## Commit messages

Use Conventional Commits:

```text
feat: add hostname suggestions
fix: preserve title after SPA navigation
test: cover synchronized storage corruption
docs: explain managed favicon lifecycle
refactor: isolate rule evaluation
ci: verify packaged extension
chore: update repository metadata
```

Use an imperative, lower-case subject without a trailing period. Add a body when the motivation, migration behavior or security impact is not obvious. Use `BREAKING CHANGE:` only when existing configurations or public behavior require manual action.

## Pull request checklist

- The change has one clear purpose.
- `npm run build` passes.
- User-facing behavior has tests where practical.
- Chrome/Chromium has been tested when content, background, popup or manifest behavior changed.
- Firefox has been tested when browser API or background behavior changed.
- English and French messages remain in parity.
- `CHANGELOG.md` documents user-visible changes.
- No secret, internal credential or private URL has been added.
- Permissions have not expanded without a documented reason.

## Release process

1. Update `manifest.json` and `package.json` to the same version.
2. Update `CHANGELOG.md`.
3. Run `npm ci && npm run build`.
4. Verify the SHA-256 printed by the package command and inspect the ZIP contents.
5. Test the packaged archive as an unpacked extension after extraction.
6. Create a signed tag from the release commit.
