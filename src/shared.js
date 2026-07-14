/* global DEFAULT_SETTINGS */
const api = globalThis.browser || globalThis.chrome;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix = "rule") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function callApi(fn, ...args) {
  return new Promise((resolve, reject) => {
    try {
      const maybePromise = fn(...args, (result) => {
        const lastError = api.runtime?.lastError;
        if (lastError) reject(lastError);
        else resolve(result);
      });
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(resolve, reject);
      }
    } catch (error) {
      try {
        const maybePromise = fn(...args);
        if (maybePromise && typeof maybePromise.then === "function") maybePromise.then(resolve, reject);
        else resolve(maybePromise);
      } catch (fallbackError) {
        reject(fallbackError);
      }
    }
  });
}

function normalizeGroup(group) {
  return {
    id: group.id || makeId("group"),
    name: String(group.name || "Group").trim() || "Group",
    color: /^#[0-9a-f]{6}$/i.test(group.color || "") ? group.color : "#64748b"
  };
}

function normalizeRule(rule) {
  return {
    id: rule.id || makeId(),
    groupId: rule.groupId || null,
    enabled: rule.enabled !== false,
    name: rule.name || "New environment",
    label: rule.label || "ENV",
    color: rule.color || "#64748b",
    matchType: ["contains", "hostname", "regex"].includes(rule.matchType) ? rule.matchType : "contains",
    patterns: Array.isArray(rule.patterns) ? rule.patterns.filter(Boolean) : [],
    favicon: rule.favicon || "",
    keepOriginalFavicon: Boolean(rule.keepOriginalFavicon)
  };
}

function normalizeSettings(settings) {
  const defaults = clone(DEFAULT_SETTINGS);
  const merged = {
    ...defaults,
    ...(settings || {}),
    groups: Array.isArray(settings?.groups) ? settings.groups.map(normalizeGroup) : (defaults.groups || []).map(normalizeGroup),
    rules: Array.isArray(settings?.rules) ? settings.rules.map(normalizeRule) : defaults.rules.map(normalizeRule)
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

async function getStorage(keys) {
  return callApi(api.storage.local.get.bind(api.storage.local), keys);
}

async function setStorage(values) {
  return callApi(api.storage.local.set.bind(api.storage.local), values);
}

async function getSettings() {
  const stored = await getStorage(["settings"]);
  const settings = normalizeSettings(stored?.settings);
  if (!stored?.settings) {
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
  try {
    const result = api.runtime.sendMessage(message);
    if (result && typeof result.catch === "function") result.catch(() => {});
  } catch (_) {}
}

function faviconToUrl(favicon) {
  if (!favicon) return "";
  if (/^(https?:|data:|blob:|moz-extension:|chrome-extension:)/i.test(favicon)) return favicon;
  return api.runtime.getURL(favicon.replace(/^\//, ""));
}

function parseUrl(url) {
  try {
    return new URL(url);
  } catch (_) {
    return null;
  }
}

function patternMatches(url, parsedUrl, rule) {
  const patterns = rule.patterns || [];
  return patterns.some((rawPattern) => {
    const pattern = String(rawPattern || "").trim();
    if (!pattern) return false;

    if (rule.matchType === "regex") {
      try {
        return new RegExp(pattern, "i").test(url);
      } catch (_) {
        return false;
      }
    }

    if (rule.matchType === "hostname") {
      if (!parsedUrl) return false;
      const hostname = parsedUrl.hostname.toLowerCase();
      const normalizedPattern = pattern.toLowerCase().replace(/^\*\./, "");
      return hostname === normalizedPattern || hostname.endsWith(`.${normalizedPattern}`);
    }

    return url.toLowerCase().includes(pattern.toLowerCase());
  });
}

function findMatchingRule(url, settings) {
  if (!settings.enabled) return null;
  const parsedUrl = parseUrl(url);
  return (settings.rules || []).find((rule) => rule.enabled && patternMatches(url, parsedUrl, rule)) || null;
}

globalThis.EnvFavicon = {
  api,
  callApi,
  clone,
  makeId,
  normalizeGroup,
  normalizeRule,
  normalizeSettings,
  getSettings,
  saveSettings,
  faviconToUrl,
  sendMessageSafe,
  findMatchingRule
};
