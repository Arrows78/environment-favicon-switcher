import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  inspectPublishCandidate,
  releaseVersionFromCommitMessage,
} from "../scripts/publish.mjs";

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "favicon-publish-"));
  writeJson(join(root, "package.json"), { version: "2.4.0" });
  writeJson(join(root, "package-lock.json"), {
    version: "2.4.0",
    packages: { "": { version: "2.4.0" } },
  });
  writeJson(join(root, "manifest.json"), { version: "2.4.0" });
  writeJson(join(root, "release.config.json"), {
    repository: "Arrows78/environment-favicon-switcher",
    releaseBranch: "automation/release",
    tagPrefix: "",
  });
  writeFileSync(
    join(root, "CHANGELOG.md"),
    `# Changelog\n\n## [Unreleased]\n\n## [2.4.0] - 2026-07-20\n\n### Added\n\n- Automatic environment suggestions.\n\n## [2.3.0] - 2026-07-19\n\n### Fixed\n\n- Previous fix.\n\n[Unreleased]: https://github.com/Arrows78/environment-favicon-switcher/compare/2.4.0...HEAD\n[2.4.0]: https://github.com/Arrows78/environment-favicon-switcher/compare/2.3.0...2.4.0\n[2.3.0]: https://github.com/Arrows78/environment-favicon-switcher/releases/tag/2.3.0\n`,
  );
  return root;
}

test("finds release versions in squash and merge commit messages", () => {
  assert.equal(
    releaseVersionFromCommitMessage("chore(release): 2.4.0"),
    "2.4.0",
  );
  assert.equal(
    releaseVersionFromCommitMessage(
      "Merge pull request #12 from automation/release\n\nchore(release): 2.4.0",
    ),
    "2.4.0",
  );
});

test("ignores ordinary commits", () => {
  assert.equal(
    releaseVersionFromCommitMessage("fix: restore the favicon"),
    null,
  );
});

test("validates a publish candidate against synchronized metadata", () => {
  const root = createFixture();
  assert.deepEqual(
    inspectPublishCandidate(
      root,
      "Merge pull request #12\n\nchore(release): 2.4.0",
    ),
    { release: true, version: "2.4.0", tag: "2.4.0" },
  );
});

test("rejects a release title that disagrees with the files", () => {
  const root = createFixture();
  assert.throws(
    () => inspectPublishCandidate(root, "chore(release): 2.5.0"),
    /announces 2\.5\.0.*contains 2\.4\.0/,
  );
});

test("rejects conflicting release versions in one commit", () => {
  assert.throws(
    () =>
      releaseVersionFromCommitMessage(
        "chore(release): 2.4.0\nchore(release): 2.5.0",
      ),
    /conflicting release versions/,
  );
});
