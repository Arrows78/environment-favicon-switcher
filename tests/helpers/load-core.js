"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const ROOT = path.resolve(__dirname, "../..");
const DEFAULTS_SOURCE = fs.readFileSync(
  path.join(ROOT, "config/defaults.js"),
  "utf8",
);
const SHARED_SOURCE = fs.readFileSync(path.join(ROOT, "src/shared.js"), "utf8");

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createMemoryChrome({ sync = true } = {}) {
  const stores = { local: {}, sync: {} };
  const changeListeners = [];
  const runtime = {
    lastError: null,
    getURL: (resourcePath) =>
      `chrome-extension://test/${String(resourcePath).replace(/^\//, "")}`,
  };

  function createArea(areaName) {
    return {
      get(keys, callback) {
        const result = {};
        if (keys === null || keys === undefined) {
          Object.assign(result, clone(stores[areaName]));
        } else if (typeof keys === "string") {
          if (Object.prototype.hasOwnProperty.call(stores[areaName], keys)) {
            result[keys] = clone(stores[areaName][keys]);
          }
        } else if (Array.isArray(keys)) {
          keys.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(stores[areaName], key)) {
              result[key] = clone(stores[areaName][key]);
            }
          });
        } else {
          Object.entries(keys).forEach(([key, fallback]) => {
            result[key] = Object.prototype.hasOwnProperty.call(
              stores[areaName],
              key,
            )
              ? clone(stores[areaName][key])
              : clone(fallback);
          });
        }
        queueMicrotask(() => callback(result));
      },
      set(values, callback = () => {}) {
        const changes = {};
        Object.entries(values).forEach(([key, value]) => {
          changes[key] = {
            oldValue: clone(stores[areaName][key]),
            newValue: clone(value),
          };
          stores[areaName][key] = clone(value);
        });
        queueMicrotask(() => {
          callback();
          changeListeners.forEach((listener) => listener(changes, areaName));
        });
      },
      remove(keys, callback = () => {}) {
        const changes = {};
        const list = Array.isArray(keys) ? keys : [keys];
        list.forEach((key) => {
          changes[key] = {
            oldValue: clone(stores[areaName][key]),
            newValue: undefined,
          };
          delete stores[areaName][key];
        });
        queueMicrotask(() => {
          callback();
          changeListeners.forEach((listener) => listener(changes, areaName));
        });
      },
    };
  }

  const storage = {
    local: createArea("local"),
    onChanged: {
      addListener(listener) {
        changeListeners.push(listener);
      },
    },
  };
  if (sync) storage.sync = createArea("sync");

  return {
    chrome: { runtime, storage },
    stores,
    changeListeners,
  };
}

function loadCore(options = {}) {
  const memory = options.chrome
    ? {
        chrome: options.chrome,
        stores: options.stores || { local: {}, sync: {} },
      }
    : createMemoryChrome(options);
  const context = {
    URL,
    TextEncoder,
    TextDecoder,
    structuredClone,
    crypto: webcrypto,
    console,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    chrome: memory.chrome,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(DEFAULTS_SOURCE, context, { filename: "config/defaults.js" });
  vm.runInContext(SHARED_SOURCE, context, { filename: "src/shared.js" });

  return {
    EnvFavicon: context.EnvFavicon,
    DEFAULT_SETTINGS: context.DEFAULT_SETTINGS,
    stores: memory.stores,
    chrome: memory.chrome,
    context,
  };
}

function plain(value) {
  return clone(value);
}

module.exports = {
  ROOT,
  createMemoryChrome,
  loadCore,
  plain,
};
