import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  collectRepositoryErrors,
  extractReleaseNotes,
  loadCommitsSinceCurrentTag,
  parseConventionalCommit,
  planRelease,
  prepareReleaseFiles,
  updateChangelog,
} from "../scripts/release.mjs";

const CONFIG = {
  repository: "Arrows78/environment-favicon-switcher",
  releaseBranch: "automation/release",
  tagPrefix: "",
};

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function createFixture(unreleased = "", config = CONFIG) {
  const root = mkdtempSync(join(tmpdir(), "favicon-release-"));
  writeJson(join(root, "package.json"), {
    name: "environment-favicon-switcher",
    version: "2.3.0",
  });
  writeJson(join(root, "package-lock.json"), {
    name: "environment-favicon-switcher",
    version: "2.3.0",
    lockfileVersion: 3,
    packages: {
      "": {
        name: "environment-favicon-switcher",
        version: "2.3.0",
      },
    },
  });
  writeJson(join(root, "manifest.json"), {
    manifest_version: 3,
    version: "2.3.0",
  });
  writeJson(join(root, "release.config.json"), config);
  writeFileSync(
    join(root, "CHANGELOG.md"),
    `# Changelog\n\nAll notable changes to this project are documented in this file.\n\n## [Unreleased]\n\n${unreleased}\n\n## [2.3.0] - 2026-07-19\n\n### Added\n\n- Existing feature.\n\n## [2.2.0] - 2026-07-18\n\n### Fixed\n\n- Existing fix.\n\n[Unreleased]: https://github.com/Arrows78/environment-favicon-switcher/compare/2.3.0...HEAD\n[2.3.0]: https://github.com/Arrows78/environment-favicon-switcher/compare/2.2.0...2.3.0\n[2.2.0]: https://github.com/Arrows78/environment-favicon-switcher/releases/tag/2.2.0\n`,
  );
  return root;
}

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

test("parses a conventional title from a GitHub merge commit body", () => {
  const parsed = parseConventionalCommit({
    hash: "1234567890abcdef",
    subject: "Merge pull request #42 from example/branch",
    body: "feat(options): suggest environment rules\n\nAdditional context.",
  });

  assert.deepEqual(parsed, {
    hash: "1234567890abcdef",
    type: "feat",
    scope: "options",
    description: "suggest environment rules",
    breaking: false,
    breakingNote: "",
  });
});

test("plans the highest semantic version bump and ignores maintenance commits", () => {
  const plan = planRelease(
    [
      {
        hash: "1111111111111111111111111111111111111111",
        subject: "feat(options): add rule suggestions",
        body: "",
      },
      {
        hash: "2222222222222222222222222222222222222222",
        subject: "fix(storage): recover an interrupted sync",
        body: "",
      },
      {
        hash: "3333333333333333333333333333333333333333",
        subject: "docs: explain sync recovery",
        body: "",
      },
      {
        hash: "4444444444444444444444444444444444444444",
        subject: "feat(sync)!: replace the legacy payload",
        body: "BREAKING CHANGE: existing synchronized payloads must be imported again",
      },
    ],
    "2.3.0",
  );

  assert.equal(plan.release, true);
  assert.equal(plan.bump, "major");
  assert.equal(plan.version, "3.0.0");
  assert.equal(plan.entries.length, 3);
  assert.equal(plan.entries.at(-1).section, "Changed");
});

test("updates all version files and creates a strict Keep a Changelog release", () => {
  const root = createFixture("### Added\n\n- A manually curated note.");
  const plan = planRelease(
    [
      {
        hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        subject: "feat(options): add automatic suggestions",
        body: "",
      },
      {
        hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        subject: "fix(sync): keep local fallback state",
        body: "",
      },
    ],
    "2.3.0",
  );

  prepareReleaseFiles(root, plan, "2026-07-20");

  assert.equal(
    JSON.parse(readFileSync(join(root, "package.json"))).version,
    "2.4.0",
  );
  assert.equal(
    JSON.parse(readFileSync(join(root, "package-lock.json"))).packages[""]
      .version,
    "2.4.0",
  );
  assert.equal(
    JSON.parse(readFileSync(join(root, "manifest.json"))).version,
    "2.4.0",
  );

  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  assert.match(changelog, /## \[Unreleased\]\n\n## \[2\.4\.0\] - 2026-07-20/);
  assert.match(
    changelog,
    /### Added\n\n- A manually curated note\.\n- \*\*options:\*\* Add automatic suggestions/,
  );
  assert.match(
    changelog,
    /### Fixed\n\n- \*\*sync:\*\* Keep local fallback state/,
  );
  assert.match(changelog, /\[Unreleased\]: .*compare\/2\.4\.0\.\.\.HEAD/);
  assert.match(changelog, /\[2\.4\.0\]: .*compare\/2\.3\.0\.\.\.2\.4\.0/);
  assert.deepEqual(collectRepositoryErrors(root), []);
});

test("uses and then removes a one-time history baseline", () => {
  const root = mkdtempSync(join(tmpdir(), "favicon-history-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.name", "Release Test"]);
  git(root, ["config", "user.email", "release-test@example.invalid"]);

  writeFileSync(join(root, "history.txt"), "shared base\n");
  git(root, ["add", "history.txt"]);
  git(root, ["commit", "-m", "chore: shared base"]);

  git(root, ["switch", "-c", "tagged-release"]);
  writeFileSync(join(root, "history.txt"), "tagged release\n");
  git(root, ["commit", "-am", "feat(ui): tagged release copy"]);
  git(root, ["tag", "2.3.0"]);

  git(root, ["switch", "main"]);
  writeFileSync(join(root, "history.txt"), "main release copy\n");
  git(root, ["commit", "-am", "feat(ui): main release copy"]);
  const baseline = git(root, ["rev-parse", "HEAD"]);

  writeFileSync(
    join(root, "history.txt"),
    "main release copy\nci automation\n",
  );
  git(root, ["commit", "-am", "ci: add release automation"]);

  const config = {
    ...CONFIG,
    historyBaseline: {
      version: "2.3.0",
      ref: baseline,
    },
  };
  const commits = loadCommitsSinceCurrentTag(root, "2.3.0", config);
  assert.deepEqual(
    commits.map((commit) => commit.subject),
    ["ci: add release automation"],
  );

  const fixture = createFixture("", config);
  const plan = planRelease(
    [
      {
        hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        subject: "fix: publish the first automated release",
        body: "",
      },
    ],
    "2.3.0",
  );
  prepareReleaseFiles(fixture, plan, "2026-07-20");

  const preparedConfig = JSON.parse(
    readFileSync(join(fixture, "release.config.json"), "utf8"),
  );
  assert.equal(preparedConfig.historyBaseline, undefined);
  assert.deepEqual(collectRepositoryErrors(fixture), []);
});

test("reports version drift before a release can be merged", () => {
  const root = createFixture();
  const manifest = JSON.parse(readFileSync(join(root, "manifest.json")));
  manifest.version = "2.3.1";
  writeJson(join(root, "manifest.json"), manifest);

  assert.ok(
    collectRepositoryErrors(root).some((message) =>
      message.includes("out of sync"),
    ),
  );
});

test("extracts only the requested release notes", () => {
  const root = createFixture();
  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  const notes = extractReleaseNotes(changelog, "2.3.0");

  assert.match(notes, /### Added/);
  assert.doesNotMatch(notes, /2\.2\.0/);
});

test("rejects a forced release without any changelog content", () => {
  const root = createFixture();
  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  const plan = planRelease([], "2.3.0", "2.3.1");

  assert.throws(
    () => updateChangelog(changelog, plan, "2026-07-20", CONFIG),
    /no user-visible entries/,
  );
});
