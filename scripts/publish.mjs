#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractReleaseNotes, validateRepository } from "./release.mjs";

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function releaseVersionFromCommitMessage(message) {
  const versions = String(message || "")
    .split(/\r?\n/)
    .map(
      (line) =>
        /^chore\(release\): ((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(
          line.trim(),
        )?.[1],
    )
    .filter(Boolean);
  const uniqueVersions = [...new Set(versions)];

  if (uniqueVersions.length > 1) {
    throw new Error(
      `The commit message contains conflicting release versions: ${uniqueVersions.join(", ")}`,
    );
  }

  return uniqueVersions[0] || null;
}

export function inspectPublishCandidate(root, commitMessage) {
  const releaseVersion = releaseVersionFromCommitMessage(commitMessage);
  if (!releaseVersion) {
    return { release: false, version: null, tag: null };
  }

  validateRepository(root);
  const packageJson = readJson(resolve(root, "package.json"));
  const config = readJson(resolve(root, "release.config.json"));

  if (!VERSION_PATTERN.test(packageJson.version || "")) {
    throw new Error(
      `package.json has an invalid release version: ${packageJson.version}`,
    );
  }
  if (releaseVersion !== packageJson.version) {
    throw new Error(
      `Release commit announces ${releaseVersion}, but release metadata contains ${packageJson.version}.`,
    );
  }

  const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
  extractReleaseNotes(changelog, releaseVersion);

  return {
    release: true,
    version: releaseVersion,
    tag: `${config.tagPrefix || ""}${releaseVersion}`,
  };
}

function git(root, argumentsList) {
  return execFileSync("git", argumentsList, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
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
  appendFileSync(
    path,
    `${Object.entries(values)
      .map(([key, value]) => `${key}=${value ?? ""}`)
      .join("\n")}\n`,
  );
}

async function main() {
  const [command = "candidate", ...args] = process.argv.slice(2);
  const root = resolve(optionValue(args, "--root") || process.cwd());
  const outputPath =
    optionValue(args, "--github-output") || process.env.GITHUB_OUTPUT;

  if (command !== "candidate" && command !== "check") {
    throw new Error(`Unknown publish command: ${command}`);
  }

  const commitMessage =
    optionValue(args, "--message") || git(root, ["log", "-1", "--format=%B"]);
  const candidate = inspectPublishCandidate(root, commitMessage);

  if (command === "check" && !candidate.release) {
    throw new Error("HEAD is not a chore(release) commit.");
  }

  writeOutputs(outputPath, {
    release: String(candidate.release),
    version: candidate.version || "",
    tag: candidate.tag || "",
  });
  console.log(JSON.stringify(candidate, null, 2));
}

const entryPoint = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPoint === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
