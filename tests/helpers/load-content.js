"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { ROOT } = require("./load-core");

const CONTENT_SOURCE = fs.readFileSync(
  path.join(ROOT, "src/content.js"),
  "utf8",
);

const MANAGED_FAVICON_SELECTOR =
  'link[data-environment-favicon-switcher="true"]';

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

function matchesSingleSelector(element, selector) {
  if (!element || element.nodeType !== ELEMENT_NODE) return false;

  const normalizedSelector = selector.trim();
  const tagName = element.tagName.toLowerCase();

  if (normalizedSelector === "title") {
    return tagName === "title";
  }

  if (normalizedSelector === MANAGED_FAVICON_SELECTOR) {
    return (
      tagName === "link" &&
      element.getAttribute("data-environment-favicon-switcher") === "true"
    );
  }

  if (normalizedSelector === 'link[rel~="icon"]') {
    if (tagName !== "link") return false;

    return element.rel.split(/\s+/).filter(Boolean).includes("icon");
  }

  if (normalizedSelector === 'link[rel="shortcut icon"]') {
    return tagName === "link" && element.rel === "shortcut icon";
  }

  return false;
}

function matchesSelector(element, selector) {
  return String(selector)
    .split(",")
    .some((part) => matchesSingleSelector(element, part));
}

function createTestEnvironment(url) {
  const observers = new Set();
  const timerQueue = [];
  const cancelledTimers = new Set();
  const windowListeners = new Map();

  let nextTimerId = 1;

  function queueMutation(record) {
    for (const observer of observers) {
      if (!observer.active || !observer.target) continue;

      const targetIsObserved =
        observer.target === record.target ||
        observer.target.contains(record.target);

      if (targetIsObserved) {
        observer.records.push(record);
      }
    }
  }

  class TestElement {
    constructor(tagName) {
      this.nodeType = ELEMENT_NODE;
      this.tagName = String(tagName).toUpperCase();
      this.nodeName = this.tagName;

      this.parentNode = null;
      this.childNodes = [];
      this.attributes = Object.create(null);
    }

    get parentElement() {
      return this.parentNode;
    }

    get children() {
      return this.childNodes.filter((child) => child.nodeType === ELEMENT_NODE);
    }

    get rel() {
      return this.getAttribute("rel") || "";
    }

    set rel(value) {
      this.setAttribute("rel", value);
    }

    get href() {
      return this.getAttribute("href") || "";
    }

    set href(value) {
      this.setAttribute("href", value);
    }

    get type() {
      return this.getAttribute("type") || "";
    }

    set type(value) {
      this.setAttribute("type", value);
    }

    setAttribute(name, value) {
      const normalizedName = String(name);
      const normalizedValue = String(value);
      const previousValue = this.attributes[normalizedName];

      this.attributes[normalizedName] = normalizedValue;

      if (this.parentNode && previousValue !== normalizedValue) {
        queueMutation({
          type: "attributes",
          target: this,
          attributeName: normalizedName,
          oldValue: previousValue,
          addedNodes: [],
          removedNodes: [],
        });
      }
    }

    getAttribute(name) {
      const normalizedName = String(name);

      return Object.prototype.hasOwnProperty.call(
        this.attributes,
        normalizedName,
      )
        ? this.attributes[normalizedName]
        : null;
    }

    removeAttribute(name) {
      const normalizedName = String(name);

      if (
        !Object.prototype.hasOwnProperty.call(this.attributes, normalizedName)
      ) {
        return;
      }

      const previousValue = this.attributes[normalizedName];
      delete this.attributes[normalizedName];

      if (this.parentNode) {
        queueMutation({
          type: "attributes",
          target: this,
          attributeName: normalizedName,
          oldValue: previousValue,
          addedNodes: [],
          removedNodes: [],
        });
      }
    }

    matches(selector) {
      return matchesSelector(this, selector);
    }

    querySelector(selector) {
      for (const child of this.childNodes) {
        if (child.nodeType === ELEMENT_NODE && child.matches(selector)) {
          return child;
        }

        if (typeof child.querySelector === "function") {
          const nestedMatch = child.querySelector(selector);

          if (nestedMatch) return nestedMatch;
        }
      }

      return null;
    }

    contains(node) {
      if (node === this) return true;

      return this.childNodes.some(
        (child) =>
          child === node ||
          (typeof child.contains === "function" && child.contains(node)),
      );
    }

    appendChild(child) {
      if (child.parentNode) {
        child.parentNode.removeChild(child);
      }

      child.parentNode = this;
      this.childNodes.push(child);

      queueMutation({
        type: "childList",
        target: this,
        addedNodes: [child],
        removedNodes: [],
      });

      return child;
    }

    removeChild(child) {
      const childIndex = this.childNodes.indexOf(child);

      if (childIndex === -1) {
        throw new Error("The node to remove is not a child");
      }

      this.childNodes.splice(childIndex, 1);
      child.parentNode = null;

      queueMutation({
        type: "childList",
        target: this,
        addedNodes: [],
        removedNodes: [child],
      });

      return child;
    }

    remove() {
      this.parentNode?.removeChild(this);
    }
  }

  const documentElement = new TestElement("html");
  const head = new TestElement("head");
  const body = new TestElement("body");

  documentElement.appendChild(head);
  documentElement.appendChild(body);

  let documentTitle = "Test application";

  const document = {
    documentElement,
    head,
    body,

    get title() {
      return documentTitle;
    },

    set title(value) {
      documentTitle = String(value);
    },

    createElement(tagName) {
      return new TestElement(tagName);
    },

    querySelector(selector) {
      if (documentElement.matches(selector)) {
        return documentElement;
      }

      return documentElement.querySelector(selector);
    },
  };

  class TestMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.records = [];
      this.target = null;
      this.active = false;

      observers.add(this);
    }

    observe(target) {
      this.target = target;
      this.active = true;
    }

    disconnect() {
      this.active = false;
      this.records = [];
    }

    takeRecords() {
      const records = this.records.splice(0);
      return records;
    }
  }

  function setTimeoutFake(callback, _delay = 0, ...args) {
    const id = nextTimerId++;

    timerQueue.push({
      id,
      callback,
      args,
    });

    return id;
  }

  function clearTimeoutFake(id) {
    cancelledTimers.add(id);
  }

  async function flushMicrotasks(rounds = 5) {
    for (let index = 0; index < rounds; index += 1) {
      await Promise.resolve();
    }
  }

  async function flushMutations() {
    let iterations = 0;

    while (iterations < 20) {
      iterations += 1;

      const deliveries = Array.from(observers)
        .filter((observer) => observer.active && observer.records.length > 0)
        .map((observer) => ({
          observer,
          records: observer.takeRecords(),
        }));

      if (deliveries.length === 0) break;

      for (const { observer, records } of deliveries) {
        observer.callback(records, observer);
      }

      await flushMicrotasks();
    }

    if (iterations === 20) {
      throw new Error(
        "MutationObserver did not become idle after 20 iterations",
      );
    }
  }

  async function flushTimers() {
    let iterations = 0;

    while (timerQueue.length > 0 && iterations < 20) {
      iterations += 1;

      const timers = timerQueue.splice(0);

      for (const timer of timers) {
        if (cancelledTimers.has(timer.id)) continue;

        timer.callback(...timer.args);
        await flushMicrotasks();
      }
    }

    if (iterations === 20 && timerQueue.length > 0) {
      throw new Error("Timer queue did not become idle after 20 iterations");
    }
  }

  const window = {
    location: {
      href: url,
    },

    navigation: undefined,

    addEventListener(type, listener) {
      const listeners = windowListeners.get(type) || [];
      listeners.push(listener);
      windowListeners.set(type, listeners);
    },

    removeEventListener(type, listener) {
      const listeners = windowListeners.get(type) || [];

      windowListeners.set(
        type,
        listeners.filter((candidate) => candidate !== listener),
      );
    },

    dispatchEvent(event) {
      const listeners = windowListeners.get(event.type) || [];

      for (const listener of listeners) {
        listener.call(window, event);
      }
    },

    setTimeout: setTimeoutFake,
    clearTimeout: clearTimeoutFake,

    // Le content script crée une surveillance périodique.
    // On ne démarre pas de véritable intervalle dans les tests Node.
    setInterval() {
      return nextTimerId++;
    },

    clearInterval() {},
  };

  window.window = window;
  window.self = window;
  window.top = window;
  window.document = document;

  document.defaultView = window;

  const history = {
    pushState(_state, _title, nextUrl) {
      if (nextUrl !== undefined && nextUrl !== null) {
        window.location.href = new URL(
          String(nextUrl),
          window.location.href,
        ).href;
      }
    },

    replaceState(_state, _title, nextUrl) {
      if (nextUrl !== undefined && nextUrl !== null) {
        window.location.href = new URL(
          String(nextUrl),
          window.location.href,
        ).href;
      }
    },
  };

  window.history = history;

  function cleanup() {
    timerQueue.length = 0;
    cancelledTimers.clear();

    for (const observer of observers) {
      observer.disconnect();
    }

    observers.clear();
    windowListeners.clear();
  }

  return {
    document,
    window,
    history,
    TestMutationObserver,
    setTimeoutFake,
    clearTimeoutFake,
    flushMicrotasks,
    flushMutations,
    flushTimers,
    cleanup,
  };
}

async function loadContentScript({
  url = "https://staging.example.com/dashboard",
  settings = {},
  matchingRule = null,
} = {}) {
  const environment = createTestEnvironment(url);

  const effectiveSettings = {
    enabled: true,
    debug: false,
    reapplyOnChanges: true,
    titlePrefixEnabled: false,
    ...settings,
  };

  const storageListeners = [];
  const messageListeners = [];
  const sentMessages = [];

  const api = {
    storage: {
      onChanged: {
        addListener(listener) {
          storageListeners.push(listener);
        },
      },
    },

    runtime: {
      onMessage: {
        addListener(listener) {
          messageListeners.push(listener);
        },
      },
    },
  };

  const EnvFavicon = {
    api,

    STORAGE_PREFERENCE_KEY: "settingsStorageArea",
    SYNC_PREFERENCE_KEY: "settingsSyncEnabled",
    SYNC_MANIFEST_KEY: "settingsSyncManifest",
    SYNC_CHUNK_PREFIX: "settingsSyncChunk_",

    async getSettings() {
      return effectiveSettings;
    },

    diagnoseUrl(currentUrl) {
      const hasWinner =
        effectiveSettings.enabled !== false && matchingRule !== null;

      return {
        enabled: effectiveSettings.enabled !== false,
        url: currentUrl,
        winner: hasWinner ? matchingRule : null,
        matches: hasWinner
          ? [
              {
                rule: matchingRule,
                includedBy: "test pattern",
              },
            ]
          : [],
        excluded: [],
        invalid: [],
        hasConflict: false,
      };
    },

    faviconToUrl(favicon) {
      const value = String(favicon || "");

      if (/^(?:data:|https?:|chrome-extension:|moz-extension:)/i.test(value)) {
        return value;
      }

      return `chrome-extension://test/${value.replace(/^\/+/, "")}`;
    },

    sendMessageSafe(message) {
      sentMessages.push(message);
      return Promise.resolve();
    },

    setStorage() {
      return Promise.resolve();
    },
  };

  const Node = {
    ELEMENT_NODE,
    TEXT_NODE,
  };

  const context = {
    URL,
    console,

    window: environment.window,
    document: environment.document,
    history: environment.history,

    Node,
    MutationObserver: environment.TestMutationObserver,

    setTimeout: environment.setTimeoutFake,
    clearTimeout: environment.clearTimeoutFake,

    EnvFavicon,
  };

  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(CONTENT_SOURCE, context, {
    filename: "src/content.js",
  });

  // L'initialisation de content.js appelle une fonction async sans l'attendre.
  await environment.flushMicrotasks();

  return {
    ...environment,
    context,
    EnvFavicon,
    settings: effectiveSettings,
    storageListeners,
    messageListeners,
    sentMessages,
  };
}

module.exports = {
  MANAGED_FAVICON_SELECTOR,
  loadContentScript,
};
