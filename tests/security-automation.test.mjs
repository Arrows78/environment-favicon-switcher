import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const WORKFLOW_DIRECTORY = new URL("../.github/workflows/", import.meta.url);
const PINNED_ACTION_PATTERN =
  /^\s*uses:\s+[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?@[0-9a-f]{40}\s+#\s+v\d+\.\d+\.\d+\s*$/;

function workflowEntries() {
  return readdirSync(WORKFLOW_DIRECTORY)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort()
    .map((name) => ({
      name,
      source: readFileSync(new URL(name, WORKFLOW_DIRECTORY), "utf8"),
    }));
}

test("pins every external GitHub Action to an immutable commit", () => {
  let actionCount = 0;

  for (const workflow of workflowEntries()) {
    for (const [index, line] of workflow.source.split(/\r?\n/).entries()) {
      if (!/^\s*uses:/.test(line) || /uses:\s+\.\//.test(line)) continue;
      actionCount += 1;
      assert.match(
        line,
        PINNED_ACTION_PATTERN,
        `${workflow.name}:${index + 1} must use a 40-character commit with a version comment`,
      );
    }
  }

  assert.ok(
    actionCount >= 10,
    "expected the repository workflows to use external actions",
  );
});

test("configures weekly grouped dependency updates with conventional prefixes", () => {
  const source = readFileSync(
    new URL("../.github/dependabot.yml", import.meta.url),
    "utf8",
  );
  assert.match(source, /package-ecosystem: npm/);
  assert.match(source, /package-ecosystem: github-actions/);
  assert.match(source, /timezone: Europe\/Paris/g);
  assert.match(source, /prefix: "build\(deps\)"/);
  assert.match(source, /prefix: "ci\(deps\)"/);
});

test("scans source and workflows and rejects high-severity dependency regressions", () => {
  const codeql = readFileSync(
    new URL("../.github/workflows/codeql.yml", import.meta.url),
    "utf8",
  );
  const dependencyReview = readFileSync(
    new URL("../.github/workflows/dependency-review.yml", import.meta.url),
    "utf8",
  );

  assert.match(codeql, /language: actions/);
  assert.match(codeql, /language: javascript-typescript/);
  assert.match(codeql, /queries: security-extended/);
  assert.match(codeql, /security-events: write/);
  assert.match(dependencyReview, /fail-on-severity: high/);
});
