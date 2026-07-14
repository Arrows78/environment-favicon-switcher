/* global EnvFavicon */
const $ = (selector) => document.querySelector(selector);

async function getActiveTab() {
  const tabs = await EnvFavicon.callApi(EnvFavicon.api.tabs.query.bind(EnvFavicon.api.tabs), { active: true, currentWindow: true });
  return tabs[0];
}

function renderRules(settings) {
  const list = $("#rulesList");
  list.innerHTML = "";
  settings.rules.filter((rule) => rule.enabled).forEach((rule) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="dot" style="background:${rule.color}"></span><strong>${rule.label || rule.name}</strong><span>${rule.name}</span>`;
    list.appendChild(li);
  });
}

function renderStatus(rule, tabUrl, enabled) {
  const status = $("#status");
  
  try {
    $("#currentUrl").textContent = tabUrl ? (new URL(tabUrl).hostname || tabUrl) : "Onglet actif";
  } catch (_) {
    $("#currentUrl").textContent = tabUrl || "Onglet actif";
  }

  if (!enabled) {
    status.className = "status-card warning";
    status.textContent = "Extension désactivée globalement.";
    return;
  }

  if (!rule) {
    status.className = "status-card muted";
    status.textContent = "Aucun environnement configuré ne correspond à cet onglet.";
    return;
  }

  status.className = "status-card";
  status.innerHTML = `<div class="status-title"><span class="dot" style="background:${rule.color}"></span>${rule.name}</div><p>Label : ${rule.label || "—"} · ${rule.keepOriginalFavicon ? "favicon original conservé" : "favicon remplacé"}</p>`;
}

async function refresh() {
  const settings = await EnvFavicon.getSettings();
  const tab = await getActiveTab();
  $("#enabledToggle").checked = settings.enabled;
  renderRules(settings);

  let response = null;
  try {
    response = await EnvFavicon.callApi(EnvFavicon.api.tabs.sendMessage.bind(EnvFavicon.api.tabs), tab.id, { type: "ENV_FAVICON_GET_STATUS" });
  } catch (_) {
    const rule = EnvFavicon.findMatchingRule(tab.url || "", settings);
    response = { rule, url: tab.url, enabled: settings.enabled };
  }

  renderStatus(response.rule, response.url || tab.url, response.enabled);
}

$("#enabledToggle").addEventListener("change", async (event) => {
  const settings = await EnvFavicon.getSettings();
  settings.enabled = event.target.checked;
  await EnvFavicon.saveSettings(settings);
  await refresh();
});

$("#optionsButton").addEventListener("click", () => EnvFavicon.api.runtime.openOptionsPage());
$("#reapplyButton").addEventListener("click", async () => {
  const tab = await getActiveTab();
  try { await EnvFavicon.callApi(EnvFavicon.api.tabs.sendMessage.bind(EnvFavicon.api.tabs), tab.id, { type: "ENV_FAVICON_REAPPLY" }); } catch (_) {}
  await refresh();
});

refresh();
