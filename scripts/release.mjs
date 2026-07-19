#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const RELEASE_HEADING_PATTERN =
  /^## \[((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))\] - (\d{4}-\d{2}-\d{2})$/;
const LINK_DEFINITION_PATTERN =
  /^\[(Unreleased|(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))\]:\s+\S+\s*$/;
const CHANGELOG_SECTIONS = [
  "Added",
  "Changed",
  "Deprecated",
  "Removed",
  "Fixed",
  "Security",
];
const SECTION_SET = new Set(CHANGELOG_SECTIONS);
const TYPE_RULES = new Map([
  ["feat", { bump: "minor", section: "Added" }],
  ["fix", { bump: "patch", section: "Fixed" }],
  ["perf", { bump: "patch", section: "Changed" }],
  ["deprecate", { bump: "patch", section: "Deprecated" }],
  ["remove", { bump: "patch", section: "Removed" }],
  ["revert", { bump: "patch", section: "Changed" }],
  ["security", { bump: "patch", section: "Security" }],
]);
const BUMP_RANK = new Map([
  [null, 0],
  ["patch", 1],
  ["minor", 2],
  ["major", 3],
]);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function parseVersion(version) {
  const match = VERSION_PATTERN.exec(String(version));
  if (!match) {
    throw new Error(`Invalid three-part semantic version: ${version}`);
  }

  return match.slice(1).map(Number);
}

export function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);

  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return Math.sign(leftParts[index] - rightParts[index]);
    }
  }

  return 0;
}

export function bumpVersion(version, bump) {
  const [major, minor, patch] = parseVersion(version);

  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;

  throw new Error(`Unsupported release bump: ${bump}`);
}

function cleanSummary(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function capitalize(value) {
  const text = cleanSummary(value);
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}

function firstConventionalHeader(subject, body) {
  const candidates = [
    cleanSummary(subject),
    ...String(body || "")
      .split(/\r?\n/)
      .map(cleanSummary)
      .filter(Boolean),
  ];

  return candidates.find((candidate) =>
    /^[a-z][a-z0-9-]*(?:\([^)\r\n]+\))?!?: .+/.test(candidate),
  );
}

export function parseConventionalCommit(commit) {
  const header = firstConventionalHeader(commit.subject, commit.body);
  if (!header) return null;

  const match =
    /^(?<type>[a-z][a-z0-9-]*)(?:\((?<scope>[^)\r\n]+)\))?(?<breaking>!)?: (?<description>.+)$/.exec(
      header,
    );
  if (!match) return null;

  const breakingMatch = /^BREAKING(?: |-)?CHANGE:\s*(.+)$/im.exec(
    commit.body || "",
  );
  const breaking = Boolean(match.groups.breaking || breakingMatch);
  const description = cleanSummary(match.groups.description);

  if (
    !description ||
    (match.groups.type === "chore" && match.groups.scope === "release")
  ) {
    return null;
  }

  return {
    hash: cleanSummary(commit.hash),
    type: match.groups.type,
    scope: cleanSummary(match.groups.scope),
    description,
    breaking,
    breakingNote: cleanSummary(breakingMatch?.[1]),
  };
}

function strongerBump(current, candidate) {
  return BUMP_RANK.get(candidate) > BUMP_RANK.get(current)
    ? candidate
    : current;
}

export function planRelease(commits, currentVersion, releaseAs) {
  parseVersion(currentVersion);

  let bump = null;
  const entries = [];

  for (const commit of commits) {
    const parsed = parseConventionalCommit(commit);
    if (!parsed) continue;

    const rule = TYPE_RULES.get(parsed.type);
    if (!rule && !parsed.breaking) continue;

    const entryBump = parsed.breaking ? "major" : rule.bump;
    const section = parsed.breaking ? "Changed" : rule.section;
    bump = strongerBump(bump, entryBump);
    entries.push({ ...parsed, section });
  }

  let version = bump ? bumpVersion(currentVersion, bump) : null;

  if (releaseAs) {
    parseVersion(releaseAs);
    if (compareVersions(releaseAs, currentVersion) <= 0) {
      throw new Error(`--release-as must be greater than ${currentVersion}.`);
    }
    version = releaseAs;
    bump = "manual";
  }

  return {
    release: Boolean(version),
    previousVersion: currentVersion,
    version,
    bump,
    entries,
  };
}

function loadConfig(root) {
  const config = readJson(resolve(root, "release.config.json"));

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.repository || "")) {
    throw new Error(
      "release.config.json must define repository as owner/name.",
    );
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(config.releaseBranch || "")) {
    throw new Error("release.config.json must define a safe releaseBranch.");
  }
  if (typeof config.tagPrefix !== "string" || /\s/.test(config.tagPrefix)) {
    throw new Error(
      "release.config.json tagPrefix must be a string without whitespace.",
    );
  }
  if (config.historyBaseline !== undefined) {
    if (!config.historyBaseline || typeof config.historyBaseline !== "object") {
      throw new Error("release.config.json historyBaseline must be an object.");
    }
    parseVersion(config.historyBaseline.version);
    if (!/^[0-9a-f]{40}$/i.test(config.historyBaseline.ref || "")) {
      throw new Error(
        "release.config.json historyBaseline.ref must be a full commit SHA.",
      );
    }
  }

  return config;
}

function releaseTag(config, version) {
  return `${config.tagPrefix}${version}`;
}

function changelogUrl(config, suffix) {
  return `https://github.com/${config.repository}/${suffix}`;
}

function commitBullet(entry, config) {
  const scope = entry.scope ? `**${entry.scope}:** ` : "";
  const breaking = entry.breaking ? "**Breaking:** " : "";
  const note =
    entry.breakingNote && entry.breakingNote !== entry.description
      ? `${entry.description} — ${entry.breakingNote}`
      : entry.description;
  const summary = `${breaking}${scope}${capitalize(note)}`;

  if (!entry.hash) return `- ${summary}`;

  const shortHash = entry.hash.slice(0, 7);
  const url = changelogUrl(config, `commit/${entry.hash}`);
  return `- ${summary} ([${shortHash}](${url}))`;
}

function parseUnreleasedSections(content) {
  const text = content.trim();
  const sections = new Map();
  if (!text) return sections;

  let currentSection = null;
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const heading = /^### (.+)$/.exec(line);
    if (heading) {
      if (!SECTION_SET.has(heading[1])) {
        throw new Error(
          `Unsupported Keep a Changelog section in Unreleased: ${heading[1]}`,
        );
      }
      currentSection = heading[1];
      if (sections.has(currentSection)) {
        throw new Error(`Duplicate ${currentSection} section in Unreleased.`);
      }
      sections.set(currentSection, []);
      continue;
    }

    if (!currentSection) {
      if (line.trim()) {
        throw new Error(
          "Content under Unreleased must be grouped under Keep a Changelog sections.",
        );
      }
      continue;
    }

    sections.get(currentSection).push(line);
  }

  for (const [section, linesForSection] of sections) {
    const normalized = linesForSection.join("\n").trim();
    sections.set(section, normalized);
  }

  return sections;
}

export function renderReleaseSection(
  plan,
  date,
  config,
  manualSections = new Map(),
) {
  if (!plan.release || !plan.version) {
    throw new Error(
      "Cannot render a release section without a planned release.",
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid release date: ${date}`);
  }

  const generated = new Map(CHANGELOG_SECTIONS.map((section) => [section, []]));
  for (const entry of plan.entries) {
    generated.get(entry.section).push(commitBullet(entry, config));
  }

  const blocks = [];
  for (const section of CHANGELOG_SECTIONS) {
    const parts = [];
    const manual = manualSections.get(section);
    if (manual) parts.push(manual);
    if (generated.get(section).length)
      parts.push(generated.get(section).join("\n"));
    if (parts.length) blocks.push(`### ${section}\n\n${parts.join("\n")}`);
  }

  if (!blocks.length) {
    throw new Error(
      "The release has no user-visible entries. Add notes under Unreleased or use a release-worthy commit type.",
    );
  }

  return `## [${plan.version}] - ${date}\n\n${blocks.join("\n\n")}`;
}

function stripGeneratedLinks(markdown) {
  return markdown
    .split(/\r?\n/)
    .filter((line) => !LINK_DEFINITION_PATTERN.test(line))
    .join("\n")
    .trimEnd();
}

function releaseVersions(markdown) {
  return markdown
    .split(/\r?\n/)
    .map((line) => RELEASE_HEADING_PATTERN.exec(line)?.[1])
    .filter(Boolean);
}

function renderChangelogLinks(versions, config) {
  if (!versions.length) return "";

  const links = [
    `[Unreleased]: ${changelogUrl(config, `compare/${releaseTag(config, versions[0])}...HEAD`)}`,
  ];

  versions.forEach((version, index) => {
    const tag = releaseTag(config, version);
    const olderVersion = versions[index + 1];
    const target = olderVersion
      ? `compare/${releaseTag(config, olderVersion)}...${tag}`
      : `releases/tag/${tag}`;
    links.push(`[${version}]: ${changelogUrl(config, target)}`);
  });

  return links.join("\n");
}

export function updateChangelog(markdown, plan, date, config) {
  const body = stripGeneratedLinks(markdown);
  const unreleasedHeading = "## [Unreleased]";
  const unreleasedIndex = body.indexOf(unreleasedHeading);

  if (
    unreleasedIndex < 0 ||
    body.indexOf(unreleasedHeading, unreleasedIndex + 1) >= 0
  ) {
    throw new Error(
      "CHANGELOG.md must contain exactly one ## [Unreleased] heading.",
    );
  }
  if (body.includes(`## [${plan.version}]`)) {
    throw new Error(`CHANGELOG.md already contains version ${plan.version}.`);
  }

  const contentStart = unreleasedIndex + unreleasedHeading.length;
  const nextHeadingMatch = /\n## \[/.exec(body.slice(contentStart));
  const nextHeadingIndex = nextHeadingMatch
    ? contentStart + nextHeadingMatch.index + 1
    : body.length;
  const unreleasedContent = body.slice(contentStart, nextHeadingIndex);
  const manualSections = parseUnreleasedSections(unreleasedContent);
  const releaseSection = renderReleaseSection(
    plan,
    date,
    config,
    manualSections,
  );

  const prefix = body.slice(0, contentStart).trimEnd();
  const suffix = body.slice(nextHeadingIndex).trimStart();
  const updatedBody = suffix
    ? `${prefix}\n\n${releaseSection}\n\n${suffix}`
    : `${prefix}\n\n${releaseSection}`;
  const links = renderChangelogLinks(releaseVersions(updatedBody), config);

  return `${updatedBody.trimEnd()}\n\n${links}\n`;
}

export function updateVersionFiles(root, version) {
  parseVersion(version);
  const packagePath = resolve(root, "package.json");
  const packageLockPath = resolve(root, "package-lock.json");
  const manifestPath = resolve(root, "manifest.json");
  const packageJson = readJson(packagePath);
  const packageLock = readJson(packageLockPath);
  const manifest = readJson(manifestPath);

  if (!packageLock.packages?.[""]) {
    throw new Error('package-lock.json is missing packages[""].');
  }

  packageJson.version = version;
  packageLock.version = version;
  packageLock.packages[""].version = version;
  manifest.version = version;

  writeJson(packagePath, packageJson);
  writeJson(packageLockPath, packageLock);
  writeJson(manifestPath, manifest);
}

function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

function expectedChangelogLinks(markdown, config) {
  const versions = releaseVersions(markdown);
  return renderChangelogLinks(versions, config).split("\n").filter(Boolean);
}

export function collectRepositoryErrors(root) {
  const errors = [];
  let packageJson;
  let packageLock;
  let manifest;
  let config;
  let changelog;

  try {
    packageJson = readJson(resolve(root, "package.json"));
    packageLock = readJson(resolve(root, "package-lock.json"));
    manifest = readJson(resolve(root, "manifest.json"));
    config = loadConfig(root);
    changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
  } catch (error) {
    return [error.message];
  }

  const versions = [
    ["package.json", packageJson.version],
    ["package-lock.json", packageLock.version],
    ['package-lock.json packages[""]', packageLock.packages?.[""]?.version],
    ["manifest.json", manifest.version],
  ];

  for (const [source, version] of versions) {
    if (!VERSION_PATTERN.test(String(version || ""))) {
      errors.push(
        `${source} has an invalid three-part semantic version: ${version}`,
      );
    }
  }

  const distinctVersions = new Set(versions.map(([, version]) => version));
  if (distinctVersions.size !== 1) {
    errors.push(
      `Version files are out of sync: ${versions.map(([source, version]) => `${source}=${version}`).join(", ")}`,
    );
  }
  if (
    config.historyBaseline &&
    config.historyBaseline.version !== packageJson.version
  ) {
    errors.push(
      `historyBaseline targets ${config.historyBaseline.version}, but repository metadata is ${packageJson.version}.`,
    );
  }

  const lines = changelog.split(/\r?\n/);
  const levelTwoHeadings = lines.filter((line) => line.startsWith("## "));
  const unreleasedCount = levelTwoHeadings.filter(
    (line) => line === "## [Unreleased]",
  ).length;
  if (unreleasedCount !== 1) {
    errors.push(
      "CHANGELOG.md must contain exactly one ## [Unreleased] heading.",
    );
  }
  if (levelTwoHeadings[0] !== "## [Unreleased]") {
    errors.push(
      "## [Unreleased] must be the first level-two heading in CHANGELOG.md.",
    );
  }

  const releases = [];
  for (const heading of levelTwoHeadings.slice(1)) {
    const match = RELEASE_HEADING_PATTERN.exec(heading);
    if (!match) {
      errors.push(`Invalid release heading: ${heading}`);
      continue;
    }
    if (!validIsoDate(match[2])) {
      errors.push(`Invalid release date in heading: ${heading}`);
    }
    releases.push(match[1]);
  }

  if (releases[0] && releases[0] !== packageJson.version) {
    errors.push(
      `The newest changelog release (${releases[0]}) does not match package version ${packageJson.version}.`,
    );
  }

  for (let index = 1; index < releases.length; index += 1) {
    if (compareVersions(releases[index - 1], releases[index]) <= 0) {
      errors.push(
        `Changelog versions are not in descending order: ${releases[index - 1]} then ${releases[index]}.`,
      );
    }
  }

  let currentLevelTwo = null;
  const sectionNamesByRelease = new Map();
  for (const line of lines) {
    if (line.startsWith("## ")) {
      currentLevelTwo = line;
      sectionNamesByRelease.set(currentLevelTwo, new Set());
      continue;
    }
    const sectionMatch = /^### (.+)$/.exec(line);
    if (!sectionMatch) continue;
    if (!SECTION_SET.has(sectionMatch[1])) {
      errors.push(`Unsupported Keep a Changelog section: ${sectionMatch[1]}`);
      continue;
    }
    const seen = sectionNamesByRelease.get(currentLevelTwo) || new Set();
    if (seen.has(sectionMatch[1])) {
      errors.push(
        `Duplicate ${sectionMatch[1]} section under ${currentLevelTwo || "the changelog preamble"}.`,
      );
    }
    seen.add(sectionMatch[1]);
    sectionNamesByRelease.set(currentLevelTwo, seen);
  }

  const actualLinks = new Set(
    lines.filter((line) => LINK_DEFINITION_PATTERN.test(line)),
  );
  for (const expected of expectedChangelogLinks(changelog, config)) {
    if (!actualLinks.has(expected)) {
      errors.push(`Missing or stale changelog link: ${expected}`);
    }
  }

  return errors;
}

export function validateRepository(root) {
  const errors = collectRepositoryErrors(root);
  if (errors.length) {
    throw new Error(
      `Release metadata validation failed:\n- ${errors.join("\n- ")}`,
    );
  }
}

export function prepareReleaseFiles(root, plan, date) {
  if (!plan.release) return;
  const config = loadConfig(root);
  const configPath = resolve(root, "release.config.json");
  const changelogPath = resolve(root, "CHANGELOG.md");
  const changelog = readFileSync(changelogPath, "utf8");
  const updatedChangelog = updateChangelog(changelog, plan, date, config);

  updateVersionFiles(root, plan.version);
  writeFileSync(changelogPath, updatedChangelog);
  if (config.historyBaseline?.version === plan.previousVersion) {
    delete config.historyBaseline;
    writeJson(configPath, config);
  }
  validateRepository(root);
}

export function extractReleaseNotes(markdown, version) {
  parseVersion(version);
  const headingPattern = new RegExp(
    `^## \\[${version.replace(/\./g, "\\.")}\\] - \\d{4}-\\d{2}-\\d{2}$`,
    "m",
  );
  const match = headingPattern.exec(markdown);
  if (!match)
    throw new Error(`Version ${version} is missing from CHANGELOG.md.`);

  const contentStart = match.index + match[0].length;
  const nextHeading = /\n## \[/.exec(markdown.slice(contentStart));
  const contentEnd = nextHeading
    ? contentStart + nextHeading.index
    : markdown.length;
  const notes = markdown.slice(contentStart, contentEnd).trim();
  if (!notes) throw new Error(`Version ${version} has no release notes.`);
  return notes;
}

function git(root, argumentsList, options = {}) {
  return execFileSync("git", argumentsList, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", options.quiet ? "ignore" : "pipe"],
  }).trim();
}

export function loadCommitsSinceCurrentTag(root, currentVersion, config) {
  const tag = releaseTag(config, currentVersion);
  try {
    git(root, ["rev-parse", "--verify", `refs/tags/${tag}`], { quiet: true });
  } catch {
    throw new Error(
      `Missing release tag ${tag}. Fetch tags before preparing the next release.`,
    );
  }

  let historyStart = tag;
  if (config.historyBaseline?.version === currentVersion) {
    const baseline = config.historyBaseline.ref;
    try {
      git(root, ["rev-parse", "--verify", `${baseline}^{commit}`], {
        quiet: true,
      });
      git(root, ["merge-base", "--is-ancestor", baseline, "HEAD"], {
        quiet: true,
      });
    } catch {
      throw new Error(
        `Configured history baseline ${baseline} must exist and be an ancestor of HEAD.`,
      );
    }
    historyStart = baseline;
  }

  const format = "%H%x1f%s%x1f%b%x1e";
  const output = git(root, [
    "log",
    "--first-parent",
    "--reverse",
    `--format=${format}`,
    `${historyStart}..HEAD`,
  ]);

  if (!output) return [];

  return output
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash = "", subject = "", ...bodyParts] = record.split("\x1f");
      return { hash, subject, body: bodyParts.join("\x1f") };
    });
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

function writeOutputs(path, values) {
  if (!path) return;
  const lines = Object.entries(values).map(
    ([key, value]) => `${key}=${value ?? ""}`,
  );
  appendFileSync(path, `${lines.join("\n")}\n`);
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function currentVersion(root) {
  return readJson(resolve(root, "package.json")).version;
}

function planFromRepository(root, releaseAs) {
  const config = loadConfig(root);
  const version = currentVersion(root);
  const commits = loadCommitsSinceCurrentTag(root, version, config);
  return { config, plan: planRelease(commits, version, releaseAs) };
}

async function main() {
  const [command = "check", ...args] = process.argv.slice(2);
  const root = resolve(optionValue(args, "--root") || process.cwd());
  const outputPath =
    optionValue(args, "--github-output") || process.env.GITHUB_OUTPUT;

  if (command === "check") {
    validateRepository(root);
    console.log(`Release metadata is valid for ${currentVersion(root)}.`);
    return;
  }

  if (command === "plan" || command === "prepare") {
    const releaseAs = optionValue(args, "--release-as");
    const { config, plan } = planFromRepository(root, releaseAs);

    if (command === "prepare" && plan.release) {
      prepareReleaseFiles(
        root,
        plan,
        optionValue(args, "--date") || todayUtc(),
      );
    }

    writeOutputs(outputPath, {
      release: String(plan.release),
      version: plan.version || "",
      previous_version: plan.previousVersion,
      bump: plan.bump || "",
      tag: plan.version ? releaseTag(config, plan.version) : "",
      release_branch: config.releaseBranch,
    });
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (command === "notes") {
    const version = optionValue(args, "--version") || currentVersion(root);
    const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
    console.log(extractReleaseNotes(changelog, version));
    return;
  }

  throw new Error(`Unknown release command: ${command}`);
}

const entryPoint = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPoint === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
