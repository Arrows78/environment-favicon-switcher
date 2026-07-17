import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IGNORED_DIRECTORIES = new Set([".git", "coverage", "dist", "node_modules"]);
const errors = [];

function relative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function fail(message) {
  errors.push(message);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch (_) {
    return false;
  }
}

async function walk(directory = ROOT) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolutePath));
    else if (entry.isFile()) files.push(absolutePath);
  }
  return files;
}

function collectMessageReferences(value, destination) {
  if (typeof value === "string") {
    for (const match of value.matchAll(/__MSG_([A-Za-z0-9_@-]+)__/g)) destination.add(match[1]);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectMessageReferences(item, destination));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectMessageReferences(item, destination));
  }
}

function globToRegExp(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*")
    .replaceAll("?", ".");
  return new RegExp(`^${escaped}$`);
}

async function validateReferencedPath(reference, context, allRelativeFiles) {
  if (!reference || /^(?:[a-z]+:|#|\/\/)/i.test(reference)) return;
  const cleanReference = reference.split(/[?#]/, 1)[0].replace(/^\.\//, "");
  if (!cleanReference) return;

  if (cleanReference.includes("*")) {
    const expression = globToRegExp(cleanReference);
    if (!allRelativeFiles.some((file) => expression.test(file))) {
      fail(`${context} references an empty glob: ${reference}`);
    }
    return;
  }

  const absolutePath = path.resolve(ROOT, cleanReference);
  if (!absolutePath.startsWith(`${ROOT}${path.sep}`) || !await exists(absolutePath)) {
    fail(`${context} references a missing file: ${reference}`);
  }
}

const files = await walk();
const relativeFiles = files.map(relative).sort();
const sourceFiles = files.filter((file) => /\.(?:c?js|mjs)$/.test(file));
const jsonFiles = files.filter((file) => file.endsWith(".json"));
const htmlFiles = files.filter((file) => file.endsWith(".html"));

for (const file of sourceFiles) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: ROOT,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    fail(`${relative(file)} contains invalid JavaScript:\n${(result.stderr || result.stdout).trim()}`);
  }
}

const parsedJson = new Map();
for (const file of jsonFiles) {
  try {
    parsedJson.set(relative(file), JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    fail(`${relative(file)} contains invalid JSON: ${error.message}`);
  }
}

const manifest = parsedJson.get("manifest.json");
const packageJson = parsedJson.get("package.json");
if (!manifest) fail("manifest.json could not be parsed.");
if (!packageJson) fail("package.json could not be parsed.");

if (manifest && packageJson) {
  if (manifest.manifest_version !== 3) fail("manifest.json must use Manifest V3.");
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version || "")) {
    fail("manifest.json must contain a three-part numeric version.");
  }
  if (manifest.version !== packageJson.version) {
    fail(`Version mismatch: manifest ${manifest.version}, package ${packageJson.version}.`);
  }

  const references = [];
  Object.values(manifest.icons || {}).forEach((value) => references.push([value, "manifest icons"]));
  Object.values(manifest.action?.default_icon || {}).forEach((value) => references.push([value, "action icons"]));
  references.push([manifest.action?.default_popup, "action popup"]);
  references.push([manifest.options_ui?.page, "options page"]);
  (manifest.background?.scripts || []).forEach((value) => references.push([value, "background scripts"]));
  references.push([manifest.background?.service_worker, "background service worker"]);
  (manifest.content_scripts || []).flatMap((entry) => entry.js || [])
    .forEach((value) => references.push([value, "content scripts"]));
  (manifest.web_accessible_resources || []).flatMap((entry) => entry.resources || [])
    .forEach((value) => references.push([value, "web-accessible resources"]));

  for (const [reference, context] of references) {
    await validateReferencedPath(reference, context, relativeFiles);
  }
}

for (const file of htmlFiles) {
  const content = await readFile(file, "utf8");
  for (const match of content.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    await validateReferencedPath(match[1], relative(file), relativeFiles);
  }
}

const localeRoot = path.join(ROOT, "_locales");
const localeDirectories = (await readdir(localeRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const localeMessages = new Map();
for (const locale of localeDirectories) {
  const localePath = `_locales/${locale}/messages.json`;
  const messages = parsedJson.get(localePath);
  if (!messages || typeof messages !== "object" || Array.isArray(messages)) {
    fail(`${localePath} must contain a message object.`);
    continue;
  }
  for (const [key, descriptor] of Object.entries(messages)) {
    if (!descriptor || typeof descriptor.message !== "string" || !descriptor.message.trim()) {
      fail(`${localePath} has an invalid message for key "${key}".`);
    }
  }
  localeMessages.set(locale, messages);
}

const defaultLocale = manifest?.default_locale;
const canonicalMessages = localeMessages.get(defaultLocale);
if (!canonicalMessages) {
  fail(`Default locale "${defaultLocale || "(missing)"}" is unavailable.`);
} else {
  const canonicalKeys = Object.keys(canonicalMessages).sort();
  for (const [locale, messages] of localeMessages) {
    const localeKeys = Object.keys(messages).sort();
    const missing = canonicalKeys.filter((key) => !localeKeys.includes(key));
    const extra = localeKeys.filter((key) => !canonicalKeys.includes(key));
    if (missing.length) fail(`Locale ${locale} is missing: ${missing.join(", ")}.`);
    if (extra.length) fail(`Locale ${locale} has unexpected keys: ${extra.join(", ")}.`);
  }

  const usedMessageKeys = new Set();
  collectMessageReferences(manifest, usedMessageKeys);
  for (const file of htmlFiles) {
    const content = await readFile(file, "utf8");
    for (const match of content.matchAll(/\bdata-i18n(?:-[a-z-]+)?=["']([^"']+)["']/gi)) {
      usedMessageKeys.add(match[1]);
    }
  }
  for (const file of sourceFiles.filter((item) => relative(item).startsWith("src/"))) {
    const content = await readFile(file, "utf8");
    for (const match of content.matchAll(/(?:^|[^A-Za-z0-9_$])t\(\s*["'`]([^"'`]+)["'`]/gm)) {
      usedMessageKeys.add(match[1]);
    }
  }
  const unknown = [...usedMessageKeys].filter((key) => !canonicalMessages[key]).sort();
  if (unknown.length) fail(`Unknown localization keys are referenced: ${unknown.join(", ")}.`);
}

for (const file of sourceFiles.filter((item) => relative(item).startsWith("src/"))) {
  const content = await readFile(file, "utf8");
  if (/\.\s*innerHTML\s*=|\binsertAdjacentHTML\s*\(/.test(content)) {
    fail(`${relative(file)} uses an unsafe HTML injection sink.`);
  }
  if (/\beval\s*\(|\bnew\s+Function\s*\(/.test(content)) {
    fail(`${relative(file)} uses dynamic code execution.`);
  }
}

try {
  const require = createRequire(import.meta.url);
  const { loadCore } = require("../tests/helpers/load-core.js");
  const { EnvFavicon, DEFAULT_SETTINGS } = loadCore();
  const settings = EnvFavicon.normalizeSettings(DEFAULT_SETTINGS);
  const validationIssues = EnvFavicon.validateSettings(settings);
  if (validationIssues.length) {
    fail(`Default settings contain ${validationIssues.length} validation issue(s).`);
  }

  const groupIds = settings.groups.map(({ id }) => id);
  const ruleIds = settings.rules.map(({ id }) => id);
  if (new Set(groupIds).size !== groupIds.length) fail("Default groups contain duplicate ids.");
  if (new Set(ruleIds).size !== ruleIds.length) fail("Default rules contain duplicate ids.");

  for (const rule of settings.rules) {
    if (rule.favicon && !rule.favicon.startsWith("data:")) {
      await validateReferencedPath(rule.favicon, `default rule ${rule.id}`, relativeFiles);
    }
  }
} catch (error) {
  fail(`Unable to validate default settings: ${error.stack || error.message}`);
}

for (const file of files) {
  const information = await stat(file);
  if (information.size > 5 * 1024 * 1024) {
    fail(`${relative(file)} exceeds the 5 MiB repository file limit.`);
  }
}

if (errors.length) {
  console.error(`Validation failed with ${errors.length} issue(s):`);
  errors.forEach((error, index) => console.error(`${index + 1}. ${error}`));
  process.exitCode = 1;
} else {
  console.log(`Validated ${sourceFiles.length} JavaScript files, ${jsonFiles.length} JSON files, ${htmlFiles.length} HTML files and ${localeDirectories.length} locales.`);
}
