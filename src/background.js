/* global EnvFavicon */
const extensionApi = globalThis.browser || globalThis.chrome;

extensionApi.runtime.onInstalled.addListener(async () => {
  const settings = await EnvFavicon.getSettings();
  await EnvFavicon.saveSettings(settings);
});

extensionApi.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "ENV_FAVICON_STATUS" || !sender.tab?.id) return;

  const tabId = sender.tab.id;
  const rule = message.rule;
  if (!rule) {
    extensionApi.action.setBadgeText({ tabId, text: "" });
    extensionApi.action.setTitle({ tabId, title: "Environment Favicon Switcher" });
    return;
  }

  extensionApi.action.setBadgeText({
    tabId,
    text: rule.label?.slice(0, 4).toUpperCase() || "ENV"
  });
  extensionApi.action.setBadgeBackgroundColor({
    tabId,
    color: rule.color || "#64748b"
  });
  extensionApi.action.setTitle({ tabId, title: `Detected: ${rule.name}` });
});
