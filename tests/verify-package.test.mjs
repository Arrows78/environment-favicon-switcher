import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  compareArchiveFiles,
  findSingleArchive,
  sha256,
  writeChecksumFile
} from "../scripts/verify-package.mjs";

test("accepts byte-identical archives and returns their digest", () => {
  const root = mkdtempSync(join(tmpdir(), "favicon-archive-"));
  const first = join(root, "first.zip");
  const second = join(root, "second.zip");
  writeFileSync(first, "same archive bytes");
  writeFileSync(second, "same archive bytes");

  assert.equal(compareArchiveFiles(first, second), sha256(first));
});

test("rejects packaging drift", () => {
  const root = mkdtempSync(join(tmpdir(), "favicon-archive-"));
  const first = join(root, "first.zip");
  const second = join(root, "second.zip");
  writeFileSync(first, "first build");
  writeFileSync(second, "second build");

  assert.throws(() => compareArchiveFiles(first, second), /not reproducible/);
});

test("writes a portable SHA256SUMS entry", () => {
  const root = mkdtempSync(join(tmpdir(), "favicon-archive-"));
  const archive = join(root, "extension.zip");
  const checksums = join(root, "SHA256SUMS");
  writeFileSync(archive, "archive");

  const digest = writeChecksumFile(archive, checksums);
  assert.equal(readFileSync(checksums, "utf8"), `${digest}  extension.zip\n`);
});

test("requires exactly one package archive", () => {
  const root = mkdtempSync(join(tmpdir(), "favicon-dist-"));
  mkdirSync(join(root, "dist"));
  assert.throws(() => findSingleArchive(join(root, "dist")), /found 0/);

  writeFileSync(join(root, "dist", "one.zip"), "one");
  assert.equal(findSingleArchive(join(root, "dist")), join(root, "dist", "one.zip"));

  writeFileSync(join(root, "dist", "two.zip"), "two");
  assert.throws(() => findSingleArchive(join(root, "dist")), /found 2/);
});

test("runs the package command twice with one stable source epoch", () => {
  const root = mkdtempSync(join(tmpdir(), "favicon-package-project-"));
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify({
      name: "package-fixture",
      version: "1.0.0",
      private: true,
      scripts: { "package:extension": "node package.mjs" }
    }, null, 2)}\n`
  );
  writeFileSync(
    join(root, "package.mjs"),
    `import { mkdirSync, writeFileSync } from "node:fs";\nmkdirSync("dist", { recursive: true });\nwriteFileSync("dist/fixture.zip", \`epoch=\${process.env.SOURCE_DATE_EPOCH}\\n\`);\n`
  );

  return import("../scripts/verify-package.mjs").then(({ verifyPackage }) => {
    const result = verifyPackage(root, "1704067200");
    assert.equal(result.archive, "dist/fixture.zip");
    assert.equal(result.sourceDateEpoch, "1704067200");
    assert.match(readFileSync(join(root, "dist", "SHA256SUMS"), "utf8"), /^[a-f0-9]{64}  fixture\.zip\n$/);
  });
});
