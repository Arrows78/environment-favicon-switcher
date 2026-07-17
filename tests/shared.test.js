"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadCore, plain } = require("./helpers/load-core.js");

test("normalization migrates rules to schema version 2", () => {
  const { EnvFavicon } = loadCore();
  const settings = EnvFavicon.normalizeSettings({
    enabled: true,
    groups: [{ id: "known", name: "Known" }],
    rules: [{ id: "legacy", name: "Legacy", groupId: "missing", patterns: [" test "] }]
  });

  assert.equal(settings.schemaVersion, 2);
  assert.equal(settings.rules[0].priority, 0);
  assert.deepEqual(plain(settings.rules[0].excludePatterns), []);
  assert.deepEqual(plain(settings.rules[0].patterns), ["test"]);
  assert.equal(settings.rules[0].groupId, null);
});

test("hostname matching respects domain boundaries", () => {
  const { EnvFavicon } = loadCore();
  const rule = EnvFavicon.normalizeRule({
    id: "domain",
    matchType: "hostname",
    patterns: ["example.com"]
  });

  assert.equal(EnvFavicon.evaluateRule("https://example.com", rule).matched, true);
  assert.equal(EnvFavicon.evaluateRule("https://app.example.com/path", rule).matched, true);
  assert.equal(EnvFavicon.evaluateRule("https://example.com.evil.test", rule).matched, false);
  assert.equal(EnvFavicon.evaluateRule("https://notexample.com", rule).matched, false);
});

test("glob matching supports stars and single-character wildcards", () => {
  const { EnvFavicon } = loadCore();
  assert.equal(
    EnvFavicon.matchPattern(
      "https://review-42.example.com/app/a",
      new URL("https://review-42.example.com/app/a"),
      "glob",
      "https://review-??.example.com/app/*"
    ).matched,
    true
  );
  assert.equal(
    EnvFavicon.matchPattern(
      "https://review-7.example.com/app/a",
      new URL("https://review-7.example.com/app/a"),
      "glob",
      "https://review-??.example.com/app/*"
    ).matched,
    false
  );
});

test("invalid and oversized regular expressions are reported without throwing", () => {
  const { EnvFavicon } = loadCore();
  const invalid = EnvFavicon.normalizeRule({
    id: "invalid",
    matchType: "regex",
    patterns: ["["]
  });
  const oversized = EnvFavicon.normalizeRule({
    id: "oversized",
    matchType: "regex",
    patterns: ["a".repeat(1001)]
  });

  assert.equal(EnvFavicon.evaluateRule("https://example.test", invalid).matched, false);
  assert.equal(EnvFavicon.validateRule(invalid)[0].code, "invalid-pattern");
  assert.equal(EnvFavicon.validateRule(oversized)[0].code, "regex-too-long");
});

test("exclusion patterns veto an otherwise matching rule", () => {
  const { EnvFavicon } = loadCore();
  const rule = EnvFavicon.normalizeRule({
    id: "sandbox",
    matchType: "contains",
    patterns: ["sandbox.example.com"],
    excludePatterns: ["uat.sandbox.example.com"]
  });

  const evaluation = EnvFavicon.evaluateRule("https://uat.sandbox.example.com", rule);
  assert.equal(evaluation.matched, false);
  assert.equal(evaluation.includedBy, "sandbox.example.com");
  assert.equal(evaluation.excludedBy, "uat.sandbox.example.com");
});

test("highest priority wins and rule order breaks ties", () => {
  const { EnvFavicon } = loadCore();
  const settings = EnvFavicon.normalizeSettings({
    enabled: true,
    groups: [],
    rules: [
      { id: "first", name: "First", priority: 10, patterns: ["example"] },
      { id: "higher", name: "Higher", priority: 20, patterns: ["example"] },
      { id: "tie-later", name: "Tie later", priority: 20, patterns: ["example"] }
    ]
  });

  const diagnosis = EnvFavicon.diagnoseUrl("https://example.test", settings);
  assert.equal(diagnosis.winner.id, "higher");
  assert.deepEqual(plain(diagnosis.matches.map(({ rule }) => rule.id)), ["higher", "tie-later", "first"]);
  assert.equal(diagnosis.hasConflict, true);
});

test("global disablement suppresses every matching rule", () => {
  const { EnvFavicon } = loadCore();
  const settings = EnvFavicon.normalizeSettings({
    enabled: false,
    groups: [],
    rules: [{ id: "match", patterns: ["example"] }]
  });

  const diagnosis = EnvFavicon.diagnoseUrl("https://example.test", settings);
  assert.equal(diagnosis.winner, null);
  assert.equal(diagnosis.matches.length, 0);
});

test("generated favicons sanitize labels and choose readable text", () => {
  const { EnvFavicon } = loadCore();
  const favicon = EnvFavicon.createGeneratedFavicon("<script>alert(1)</script>", "#ffffff");
  const decoded = decodeURIComponent(favicon);

  assert.match(favicon, /^data:image\/svg\+xml,/);
  assert.doesNotMatch(decoded, /<script>/i);
  assert.match(decoded, /fill="\#0f172a"/);
});

test("versioned and legacy imports normalize consistently", () => {
  const { EnvFavicon, DEFAULT_SETTINGS } = loadCore();
  const payload = EnvFavicon.createExportPayload(DEFAULT_SETTINGS);
  const versioned = EnvFavicon.parseImportPayload(payload);
  const legacy = EnvFavicon.parseImportPayload(DEFAULT_SETTINGS);

  assert.equal(payload.format, "environment-favicon-switcher");
  assert.equal(versioned.rules.length, DEFAULT_SETTINGS.rules.length);
  assert.equal(legacy.rules.length, DEFAULT_SETTINGS.rules.length);
  assert.throws(() => EnvFavicon.parseImportPayload([]), (error) => error.name === "TypeError");
});

test("merge imports replace matching ids and append new rules", () => {
  const { EnvFavicon } = loadCore();
  const current = EnvFavicon.normalizeSettings({
    groups: [{ id: "team", name: "Team" }],
    rules: [
      { id: "same", name: "Old", patterns: ["old"] },
      { id: "kept", name: "Kept", patterns: ["kept"] }
    ]
  });
  const imported = EnvFavicon.normalizeSettings({
    groups: [{ id: "team", name: "Renamed" }],
    rules: [
      { id: "same", name: "New", patterns: ["new"] },
      { id: "added", name: "Added", patterns: ["added"] }
    ]
  });

  const merged = EnvFavicon.mergeSettings(current, imported);
  assert.equal(merged.groups.find(({ id }) => id === "team").name, "Renamed");
  assert.deepEqual(plain(merged.rules.map(({ id }) => id)), ["same", "kept", "added"]);
  assert.equal(merged.rules[0].name, "New");
});

test("synchronized settings round-trip in quota-safe chunks and are adopted by a new profile", async () => {
  const { EnvFavicon, DEFAULT_SETTINGS, stores } = loadCore();
  const settings = EnvFavicon.normalizeSettings(DEFAULT_SETTINGS);
  settings.rules[0].name = "Synchronized";

  await EnvFavicon.setStoragePreference("sync", settings);
  assert.equal(stores.sync[EnvFavicon.SYNC_PREFERENCE_KEY], true);
  assert.ok(stores.sync[EnvFavicon.SYNC_MANIFEST_KEY].chunks >= 1);

  stores.local = {};
  const preference = await EnvFavicon.getStoragePreference();
  const loaded = await EnvFavicon.getSettings();
  assert.equal(preference, "sync");
  assert.equal(loaded.rules[0].name, "Synchronized");
});

test("corrupt synchronized data falls back to the local backup", async () => {
  const { EnvFavicon, DEFAULT_SETTINGS, stores } = loadCore();
  const settings = EnvFavicon.normalizeSettings(DEFAULT_SETTINGS);
  settings.rules[0].name = "Local backup";
  await EnvFavicon.setStoragePreference("sync", settings);

  stores.sync[`${EnvFavicon.SYNC_CHUNK_PREFIX}_0`] = "corrupt";
  const loaded = await EnvFavicon.getSettings();
  const status = await EnvFavicon.getStorageStatus(loaded);

  assert.equal(loaded.rules[0].name, "Local backup");
  assert.equal(await EnvFavicon.getStoragePreference(), "local");
  assert.equal(status.lastError, "sync-corrupt");
});

test("oversized synchronized data is rejected while the local copy is preserved", async () => {
  const { EnvFavicon, DEFAULT_SETTINGS, stores } = loadCore();
  const settings = EnvFavicon.normalizeSettings(DEFAULT_SETTINGS);
  settings.rules[0].favicon = `data:image/png;base64,${"a".repeat(EnvFavicon.MAX_SYNC_BYTES + 1)}`;

  await assert.rejects(
    EnvFavicon.setStoragePreference("sync", settings),
    (error) => error.code === "sync-too-large"
  );
  assert.equal(await EnvFavicon.getStoragePreference(), "local");
  assert.equal(stores.local.settings.rules[0].favicon, settings.rules[0].favicon);
});

test("UTF-8 chunks stay within the configured byte limit", () => {
  const { EnvFavicon } = loadCore();
  const chunks = EnvFavicon.splitUtf8("e".repeat(6999) + "\u{1F680}" + "z");

  assert.equal(chunks.join(""), "e".repeat(6999) + "\u{1F680}" + "z");
  chunks.forEach((chunk) => assert.ok(EnvFavicon.byteLength(chunk) <= 7000));
});

test("versioned imports reject unsupported formats and non-object settings", () => {
  const { EnvFavicon, DEFAULT_SETTINGS } = loadCore();

  assert.throws(
    () => EnvFavicon.parseImportPayload({
      format: "environment-favicon-switcher",
      version: 99,
      settings: DEFAULT_SETTINGS
    }),
    /version is unsupported/
  );
  assert.throws(
    () => EnvFavicon.parseImportPayload({
      format: "environment-favicon-switcher",
      version: 1,
      settings: []
    }),
    /does not contain settings/
  );
});

test("structurally invalid synchronized JSON falls back to the local backup", async () => {
  const { EnvFavicon, DEFAULT_SETTINGS, stores } = loadCore();
  const settings = EnvFavicon.normalizeSettings(DEFAULT_SETTINGS);
  settings.rules[0].name = "Safe local copy";
  await EnvFavicon.setStoragePreference("sync", settings);

  stores.sync[`${EnvFavicon.SYNC_CHUNK_PREFIX}_0`] = "null";
  stores.sync[EnvFavicon.SYNC_MANIFEST_KEY] = {
    ...stores.sync[EnvFavicon.SYNC_MANIFEST_KEY],
    chunks: 1,
    checksum: "77074ba4"
  };

  const loaded = await EnvFavicon.getSettings();
  assert.equal(loaded.rules[0].name, "Safe local copy");
  assert.equal(await EnvFavicon.getStoragePreference(), "local");
  assert.equal((await EnvFavicon.getStorageStatus(loaded)).lastError, "sync-corrupt");
});
