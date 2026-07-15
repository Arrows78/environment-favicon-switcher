/* global DEFAULT_SETTINGS */
(() => {
  "use strict";

  const api = globalThis.browser || globalThis.chrome || null;
  const SETTINGS_SCHEMA_VERSION = 2;
  const SUPPORTED_MATCH_TYPES = new Set(["contains", "hostname", "glob", "regex"]);
  const DEFAULT_COLOR = "#64748b";
  const MAX_REGEX_LENGTH = 1000;

  function clone(value) {
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch (_) {}
    }
    return JSON.parse(JSON.stringify(value));
  }

  function makeId(prefix = "rule") {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function callApi(fn, ...args) {
    if (typeof fn !== "function") return Promise.reject(new TypeError("A browser API function is required."));

    if (globalThis.browser && api === globalThis.browser) {
      try {
        return Promise.resolve(fn(...args));
      } catch (error) {
        return Promise.reject(error);
      }
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (handler, value) => {
        if (settled) return;
        settled = true;
        handler(value);
      };
      const callback = (result) => {
        const lastError = api?.runtime?.lastError;
        if (lastError) {
          settle(reject, new Error(lastError.message || String(lastError)));
          return;
        }
        settle(resolve, result);
      };

      try {
        const maybePromise = fn(...args, callback);
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.then(
            (result) => settle(resolve, result),
            (error) => settle(reject, error)
          );
        }
      } catch (error) {
        settle(reject, error);
      }
    });
  }

  function normalizeString(value, fallback = "") {
    const normalized = String(value ?? "").trim();
    return normalized || fallback;
  }

  function normalizeColor(value, fallback = DEFAULT_COLOR) {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
  }

  function normalizeInteger(value, fallback = 0, minimum = -999, maximum = 999) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(maximum, Math.max(minimum, parsed));
  }

  function normalizePatterns(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((pattern) => String(pattern ?? "").trim())
      .filter(Boolean);
  }

  function normalizeGroup(group = {}) {
    return {
      id: normalizeString(group.id, makeId("group")),
      name: normalizeString(group.name, "Group"),
      color: normalizeColor(group.color)
    };
  }

  function normalizeRule(rule = {}) {
    return {
      id: normalizeString(rule.id, makeId("rule")),
      groupId: normalizeString(rule.groupId) || null,
      enabled: rule.enabled !== false,
      name: normalizeString(rule.name, "New environment"),
      label: normalizeString(rule.label, "ENV").slice(0, 12),
      color: normalizeColor(rule.color),
      priority: normalizeInteger(rule.priority),
      matchType: SUPPORTED_MATCH_TYPES.has(rule.matchType) ? rule.matchType : "contains",
      patterns: normalizePatterns(rule.patterns),
      excludePatterns: normalizePatterns(rule.excludePatterns),
      favicon: String(rule.favicon || "").trim(),
      keepOriginalFavicon: Boolean(rule.keepOriginalFavicon)
    };
  }

  function normalizeSettings(settings) {
    const defaults = clone(globalThis.DEFAULT_SETTINGS || {
      enabled: true,
      titlePrefixEnabled: false,
      reapplyOnChanges: true,
      debug: false,
      groups: [],
      rules: []
    });
    const source = settings && typeof settings === "object" ? settings : {};
    const merged = {
      ...defaults,
      ...source,
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      groups: Array.isArray(source.groups)
        ? source.groups.map(normalizeGroup)
        : (defaults.groups || []).map(normalizeGroup),
      rules: Array.isArray(source.rules)
        ? source.rules.map(normalizeRule)
        : (defaults.rules || []).map(normalizeRule)
    };

    const groupIds = new Set(merged.groups.map((group) => group.id));
    merged.rules.forEach((rule) => {
      if (rule.groupId && !groupIds.has(rule.groupId)) rule.groupId = null;
    });

    merged.enabled = merged.enabled !== false;
    merged.titlePrefixEnabled = Boolean(merged.titlePrefixEnabled);
    merged.reapplyOnChanges = merged.reapplyOnChanges !== false;
    merged.debug = Boolean(merged.debug);
    return merged;
  }

  function requireStorageArea(areaName = "local") {
    const storageArea = api?.storage?.[areaName];
    if (!storageArea) throw new Error(`Browser storage area "${areaName}" is unavailable.`);
    return storageArea;
  }

  async function getStorage(keys, areaName = "local") {
    const storageArea = requireStorageArea(areaName);
    return callApi(storageArea.get.bind(storageArea), keys);
  }

  async function setStorage(values, areaName = "local") {
    const storageArea = requireStorageArea(areaName);
    return callApi(storageArea.set.bind(storageArea), values);
  }

  async function getSettings() {
    const stored = await getStorage(["settings"]);
    const settings = normalizeSettings(stored?.settings);
    if (!stored?.settings || stored.settings.schemaVersion !== SETTINGS_SCHEMA_VERSION) {
      await setStorage({ settings });
    }
    return settings;
  }

  async function saveSettings(settings) {
    const normalized = normalizeSettings(settings);
    await setStorage({ settings: normalized });
    return normalized;
  }

  function sendMessageSafe(message) {
    if (!api?.runtime?.sendMessage) return;
    try {
      const result = api.runtime.sendMessage(message);
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch (_) {}
  }

  function faviconToUrl(favicon) {
    if (!favicon) return "";
    if (/^(https?:|data:|blob:|moz-extension:|chrome-extension:)/i.test(favicon)) return favicon;
    return api?.runtime?.getURL ? api.runtime.getURL(favicon.replace(/^\//, "")) : favicon;
  }

  function escapeXml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function readableTextColor(backgroundColor) {
    const color = normalizeColor(backgroundColor).slice(1);
    const red = Number.parseInt(color.slice(0, 2), 16);
    const green = Number.parseInt(color.slice(2, 4), 16);
    const blue = Number.parseInt(color.slice(4, 6), 16);
    const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    return luminance > 0.58 ? "#0f172a" : "#ffffff";
  }

  function createGeneratedFavicon(label, color = DEFAULT_COLOR) {
    const characters = Array.from(normalizeString(label, "ENV"))
      .filter((character) => /[\p{L}\p{N}]/u.test(character))
      .slice(0, 3)
      .join("")
      .toUpperCase() || "ENV";
    const background = normalizeColor(color);
    const foreground = readableTextColor(background);
    const fontSize = characters.length === 1 ? 34 : characters.length === 2 ? 26 : 20;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${background}"/><text x="32" y="34" dominant-baseline="middle" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="${fontSize}" font-weight="800" fill="${foreground}">${escapeXml(characters)}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  function parseUrl(url) {
    try {
      return new URL(String(url || ""));
    } catch (_) {
      return null;
    }
  }

  function normalizeHostnamePattern(pattern) {
    const candidate = String(pattern || "").trim().toLowerCase().replace(/^\*\./, "");
    if (!candidate) return "";

    try {
      const parsed = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
      return parsed.hostname.replace(/\.$/, "");
    } catch (_) {
      return candidate.split("/")[0].replace(/:\d+$/, "").replace(/\.$/, "");
    }
  }

  function globToRegExp(glob) {
    let source = "";
    for (const character of String(glob || "")) {
      if (character === "*") source += ".*";
      else if (character === "?") source += ".";
      else source += character.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
    }
    return new RegExp(`^${source}$`, "i");
  }

  function matchPattern(url, parsedUrl, matchType, rawPattern) {
    const pattern = String(rawPattern || "").trim();
    if (!pattern) return { matched: false, pattern, error: null };

    try {
      if (matchType === "regex") {
        if (pattern.length > MAX_REGEX_LENGTH) {
          return { matched: false, pattern, error: "regex-too-long" };
        }
        return { matched: new RegExp(pattern, "i").test(url), pattern, error: null };
      }

      if (matchType === "hostname") {
        if (!parsedUrl) return { matched: false, pattern, error: "invalid-url" };
        const hostname = parsedUrl.hostname.toLowerCase().replace(/\.$/, "");
        const expected = normalizeHostnamePattern(pattern);
        return {
          matched: Boolean(expected) && (hostname === expected || hostname.endsWith(`.${expected}`)),
          pattern,
          error: null
        };
      }

      if (matchType === "glob") {
        return { matched: globToRegExp(pattern).test(url), pattern, error: null };
      }

      return {
        matched: url.toLowerCase().includes(pattern.toLowerCase()),
        pattern,
        error: null
      };
    } catch (_) {
      return { matched: false, pattern, error: "invalid-pattern" };
    }
  }

  function evaluateRule(url, rule, index = 0) {
    const normalizedUrl = String(url || "");
    const parsedUrl = parseUrl(normalizedUrl);
    const errors = [];
    let includedBy = null;
    let excludedBy = null;

    if (!rule.enabled) {
      return { rule, index, matched: false, includedBy, excludedBy, errors, disabled: true };
    }

    for (const pattern of rule.patterns || []) {
      const result = matchPattern(normalizedUrl, parsedUrl, rule.matchType, pattern);
      if (result.error) errors.push({ pattern, code: result.error, excluded: false });
      if (result.matched && !includedBy) includedBy = pattern;
    }

    if (includedBy) {
      for (const pattern of rule.excludePatterns || []) {
        const result = matchPattern(normalizedUrl, parsedUrl, rule.matchType, pattern);
        if (result.error) errors.push({ pattern, code: result.error, excluded: true });
        if (result.matched && !excludedBy) excludedBy = pattern;
      }
    }

    return {
      rule,
      index,
      matched: Boolean(includedBy) && !excludedBy,
      includedBy,
      excludedBy,
      errors,
      disabled: false
    };
  }

  function compareEvaluations(left, right) {
    const priorityDifference = (right.rule.priority || 0) - (left.rule.priority || 0);
    return priorityDifference || left.index - right.index;
  }

  function diagnoseUrl(url, settings) {
    const normalized = normalizeSettings(settings);
    const evaluations = normalized.rules.map((rule, index) => evaluateRule(url, rule, index));
    const matches = normalized.enabled
      ? evaluations.filter((evaluation) => evaluation.matched).sort(compareEvaluations)
      : [];

    return {
      url: String(url || ""),
      enabled: normalized.enabled,
      validUrl: Boolean(parseUrl(url)),
      winner: matches[0]?.rule || null,
      matches,
      evaluations,
      hasConflict: matches.length > 1
    };
  }

  function findMatchingRules(url, settings) {
    return diagnoseUrl(url, settings).matches.map((evaluation) => evaluation.rule);
  }

  function findMatchingRule(url, settings) {
    return diagnoseUrl(url, settings).winner;
  }

  function validateRule(rule, index = 0) {
    const issues = [];
    if (!rule.patterns.length) issues.push({ code: "missing-patterns", index, ruleId: rule.id });
    if (rule.matchType === "regex") {
      for (const pattern of rule.patterns.concat(rule.excludePatterns)) {
        const result = matchPattern("https://example.test", parseUrl("https://example.test"), "regex", pattern);
        if (result.error) issues.push({ code: result.error, index, ruleId: rule.id, pattern });
      }
    }
    if (!rule.keepOriginalFavicon && !rule.favicon) {
      issues.push({ code: "missing-favicon", index, ruleId: rule.id });
    }
    return issues;
  }

  function validateSettings(settings) {
    const normalized = normalizeSettings(settings);
    return normalized.rules.flatMap((rule, index) => validateRule(rule, index));
  }

  function createExportPayload(settings) {
    return {
      format: "environment-favicon-switcher",
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: normalizeSettings(settings)
    };
  }

  function parseImportPayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new TypeError("The imported configuration must be a JSON object.");
    }
    if (payload.format === "environment-favicon-switcher") {
      if (!payload.settings || typeof payload.settings !== "object") {
        throw new TypeError("The imported configuration does not contain settings.");
      }
      return normalizeSettings(payload.settings);
    }
    return normalizeSettings(payload);
  }

  function mergeSettings(currentSettings, importedSettings) {
    const current = normalizeSettings(currentSettings);
    const imported = normalizeSettings(importedSettings);

    const groupById = new Map(current.groups.map((group) => [group.id, group]));
    imported.groups.forEach((group) => groupById.set(group.id, group));

    const importedRuleById = new Map(imported.rules.map((rule) => [rule.id, rule]));
    const mergedRules = current.rules.map((rule) => importedRuleById.get(rule.id) || rule);
    const currentRuleIds = new Set(current.rules.map((rule) => rule.id));
    imported.rules.forEach((rule) => {
      if (!currentRuleIds.has(rule.id)) mergedRules.push(rule);
    });

    return normalizeSettings({
      ...current,
      groups: Array.from(groupById.values()),
      rules: mergedRules
    });
  }

  globalThis.EnvFavicon = {
    api,
    SETTINGS_SCHEMA_VERSION,
    SUPPORTED_MATCH_TYPES: Array.from(SUPPORTED_MATCH_TYPES),
    callApi,
    clone,
    makeId,
    normalizeColor,
    normalizeGroup,
    normalizeRule,
    normalizeSettings,
    getStorage,
    setStorage,
    getSettings,
    saveSettings,
    faviconToUrl,
    createGeneratedFavicon,
    readableTextColor,
    sendMessageSafe,
    parseUrl,
    globToRegExp,
    matchPattern,
    evaluateRule,
    diagnoseUrl,
    findMatchingRules,
    findMatchingRule,
    validateRule,
    validateSettings,
    createExportPayload,
    parseImportPayload,
    mergeSettings
  };
})();
