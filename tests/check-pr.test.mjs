import assert from "node:assert/strict";
import test from "node:test";

import {
  extractReleaseNotesSection,
  parsePullRequestTitle,
  validatePullRequest
} from "../scripts/check-pr.mjs";

test("parses scoped and breaking Conventional Commit titles", () => {
  assert.deepEqual(parsePullRequestTitle("feat(options)!: replace the rule editor"), {
    type: "feat",
    scope: "options",
    breaking: true,
    subject: "replace the rule editor",
    normalized: "feat(options)!: replace the rule editor"
  });
});

test("accepts a user-facing pull request with release-note bullets", () => {
  assert.deepEqual(validatePullRequest({
    title: "feat(options): suggest matching environments",
    body: "## Summary\nAdds suggestions.\n\n## Release notes\n\n- Suggest matching rules from the active URL.\n\n## Validation\n- [x] npm test"
  }), []);
});

test("accepts an explained N/A for an internal change", () => {
  assert.deepEqual(validatePullRequest({
    title: "ci: verify pull request metadata",
    body: "## Release notes\n\n- N/A — repository automation only."
  }), []);
});

test("accepts the generated release pull request format", () => {
  assert.deepEqual(validatePullRequest({
    title: "chore(release): 2.4.0",
    body: [
      "## Automated release 2.4.0",
      "",
      "This pull request was generated from Conventional Commits since 2.3.0.",
      "",
      "## Release notes",
      "",
      "### Added",
      "",
      "- Redesign the options page.",
      "",
      "---",
      "",
      "Merging this pull request publishes the deterministic extension archive."
    ].join("\n")
  }), []);
});

test("rejects N/A for a feature or breaking change", () => {
  const errors = validatePullRequest({
    title: "feat: add a new badge mode",
    body: "## Release notes\n\n- N/A — no notes."
  });
  assert.ok(errors.some((error) => error.includes("N/A is not allowed")));
});

test("rejects malformed titles and missing release notes", () => {
  const errors = validatePullRequest({
    title: "Feat: Add a mode.",
    body: "## Summary\nNo release notes."
  });
  assert.ok(errors.some((error) => error.includes("Title must use")));
  assert.ok(errors.some((error) => error.includes("## Release notes")));
});

test("extracts the release notes without later sections or comments", () => {
  assert.equal(
    extractReleaseNotesSection("## Release notes\n<!-- prompt -->\n- Visible note.\n\n## Validation\n- [x] done"),
    "- Visible note."
  );
});

test("rejects empty maintenance N/A entries", () => {
  const errors = validatePullRequest({
    title: "docs: explain release automation",
    body: "## Release notes\n\n- N/A"
  });
  assert.ok(errors.some((error) => error.includes("explained N/A")));
});
