"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SOURCE = fs.readFileSync(path.resolve(__dirname, "../src/background.js"), "utf8");

function createEvent() {
  const listeners = [];
  return {
    addListener(listener) {
      listeners.push(listener);
    },
    emit(...args) {
      return listeners.map((listener) => listener(...args));
    }
  };
}

function loadBackground() {
  const calls = [];
  const events = {
    installed: createEvent(),
    message: createEvent(),
    storage: createEvent(),
    tabUpdated: createEvent()
  };
  const action = {};
  for (const method of ["setBadgeText", "setBadgeBackgroundColor", "setTitle"]) {
    action[method] = (details) => {
      calls.push({ method, details: JSON.parse(JSON.stringify(details)) });
    };
  }

  const extensionApi = {
    action,
    i18n: { getMessage: () => "" },
    runtime: {
      onInstalled: events.installed,
      onMessage: events.message
    },
    storage: { onChanged: events.storage },
    tabs: { onUpdated: events.tabUpdated }
  };
  const EnvFavicon = {
    api: extensionApi,
    SYNC_PREFERENCE_KEY: "settingsSyncEnabled",
    STORAGE_PREFERENCE_KEY: "storagePreference",
    SYNC_MANIFEST_KEY: "settingsSyncManifest",
    SYNC_CHUNK_PREFIX: "settingsSyncChunk",
    callApi(fn, ...args) {
      return Promise.resolve(fn(...args));
    },
    getSettings: async () => ({ enabled: true, rules: [] }),
    saveSettings: async (settings) => settings,
    setStorage: async () => undefined
  };

  const context = {
    EnvFavicon,
    console,
    setTimeout,
    clearTimeout
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(SOURCE, context, { filename: "src/background.js" });
  return { calls, events };
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("tab navigation clears the previous page badge and title state", async () => {
  const { calls, events } = loadBackground();

  events.tabUpdated.emit(42, { status: "loading" });
  await flush();

  assert.deepEqual(calls, [
    { method: "setBadgeText", details: { tabId: 42, text: "" } },
    {
      method: "setTitle",
      details: { tabId: 42, title: "Environment Favicon Switcher" }
    }
  ]);
});

test("irrelevant tab updates do not reset the toolbar action", async () => {
  const { calls, events } = loadBackground();

  events.tabUpdated.emit(42, { favIconUrl: "https://example.test/favicon.ico" });
  await flush();

  assert.deepEqual(calls, []);
});

test("content status updates badge text, color and tooltip", async () => {
  const { calls, events } = loadBackground();

  events.message.emit({
    type: "ENV_FAVICON_STATUS",
    enabled: true,
    rule: { name: "Review", label: "review", color: "#8b5cf6" },
    matchCount: 1,
    hasConflict: false
  }, { tab: { id: 9 } });
  await flush();

  assert.deepEqual(calls, [
    { method: "setBadgeText", details: { tabId: 9, text: "REVI" } },
    { method: "setBadgeBackgroundColor", details: { tabId: 9, color: "#8b5cf6" } },
    { method: "setTitle", details: { tabId: 9, title: "Detected: Review" } }
  ]);
});
