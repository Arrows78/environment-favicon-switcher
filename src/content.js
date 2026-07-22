/* global EnvFavicon */
(() => {
  "use strict";

  if (window.top !== window.self) return;

  const MANAGED_FAVICON_ATTRIBUTE = "data-environment-favicon-switcher";
  const MANAGED_FAVICON_SELECTOR = `link[${MANAGED_FAVICON_ATTRIBUTE}="true"]`;
  const ICON_SELECTOR = 'link[rel~="icon"], link[rel="shortcut icon"]';
  const extensionApi = EnvFavicon.api;

  let currentSettings = null;
  let currentRule = null;
  let currentPrefix = "";
  let baseTitle = document.title;
  let managedTitle = null;
  let mutationObserver = null;
  let applyTimer = null;
  let storageTimer = null;
  let applyRevision = 0;
  let lastUrl = window.location.href;
  let lastStatusSignature = "";

  function debug(...values) {
    if (currentSettings?.debug)
      console.info("[Environment Favicon Switcher]", ...values);
  }

  function managedFavicon() {
    return document.querySelector(MANAGED_FAVICON_SELECTOR);
  }

  function removeManagedFavicon() {
    managedFavicon()?.remove();
  }

  function faviconType(href) {
    const normalized = String(href || "").toLowerCase();
    if (
      normalized.startsWith("data:image/svg+xml") ||
      normalized.endsWith(".svg")
    )
      return "image/svg+xml";
    if (normalized.startsWith("data:image/png") || normalized.endsWith(".png"))
      return "image/png";
    if (
      normalized.startsWith("data:image/jpeg") ||
      /\.jpe?g(?:$|[?#])/.test(normalized)
    )
      return "image/jpeg";
    return "image/x-icon";
  }

  function isLastFavicon(link) {
    if (!document.head) return false;

    const faviconLinks = Array.from(document.head.children).filter((element) =>
      element.matches?.(ICON_SELECTOR),
    );

    return faviconLinks[faviconLinks.length - 1] === link;
  }

  function setManagedFavicon(href) {
    if (!document.head || !href) {
      removeManagedFavicon();
      return;
    }

    const expectedType = faviconType(href);
    let link = managedFavicon();

    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      link.setAttribute(MANAGED_FAVICON_ATTRIBUTE, "true");
    }

    // Do not reassign attributes if they are already correct.
    // Reassigning href can trigger a new download.
    if (link.getAttribute("rel") !== "icon") {
      link.rel = "icon";
    }

    if (link.getAttribute("type") !== expectedType) {
      link.type = expectedType;
    }

    if (link.getAttribute("href") !== href) {
      link.href = href;
    }

    // Only move the favicon if a page-owned icon has been placed after it,
    // or if it is not yet attached to the document.
    if (link.parentNode !== document.head || !isLastFavicon(link)) {
      link.remove();
      document.head.appendChild(link);
    }
  }

  function stripManagedPrefix(title) {
    const normalized = String(title || "");
    if (currentPrefix && normalized.startsWith(currentPrefix)) {
      return normalized.slice(currentPrefix.length);
    }
    return normalized;
  }

  function captureApplicationTitle() {
    const currentTitle = document.title;
    if (managedTitle !== null && currentTitle === managedTitle) return;
    baseTitle = stripManagedPrefix(currentTitle);
    managedTitle = null;
  }

  function updateTitle(rule, settings) {
    captureApplicationTitle();
    const nextPrefix =
      settings.titlePrefixEnabled && rule
        ? `[${rule.label || rule.name}] `
        : "";
    currentPrefix = nextPrefix;
    const desiredTitle = `${nextPrefix}${baseTitle}`;

    managedTitle = desiredTitle;
    if (document.title !== desiredTitle) document.title = desiredTitle;
  }

  function statusSignature(payload) {
    return JSON.stringify([
      payload.enabled,
      payload.url,
      payload.rule?.id || null,
      payload.rule?.name || null,
      payload.rule?.label || null,
      payload.rule?.color || null,
      payload.rule?.priority || 0,
      payload.matchedBy || null,
      payload.matchCount || 0,
      Boolean(payload.hasConflict),
    ]);
  }

  function sendStatus(diagnosis) {
    const winnerEvaluation = diagnosis.matches[0] || null;
    const payload = {
      type: "ENV_FAVICON_STATUS",
      enabled: diagnosis.enabled,
      url: window.location.href,
      rule: diagnosis.winner,
      matchedBy: winnerEvaluation?.includedBy || null,
      matchCount: diagnosis.matches.length,
      hasConflict: diagnosis.hasConflict,
    };
    const signature = statusSignature(payload);
    if (signature === lastStatusSignature) return;
    lastStatusSignature = signature;
    EnvFavicon.sendMessageSafe(payload);
  }

  async function applyForCurrentUrl(reason = "apply") {
    const revision = ++applyRevision;
    let settings;
    try {
      settings = await EnvFavicon.getSettings();
    } catch (error) {
      console.error(
        "[Environment Favicon Switcher] Unable to load settings",
        error,
      );
      return;
    }
    if (revision !== applyRevision) return;

    currentSettings = settings;
    const diagnosis = EnvFavicon.diagnoseUrl(window.location.href, settings);
    currentRule = diagnosis.winner;

    if (currentRule && !currentRule.keepOriginalFavicon) {
      setManagedFavicon(EnvFavicon.faviconToUrl(currentRule.favicon));
    } else {
      removeManagedFavicon();
    }
    updateTitle(currentRule, settings);
    configureMutationObserver(settings);
    sendStatus(diagnosis);
    debug(reason, currentRule?.name || "no match", diagnosis.matches.length);
  }

  function scheduleApply(reason, delay = 60) {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => void applyForCurrentUrl(reason), delay);
  }

  function nodeContainsRelevantElement(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    if (node.matches?.(MANAGED_FAVICON_SELECTOR)) return false;
    if (node.matches?.(`${ICON_SELECTOR}, title`)) return true;
    return Boolean(node.querySelector?.(`${ICON_SELECTOR}, title`));
  }

  function mutationNeedsFaviconReapply(mutation) {
    if (
      !currentSettings?.reapplyOnChanges ||
      !currentRule ||
      currentRule.keepOriginalFavicon
    )
      return false;
    if (mutation.target?.matches?.(MANAGED_FAVICON_SELECTOR)) return false;
    if (mutation.type === "attributes")
      return mutation.target?.matches?.(ICON_SELECTOR) || false;
    return (
      Array.from(mutation.addedNodes || []).some(nodeContainsRelevantElement) ||
      Array.from(mutation.removedNodes || []).some(nodeContainsRelevantElement)
    );
  }

  function mutationChangesApplicationTitle(mutation) {
    const titleElement =
      mutation.target?.nodeType === Node.TEXT_NODE
        ? mutation.target.parentElement
        : mutation.target;
    if (titleElement?.matches?.("title"))
      return document.title !== managedTitle;
    return Array.from(mutation.addedNodes || []).some(
      (node) =>
        node.nodeType === Node.ELEMENT_NODE &&
        (node.matches?.("title") || node.querySelector?.("title")),
    );
  }

  function configureMutationObserver(settings) {
    const shouldObserve =
      settings.reapplyOnChanges || settings.titlePrefixEnabled;
    if (!shouldObserve) {
      mutationObserver?.disconnect();
      mutationObserver = null;
      return;
    }
    if (mutationObserver || !document.documentElement) return;

    mutationObserver = new MutationObserver((mutations) => {
      const urlChanged = window.location.href !== lastUrl;
      if (urlChanged) {
        lastUrl = window.location.href;
        scheduleApply("url mutation", 20);
        return;
      }

      const titleChanged =
        currentSettings?.titlePrefixEnabled &&
        mutations.some(mutationChangesApplicationTitle);

      const managedFaviconMissing =
        currentSettings?.reapplyOnChanges &&
        currentRule &&
        !currentRule.keepOriginalFavicon &&
        !managedFavicon();

      const faviconChanged =
        managedFaviconMissing || mutations.some(mutationNeedsFaviconReapply);

      if (titleChanged) captureApplicationTitle();
      if (titleChanged || faviconChanged)
        scheduleApply(titleChanged ? "title mutation" : "favicon mutation");
    });
    mutationObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["href", "rel", "type", "sizes"],
      characterData: true,
      childList: true,
      subtree: true,
    });
  }

  function patchHistoryMethod(method) {
    const original = history[method];
    if (typeof original !== "function" || original.__environmentFaviconPatched)
      return;
    function patchedHistoryMethod(...args) {
      const result = original.apply(this, args);
      lastUrl = window.location.href;
      scheduleApply(`history:${method}`, 20);
      return result;
    }
    Object.defineProperty(patchedHistoryMethod, "__environmentFaviconPatched", {
      value: true,
    });
    try {
      history[method] = patchedHistoryMethod;
    } catch (_) {}
  }

  async function handleStorageChanges(changes, areaName) {
    if (areaName === "sync" && changes?.[EnvFavicon.SYNC_PREFERENCE_KEY]) {
      const synchronized =
        changes[EnvFavicon.SYNC_PREFERENCE_KEY].newValue === true;
      await EnvFavicon.setStorage(
        {
          [EnvFavicon.STORAGE_PREFERENCE_KEY]: synchronized ? "sync" : "local",
        },
        "local",
      ).catch(() => {});
    }

    const localChange =
      areaName === "local" &&
      (changes.settings || changes[EnvFavicon.STORAGE_PREFERENCE_KEY]);
    const syncChange =
      areaName === "sync" &&
      Object.keys(changes).some(
        (key) =>
          key === EnvFavicon.SYNC_MANIFEST_KEY ||
          key === EnvFavicon.SYNC_PREFERENCE_KEY ||
          key.startsWith(EnvFavicon.SYNC_CHUNK_PREFIX),
      );
    if (!localChange && !syncChange) return;

    clearTimeout(storageTimer);
    storageTimer = setTimeout(
      () => scheduleApply(`storage:${areaName}`, 20),
      syncChange ? 260 : 40,
    );
  }

  patchHistoryMethod("pushState");
  patchHistoryMethod("replaceState");
  window.addEventListener("popstate", () => {
    lastUrl = window.location.href;
    scheduleApply("popstate", 20);
  });
  window.addEventListener("hashchange", () => {
    lastUrl = window.location.href;
    scheduleApply("hashchange", 20);
  });
  window.navigation?.addEventListener?.("navigate", () =>
    scheduleApply("navigation", 20),
  );

  const urlWatchTimer = window.setInterval(() => {
    if (window.location.href === lastUrl) return;
    lastUrl = window.location.href;
    scheduleApply("url watch", 20);
  }, 1500);

  extensionApi?.storage?.onChanged?.addListener((changes, areaName) => {
    void handleStorageChanges(changes, areaName);
  });

  extensionApi?.runtime?.onMessage?.addListener(
    (message, _sender, sendResponse) => {
      if (message?.type === "ENV_FAVICON_GET_STATUS") {
        EnvFavicon.getSettings()
          .then((settings) => {
            const diagnosis = EnvFavicon.diagnoseUrl(
              window.location.href,
              settings,
            );
            sendResponse({
              rule: diagnosis.winner,
              url: window.location.href,
              enabled: diagnosis.enabled,
              matchedBy: diagnosis.matches[0]?.includedBy || null,
              matchCount: diagnosis.matches.length,
              hasConflict: diagnosis.hasConflict,
            });
          })
          .catch(() =>
            sendResponse({
              rule: null,
              url: window.location.href,
              enabled: false,
            }),
          );
        return true;
      }
      if (message?.type === "ENV_FAVICON_REAPPLY") {
        applyForCurrentUrl("manual").then(() => sendResponse({ ok: true }));
        return true;
      }
      return false;
    },
  );

  void applyForCurrentUrl("init");
})();
