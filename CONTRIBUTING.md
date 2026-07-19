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
npm run lint              # Static repository and release metadata validation
npm run validate          # Both of the above
npm run package:extension # Deterministic runtime ZIP
npm run build             # Complete release gate
npm run release:plan      # Preview the next version and generated notes
```

The static validator checks JavaScript and JSON syntax, manifest and HTML references, locale parity, translation usage, unsafe runtime sinks, default settings and repository file size. The release validator additionally keeps `manifest.json`, `package.json`, `package-lock.json` and the newest changelog entry on the same version.

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

Releases use a reviewable release pull request rather than direct version commits.

1. Merge focused changes to `main` with Conventional Commit titles. A breaking change uses `!` or a `BREAKING CHANGE:` footer.
2. The **Release PR** workflow scans first-parent history from the current version tag and infers the next version: `fix`/`perf`/`security` produce a patch, `feat` produces a minor release and breaking changes produce a major release.
3. The workflow updates `manifest.json`, `package.json`, both version fields in `package-lock.json`, and `CHANGELOG.md`. The changelog keeps a blank `Unreleased` section and the Keep a Changelog category order.
4. Review the generated release pull request, its changelog wording and the complete build result. Use the workflow's optional `release_as` input only for an intentional override.
5. Merge the release pull request once it is ready. Do not edit generated version files independently.
6. The **Publish Release** workflow rebuilds the archive twice, verifies byte-for-byte reproducibility, writes `SHA256SUMS`, creates the version tag and GitHub Release, and emits a build-provenance attestation. Existing releases are detected and skipped on reruns.

The initial `historyBaseline` in `release.config.json` is a one-time migration guard. Version `2.3.0` was recorded on two sibling commits: the tag and the current `main` commit contain the same UI release with a small metadata difference. The baseline prevents that already documented change from being released again, then removes itself from the first generated release pull request.

Version tags intentionally keep the repository's existing format (`2.4.0`, without a `v` prefix). The workflow uses the dedicated `automation/release` branch. Its default GitHub token is sufficient to maintain the pull request and the workflow runs the full release gate itself. Repositories whose branch rules require checks triggered by the pull request can provide a fine-grained `RELEASE_PR_TOKEN` secret with repository contents and pull-request write access.
