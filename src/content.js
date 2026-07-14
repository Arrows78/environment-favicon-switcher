/* global EnvFavicon */
(() => {
  if (window.top !== window.self) return;

  let originalTitle = document.title;
  let originalFavicons = [];
  let currentRuleId = null;
  let observer = null;
  let applying = false;

  const log = (...args) => {
    EnvFavicon.getSettings().then((settings) => {
      if (settings.debug) console.info("[Env Favicon]", ...args);
    });
  };

  function rememberOriginalFavicons() {
    if (originalFavicons.length) return;
    originalFavicons = Array.from(document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"]')).map((link) => ({
      rel: link.getAttribute("rel") || "icon",
      href: link.getAttribute("href") || "",
      type: link.getAttribute("type") || "",
      sizes: link.getAttribute("sizes") || ""
    }));
  }

  function removeManagedFavicons() {
    document.querySelectorAll('link[data-env-favicon="true"]').forEach((link) => link.remove());
  }

  function setManagedFavicon(href) {
    if (!document.head || !href) return;
    removeManagedFavicons();
    document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"]').forEach((link) => {
      link.dataset.envFaviconHidden = "true";
      link.disabled = true;
    });

    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/x-icon";
    link.href = href;
    link.dataset.envFavicon = "true";
    document.head.appendChild(link);
  }

  function restoreOriginalFavicon() {
    removeManagedFavicons();
    document.querySelectorAll('[data-env-favicon-hidden="true"]').forEach((link) => {
      link.disabled = false;
      delete link.dataset.envFaviconHidden;
    });

    if (!document.querySelector('link[rel~="icon"], link[rel="shortcut icon"]') && originalFavicons.length) {
      originalFavicons.forEach((favicon) => {
        const link = document.createElement("link");
        link.rel = favicon.rel;
        link.href = favicon.href;
        if (favicon.type) link.type = favicon.type;
        if (favicon.sizes) link.sizes = favicon.sizes;
        document.head.appendChild(link);
      });
    }
  }

  function setTitlePrefix(rule, settings) {
    if (!settings.titlePrefixEnabled) {
      if (document.title.startsWith("[")) document.title = originalTitle || document.title;
      return;
    }

    if (!originalTitle || !document.title.match(/^\[[^\]]+\]\s/)) {
      originalTitle = document.title;
    }

    const prefix = `[${rule.label || rule.name}] `;
    document.title = `${prefix}${originalTitle.replace(/^\[[^\]]+\]\s*/, "")}`;
  }

  async function applyForCurrentUrl(reason = "apply") {
    if (applying) return;
    applying = true;

    try {
      rememberOriginalFavicons();
      const settings = await EnvFavicon.getSettings();
      const rule = EnvFavicon.findMatchingRule(window.location.href, settings);

      if (!rule) {
        currentRuleId = null;
        restoreOriginalFavicon();
        if (settings.titlePrefixEnabled) document.title = originalTitle || document.title;
        EnvFavicon.sendMessageSafe({ type: "ENV_FAVICON_STATUS", rule: null, url: window.location.href });
        return;
      }

      currentRuleId = rule.id;
      if (rule.keepOriginalFavicon) {
        restoreOriginalFavicon();
      } else {
        setManagedFavicon(EnvFavicon.faviconToUrl(rule.favicon));
      }
      setTitlePrefix(rule, settings);
      EnvFavicon.sendMessageSafe({ type: "ENV_FAVICON_STATUS", rule, url: window.location.href });
      log(reason, rule.name);
    } finally {
      applying = false;
    }
  }

  function observeChanges() {
    if (observer || !document.documentElement) return;
    observer = new MutationObserver((mutations) => {
      const shouldReapply = mutations.some((mutation) =>
        Array.from(mutation.addedNodes || []).some((node) =>
          node.nodeType === Node.ELEMENT_NODE && node.matches?.('link[rel~="icon"], link[rel="shortcut icon"], title')
        )
      );
      if (shouldReapply) setTimeout(() => applyForCurrentUrl("mutation"), 50);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function patchHistory(method) {
    const original = history[method];
    history[method] = function patchedHistoryMethod(...args) {
      const result = original.apply(this, args);
      setTimeout(() => applyForCurrentUrl(`history:${method}`), 50);
      return result;
    };
  }

  patchHistory("pushState");
  patchHistory("replaceState");
  window.addEventListener("popstate", () => setTimeout(() => applyForCurrentUrl("popstate"), 50));

  EnvFavicon.api.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) applyForCurrentUrl("settings");
  });

  EnvFavicon.api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "ENV_FAVICON_GET_STATUS") {
      EnvFavicon.getSettings().then((settings) => {
        const rule = EnvFavicon.findMatchingRule(window.location.href, settings);
        sendResponse({ rule, url: window.location.href, enabled: settings.enabled });
      });
      return true;
    }
    if (message?.type === "ENV_FAVICON_REAPPLY") {
      applyForCurrentUrl("manual").then(() => sendResponse({ ok: true }));
      return true;
    }
    return false;
  });

  EnvFavicon.getSettings().then((settings) => {
    if (settings.reapplyOnChanges) observeChanges();
    applyForCurrentUrl("init");
  });
})();
