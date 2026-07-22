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
