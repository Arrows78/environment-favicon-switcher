#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ALLOWED_TYPES = new Set([
  "build",
  "chore",
  "ci",
  "deprecate",
  "docs",
  "feat",
  "fix",
  "perf",
  "refactor",
  "remove",
  "revert",
  "security",
  "style",
  "test",
]);
const USER_FACING_TYPES = new Set([
  "deprecate",
  "feat",
  "fix",
  "perf",
  "remove",
  "revert",
  "security",
]);
const AUTOMATED_BODY_EXEMPTIONS = new Map([
  ["dependabot[bot]", new Set(["build", "ci"])],
]);
const TITLE_PATTERN =
  /^(?<type>[a-z][a-z0-9-]*)(?:\((?<scope>[a-z0-9][a-z0-9._/-]*)\))?(?<breaking>!)?: (?<subject>.+)$/;

export function parsePullRequestTitle(title) {
  const normalized = String(title || "").trim();
  const match = TITLE_PATTERN.exec(normalized);
  if (!match) return null;

  return {
    type: match.groups.type,
    scope: match.groups.scope || "",
    breaking: Boolean(match.groups.breaking),
    subject: match.groups.subject,
    normalized,
  };
}

export function extractReleaseNotesSection(body) {
  const text = String(body || "");
  const heading = /^##[ \t]+Release notes[ \t]*$/im.exec(text);
  if (!heading) return null;

  const contentStart = heading.index + heading[0].length;
  const nextHeading = /^##[ \t]+.+$/m.exec(text.slice(contentStart));
  const contentEnd = nextHeading
    ? contentStart + nextHeading.index
    : text.length;

  return text
    .slice(contentStart, contentEnd)
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
}

function releaseNotesStatus(section) {
  if (!section) {
    return { hasContent: false, hasBullet: false, onlyNotApplicable: false };
  }

  const lines = section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const meaningfulLines = lines.filter((line) => !/^#{3,6}\s+/.test(line));
  const noteLines = meaningfulLines.filter(
    (line) => /^[-*]\s+/.test(line) && !/^[-*]\s+\[[ xX]\]/.test(line),
  );
  const notApplicableLines = meaningfulLines.filter((line) =>
    /^(?:[-*]\s+)?(?:n\/a|not applicable)(?:\s*(?:[-—:])\s*.+)?$/i.test(line),
  );

  const releaseNoteBullets = noteLines.filter(
    (line) => !/^(?:[-*]\s+)?(?:n\/a|not applicable)\b/i.test(line),
  );

  return {
    hasContent: meaningfulLines.length > 0,
    hasReleaseNoteBullet: releaseNoteBullets.some(
      (line) => line.replace(/^[-*]\s+/, "").trim().length >= 3,
    ),
    onlyNotApplicable:
      meaningfulLines.length > 0 &&
      notApplicableLines.length === meaningfulLines.length,
    hasExplainedNotApplicable: notApplicableLines.some((line) =>
      /(?:n\/a|not applicable)\s*(?:[-—:])\s*\S+/i.test(line),
    ),
  };
}

function mayOmitReleaseNotes(parsedTitle, actor) {
  if (!parsedTitle || parsedTitle.breaking) return false;
  return (
    AUTOMATED_BODY_EXEMPTIONS.get(String(actor || ""))?.has(parsedTitle.type) ||
    false
  );
}

export function validatePullRequest({ title, body, actor }) {
  const errors = [];
  const parsedTitle = parsePullRequestTitle(title);

  if (!parsedTitle) {
    errors.push(
      "Title must use type(scope): subject or type(scope)!: subject.",
    );
  } else {
    if (!ALLOWED_TYPES.has(parsedTitle.type)) {
      errors.push(`Unsupported pull request type: ${parsedTitle.type}.`);
    }
    if (parsedTitle.normalized.length > 100) {
      errors.push("Title must not exceed 100 characters.");
    }
    if (/[.]$/.test(parsedTitle.subject)) {
      errors.push("Title subject must not end with a period.");
    }
    if (/^[A-ZÀ-ÖØ-Þ]/u.test(parsedTitle.subject)) {
      errors.push("Title subject must start with a lower-case word.");
    }
  }

  const releaseNotes = extractReleaseNotesSection(body);
  if (releaseNotes === null) {
    if (!mayOmitReleaseNotes(parsedTitle, actor)) {
      errors.push("Pull request body must contain a ## Release notes section.");
    }
    return errors;
  }

  const status = releaseNotesStatus(releaseNotes);
  if (!status.hasContent) {
    errors.push(
      "The ## Release notes section must contain a bullet or an explained N/A entry.",
    );
    return errors;
  }

  const userFacing = parsedTitle
    ? parsedTitle.breaking || USER_FACING_TYPES.has(parsedTitle.type)
    : false;

  if (userFacing) {
    if (!status.hasReleaseNoteBullet || status.onlyNotApplicable) {
      errors.push(
        "User-facing and breaking changes require at least one release-note bullet; N/A is not allowed.",
      );
    }
  } else if (
    !status.hasReleaseNoteBullet &&
    !status.hasExplainedNotApplicable
  ) {
    errors.push(
      "Internal changes must provide a release-note bullet or an explained N/A entry.",
    );
  }

  return errors;
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function pullRequestFromEvent(path) {
  const event = JSON.parse(readFileSync(path, "utf8"));
  if (!event.pull_request) {
    throw new Error(
      "The event payload does not contain a pull_request object.",
    );
  }
  return {
    title: event.pull_request.title,
    body: event.pull_request.body || "",
    actor: event.sender?.login || event.pull_request.user?.login || "",
  };
}

async function main() {
  const args = process.argv.slice(2);
  const eventPath = optionValue(args, "--event");
  let pullRequest;

  if (eventPath) {
    pullRequest = pullRequestFromEvent(resolve(eventPath));
  } else {
    const bodyFile = optionValue(args, "--body-file");
    pullRequest = {
      title: optionValue(args, "--title") || process.env.PR_TITLE,
      body: bodyFile
        ? readFileSync(resolve(bodyFile), "utf8")
        : process.env.PR_BODY,
    };
  }

  if (!pullRequest.title) {
    throw new Error(
      "Provide a pull request through --event or pass --title and --body-file.",
    );
  }

  const errors = validatePullRequest(pullRequest);
  if (errors.length) {
    throw new Error(`Pull request policy failed:\n- ${errors.join("\n- ")}`);
  }

  console.log(
    "Pull request title and release notes satisfy the repository policy.",
  );
}

const entryPoint = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPoint === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
