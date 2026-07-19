#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  copyFileSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function compareArchiveFiles(firstPath, secondPath) {
  const firstHash = sha256(firstPath);
  const secondHash = sha256(secondPath);

  if (firstHash !== secondHash) {
    throw new Error(
      `Extension packaging is not reproducible: ${basename(firstPath)}=${firstHash}, ${basename(secondPath)}=${secondHash}`,
    );
  }

  return firstHash;
}

export function findSingleArchive(distPath) {
  const archives = readdirSync(distPath)
    .filter((name) => name.endsWith(".zip"))
    .sort();

  if (archives.length !== 1) {
    throw new Error(
      `Expected exactly one ZIP archive in ${distPath}, found ${archives.length}.`,
    );
  }

  return join(distPath, archives[0]);
}

export function writeChecksumFile(archivePath, outputPath) {
  const digest = sha256(archivePath);
  writeFileSync(outputPath, `${digest}  ${basename(archivePath)}\n`);
  return digest;
}

function gitCommitTimestamp(root) {
  return execFileSync("git", ["show", "-s", "--format=%ct", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function runPackage(root, sourceDateEpoch) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  execFileSync(npmCommand, ["run", "package:extension"], {
    cwd: root,
    env: {
      ...process.env,
      SOURCE_DATE_EPOCH: sourceDateEpoch,
    },
    stdio: "inherit",
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
  appendFileSync(
    path,
    `${Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")}\n`,
  );
}

export function verifyPackage(root, sourceDateEpoch) {
  if (!/^\d+$/.test(String(sourceDateEpoch || ""))) {
    throw new Error(
      `SOURCE_DATE_EPOCH must be an integer, received: ${sourceDateEpoch}`,
    );
  }

  const distPath = resolve(root, "dist");
  const temporaryPath = mkdtempSync(join(tmpdir(), "favicon-package-"));
  const firstArchivePath = join(temporaryPath, "first.zip");

  try {
    rmSync(distPath, { recursive: true, force: true });
    runPackage(root, sourceDateEpoch);
    copyFileSync(findSingleArchive(distPath), firstArchivePath);

    rmSync(distPath, { recursive: true, force: true });
    runPackage(root, sourceDateEpoch);
    const archivePath = findSingleArchive(distPath);
    const digest = compareArchiveFiles(firstArchivePath, archivePath);
    const checksumPath = join(distPath, "SHA256SUMS");
    writeChecksumFile(archivePath, checksumPath);

    return {
      archive: relative(root, archivePath).split("\\").join("/"),
      archiveName: basename(archivePath),
      checksum: relative(root, checksumPath).split("\\").join("/"),
      sha256: digest,
      sourceDateEpoch: String(sourceDateEpoch),
    };
  } finally {
    rmSync(temporaryPath, { recursive: true, force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const root = resolve(optionValue(args, "--root") || process.cwd());
  const sourceDateEpoch =
    optionValue(args, "--source-date-epoch") ||
    process.env.SOURCE_DATE_EPOCH ||
    gitCommitTimestamp(root);
  const result = verifyPackage(root, sourceDateEpoch);
  const outputPath =
    optionValue(args, "--github-output") || process.env.GITHUB_OUTPUT;

  writeOutputs(outputPath, {
    archive: result.archive,
    archive_name: result.archiveName,
    checksum: result.checksum,
    sha256: result.sha256,
    source_date_epoch: result.sourceDateEpoch,
  });

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `Reproducible archive: \`${result.archiveName}\`\n\n\`${result.sha256}\`\n`,
    );
  }

  console.log(`Verified reproducible package ${result.archiveName}`);
  console.log(`SHA-256: ${result.sha256}`);
}

const entryPoint = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPoint === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
