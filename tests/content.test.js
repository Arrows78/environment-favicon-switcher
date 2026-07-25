"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MANAGED_FAVICON_SELECTOR,
  loadContentScript,
} = require("./helpers/load-content");

test("recreates the managed favicon when the page removes it", async (t) => {
  const environment = await loadContentScript({
    settings: {
      reapplyOnChanges: true,
      titlePrefixEnabled: false,
    },

    matchingRule: {
      id: "staging",
      name: "Staging",
      label: "STG",
      color: "#f59e0b",
      priority: 80,
      favicon: "icons/favicon-staging.png",
      keepOriginalFavicon: false,
    },
  });

  t.after(() => environment.cleanup());

  const initialFavicon = environment.document.querySelector(
    MANAGED_FAVICON_SELECTOR,
  );

  assert.ok(initialFavicon, "the managed favicon should initially exist");
  const activeObserver = Array.from(environment.observers).find(
    (observer) => observer.active,
  );
  assert.equal(
    activeObserver?.target,
    environment.document.head,
    "favicon and title mutations should be scoped to the document head",
  );

  initialFavicon.remove();

  assert.equal(
    environment.document.querySelector(MANAGED_FAVICON_SELECTOR),
    null,
    "the favicon should be absent immediately after removal",
  );

  await environment.flushMutations();
  await environment.flushTimers();

  assert.ok(
    environment.document.querySelector(MANAGED_FAVICON_SELECTOR),
    "the managed favicon should be recreated",
  );
});

test("does not observe DOM mutations when no rule matches", async (t) => {
  const environment = await loadContentScript({ matchingRule: null });
  t.after(() => environment.cleanup());

  assert.equal(
    Array.from(environment.observers).some((observer) => observer.active),
    false,
  );
});

test("sets accurate favicon MIME types and omits unknown ones", async (t) => {
  const webpEnvironment = await loadContentScript({
    matchingRule: {
      id: "webp",
      name: "WebP",
      label: "WEBP",
      color: "#2563eb",
      priority: 1,
      favicon: "https://assets.example.test/favicon.webp?revision=2",
      keepOriginalFavicon: false,
    },
  });
  t.after(() => webpEnvironment.cleanup());
  assert.equal(
    webpEnvironment.document
      .querySelector(MANAGED_FAVICON_SELECTOR)
      ?.getAttribute("type"),
    "image/webp",
  );

  const unknownEnvironment = await loadContentScript({
    matchingRule: {
      id: "unknown",
      name: "Unknown",
      label: "UNK",
      color: "#475569",
      priority: 1,
      favicon: "https://assets.example.test/favicon",
      keepOriginalFavicon: false,
    },
  });
  t.after(() => unknownEnvironment.cleanup());
  assert.equal(
    unknownEnvironment.document
      .querySelector(MANAGED_FAVICON_SELECTOR)
      ?.getAttribute("type"),
    null,
  );
});
