/* global EnvFavicon */
(() => {
  "use strict";

  const extensionApi = EnvFavicon.api;
  const actionApi = extensionApi?.action || extensionApi?.browserAction;
  let syncRefreshTimer = null;

  function translated(key, substitutions, fallback) {
    return extensionApi?.i18n?.getMessage?.(key, substitutions) || fallback;
  }

  async function callAction(method, details) {
    const fn = actionApi?.[method];
    if (!fn) return;
    try {
      await EnvFavicon.callApi(fn.bind(actionApi), details);
    } catch (_) {}
  }

  async function updateAction(tabId, status) {
    if (!tabId || !actionApi) return;
    const rule = status?.enabled === false ? null : status?.rule;
    if (!rule) {
      await Promise.all([
        callAction("setBadgeText", { tabId, text: "" }),
        callAction("setTitle", {
          tabId,
          title: translated("extensionName", undefined, "Environment Favicon Switcher")
        })
      ]);
      return;
    }

    const label = String(rule.label || "ENV").slice(0, 4).toUpperCase();
    const title = status?.hasConflict
      ? translated(
        "detectedEnvironmentConflict",
        [rule.name, String(status.matchCount || 2)],
        `Detected: ${rule.name} (${status.matchCount || 2} matching rules)`
      )
      : translated("detectedEnvironment", rule.name, `Detected: ${rule.name}`);

    await Promise.all([
      callAction("setBadgeText", { tabId, text: label }),
      callAction("setBadgeBackgroundColor", { tabId, color: rule.color || "#64748b" }),
      callAction("setTitle", { tabId, title })
    ]);
  }

  extensionApi?.runtime?.onInstalled?.addListener(() => {
    void EnvFavicon.getSettings()
      .then((settings) => EnvFavicon.saveSettings(settings))
      .catch(() => {});
  });

  extensionApi?.tabs?.onUpdated?.addListener((tabId, changeInfo) => {
    if (!changeInfo?.url && changeInfo?.status !== "loading") return;
    // Clear the previous page state immediately. A supported page will publish
    // its fresh diagnosis once the content script starts.
    void updateAction(tabId, { enabled: true, rule: null });
  });

  extensionApi?.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName !== "sync") return;

    const preferenceChange = changes?.[EnvFavicon.SYNC_PREFERENCE_KEY];
    if (preferenceChange) {
      const preference = preferenceChange.newValue === true ? "sync" : "local";
      void EnvFavicon.setStorage({ [EnvFavicon.STORAGE_PREFERENCE_KEY]: preference }, "local");
    }

    const settingsChanged = Object.keys(changes).some((key) =>
      key === EnvFavicon.SYNC_MANIFEST_KEY
      || key.startsWith(EnvFavicon.SYNC_CHUNK_PREFIX)
    );
    if (!settingsChanged) return;
    clearTimeout(syncRefreshTimer);
    syncRefreshTimer = setTimeout(() => {
      void EnvFavicon.getSettings().catch(() => {});
    }, 220);
  });

  extensionApi?.runtime?.onMessage?.addListener((message, sender) => {
    if (message?.type !== "ENV_FAVICON_STATUS" || !sender.tab?.id) return;
    void updateAction(sender.tab.id, message);
  });
})();
