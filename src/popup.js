/* global EnvFavicon, EnvI18n */
(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const t = EnvI18n.t;
  let activeTab = null;

  EnvI18n.localizeDocument();

  function clear(node) {
    node.replaceChildren();
  }

  function createElement(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  async function getActiveTab() {
    const tabsApi = EnvFavicon.api?.tabs;
    if (!tabsApi?.query) return null;
    const tabs = await EnvFavicon.callApi(tabsApi.query.bind(tabsApi), {
      active: true,
      currentWindow: true
    });
    return tabs?.[0] || null;
  }

  function displayUrl(url) {
    try {
      return new URL(url).hostname || url;
    } catch (_) {
      return url || t("activeTab");
    }
  }

  function sortedRules(settings) {
    return settings.rules
      .map((rule, index) => ({ rule, index }))
      .filter(({ rule }) => rule.enabled)
      .sort((left, right) =>
        (right.rule.priority || 0) - (left.rule.priority || 0) || left.index - right.index
      );
  }

  function renderRules(settings, diagnosis) {
    const list = $("#rulesList");
    clear(list);
    const matchingIds = new Set(diagnosis.matches.map((evaluation) => evaluation.rule.id));

    sortedRules(settings).forEach(({ rule }) => {
      const item = createElement("li", matchingIds.has(rule.id) ? "matching" : "");
      if (diagnosis.winner?.id === rule.id) item.classList.add("winner");

      const dot = createElement("span", "dot");
      dot.style.backgroundColor = rule.color;
      dot.setAttribute("aria-hidden", "true");
      const label = createElement("strong", "", rule.label || "ENV");
      const details = createElement("span", "rule-list-details");
      details.append(
        createElement("span", "rule-list-name", rule.name),
        createElement("small", "", t("priorityValue", String(rule.priority || 0)))
      );
      item.append(dot, label, details);
      list.appendChild(item);
    });

    if (!list.children.length) {
      list.appendChild(createElement("li", "empty-rule-list", t("noActiveEnvironments")));
    }
  }

  function renderStatus(settings, diagnosis, tab) {
    const status = $("#status");
    clear(status);
    $("#currentUrl").textContent = displayUrl(tab?.url);

    if (!tab) {
      status.className = "status-card warning";
      status.textContent = t("activeTabUnavailable");
      return;
    }
    if (!settings.enabled) {
      status.className = "status-card warning";
      status.textContent = t("globallyDisabled");
      return;
    }
    if (!diagnosis.winner) {
      status.className = "status-card muted";
      status.textContent = t("noMatchingEnvironment");
      return;
    }

    const rule = diagnosis.winner;
    const winnerEvaluation = diagnosis.matches[0];
    status.className = `status-card${diagnosis.hasConflict ? " warning" : ""}`;

    const title = createElement("div", "status-title");
    const dot = createElement("span", "dot");
    dot.style.backgroundColor = rule.color;
    dot.setAttribute("aria-hidden", "true");
    title.append(dot, createElement("strong", "", rule.name));

    const faviconStatus = rule.keepOriginalFavicon ? t("originalFaviconKept") : t("faviconReplaced");
    const summary = createElement("p", "status-detail");
    summary.textContent = `${t("label")}: ${rule.label || "-"} - ${faviconStatus}`;
    const match = createElement("p", "status-detail");
    match.textContent = `${t("priorityValue", String(rule.priority || 0))} - ${t("matchedBy", winnerEvaluation?.includedBy || "-")}`;
    status.append(title, summary, match);

    if (diagnosis.hasConflict) {
      status.appendChild(createElement(
        "p",
        "conflict-detail",
        t("popupConflict", String(diagnosis.matches.length))
      ));
    }
  }

  async function refresh() {
    const status = $("#status");
    try {
      const [settings, tab] = await Promise.all([EnvFavicon.getSettings(), getActiveTab()]);
      activeTab = tab;
      const diagnosis = EnvFavicon.diagnoseUrl(tab?.url || "", settings);
      $("#enabledToggle").checked = settings.enabled;
      $("#reapplyButton").disabled = !tab?.id;
      renderStatus(settings, diagnosis, tab);
      renderRules(settings, diagnosis);
    } catch (error) {
      console.error("Unable to refresh popup", error);
      status.className = "status-card warning";
      status.textContent = t("popupLoadFailed");
    }
  }

  $("#enabledToggle").addEventListener("change", async (event) => {
    const toggle = event.target;
    toggle.disabled = true;
    try {
      const settings = await EnvFavicon.getSettings();
      settings.enabled = toggle.checked;
      await EnvFavicon.saveSettings(settings);
    } catch (error) {
      console.error("Unable to toggle extension", error);
    } finally {
      toggle.disabled = false;
      await refresh();
    }
  });

  $("#optionsButton").addEventListener("click", () => {
    const result = EnvFavicon.api?.runtime?.openOptionsPage?.();
    if (result?.catch) result.catch(() => {});
    window.close();
  });

  $("#reapplyButton").addEventListener("click", async () => {
    if (!activeTab?.id || !EnvFavicon.api?.tabs?.sendMessage) return;
    const button = $("#reapplyButton");
    button.disabled = true;
    try {
      await EnvFavicon.callApi(
        EnvFavicon.api.tabs.sendMessage.bind(EnvFavicon.api.tabs),
        activeTab.id,
        { type: "ENV_FAVICON_REAPPLY" }
      );
    } catch (_) {
      // Restricted browser pages do not expose a content-script endpoint.
    } finally {
      button.disabled = false;
      await refresh();
    }
  });

  void refresh();
})();
