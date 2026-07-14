/* global EnvFavicon, EnvI18n, DEFAULT_SETTINGS */
const $ = (selector, root = document) => root.querySelector(selector);
const t = EnvI18n.t;
EnvI18n.localizeDocument();

let settings;
let searchValue = "";

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("visible");
  setTimeout(() => node.classList.remove("visible"), 1800);
}

function linesToArray(value) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

async function persist(message = t("configurationSaved")) {
  settings = await EnvFavicon.saveSettings(settings);
  render();
  toast(message);
}

function updateGlobalSetting(key, value) {
  settings[key] = value;
  persist();
}

function faviconPreviewUrl(rule) {
  if (rule.keepOriginalFavicon) return "icons/icon-48.png";
  return EnvFavicon.faviconToUrl(rule.favicon || "icons/icon-48.png");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderRule(rule) {
  const template = $("#ruleTemplate");
  const card = template.content.firstElementChild.cloneNode(true);
  EnvI18n.localizeDocument(card);
  card.dataset.id = rule.id;
  $(".dot", card).style.background = rule.color;
  $(".rule-name", card).value = rule.name;
  $(".rule-enabled", card).checked = rule.enabled;
  $(".rule-label", card).value = rule.label;
  $(".rule-color", card).value = rule.color;
  $(".rule-match-type", card).value = rule.matchType;
  $(".rule-keep-original", card).checked = rule.keepOriginalFavicon;
  $(".rule-patterns", card).value = rule.patterns.join("\n");
  $(".rule-favicon", card).value = rule.favicon;
  $(".favicon-preview", card).src = faviconPreviewUrl(rule);

  const bind = (selector, event, handler) => $(selector, card).addEventListener(event, handler);
  bind(".rule-name", "change", (e) => { rule.name = e.target.value.trim() || t("untitled"); persist(); });
  bind(".rule-enabled", "change", (e) => { rule.enabled = e.target.checked; persist(); });
  bind(".rule-label", "change", (e) => { rule.label = e.target.value.trim().toUpperCase(); persist(); });
  bind(".rule-color", "change", (e) => { rule.color = e.target.value; persist(); });
  bind(".rule-match-type", "change", (e) => { rule.matchType = e.target.value; persist(); });
  bind(".rule-keep-original", "change", (e) => { rule.keepOriginalFavicon = e.target.checked; persist(); });
  bind(".rule-patterns", "change", (e) => { rule.patterns = linesToArray(e.target.value); persist(); });
  bind(".rule-favicon", "change", (e) => { rule.favicon = e.target.value.trim(); persist(); });
  bind(".rule-favicon-file", "change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    rule.favicon = await readFileAsDataUrl(file);
    rule.keepOriginalFavicon = false;
    await persist(t("faviconImported"));
  });
  bind(".duplicate-rule", "click", async () => {
    const copy = EnvFavicon.normalizeRule({ ...rule, id: EnvFavicon.makeId("rule"), name: `${rule.name} ${t("copySuffix")}` });
    settings.rules.splice(settings.rules.indexOf(rule) + 1, 0, copy);
    await persist(t("environmentDuplicated"));
  });
  bind(".remove-rule", "click", async () => {
    if (!confirm(t("removeEnvironmentConfirm", rule.name))) return;
    settings.rules = settings.rules.filter((candidate) => candidate.id !== rule.id);
    await persist(t("environmentRemoved"));
  });

  return card;
}

function render() {
  $("#enabled").checked = settings.enabled;
  $("#titlePrefixEnabled").checked = settings.titlePrefixEnabled;
  $("#reapplyOnChanges").checked = settings.reapplyOnChanges;
  $("#debug").checked = settings.debug;

  const container = $("#rulesContainer");
  container.innerHTML = "";
  const filteredRules = settings.rules.filter((rule) =>
    `${rule.name} ${rule.label} ${rule.patterns.join(" ")}`.toLowerCase().includes(searchValue)
  );

  if (!filteredRules.length) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = t("noFilterMatches");
    container.appendChild(emptyState);
    return;
  }

  filteredRules.forEach((rule) => container.appendChild(renderRule(rule)));
}

$("#enabled").addEventListener("change", (e) => updateGlobalSetting("enabled", e.target.checked));
$("#titlePrefixEnabled").addEventListener("change", (e) => updateGlobalSetting("titlePrefixEnabled", e.target.checked));
$("#reapplyOnChanges").addEventListener("change", (e) => updateGlobalSetting("reapplyOnChanges", e.target.checked));
$("#debug").addEventListener("change", (e) => updateGlobalSetting("debug", e.target.checked));
$("#search").addEventListener("input", (e) => { searchValue = e.target.value.trim().toLowerCase(); render(); });
$("#addRule").addEventListener("click", async () => {
  settings.rules.unshift(EnvFavicon.normalizeRule({
    id: EnvFavicon.makeId("rule"),
    name: t("newEnvironment"),
    label: "ENV",
    color: "#64748b",
    matchType: "hostname",
    patterns: ["example.local"],
    favicon: "icons/icon-48.png"
  }));
  await persist(t("environmentAdded"));
});
$("#resetDefaults").addEventListener("click", async () => {
  if (!confirm(t("resetConfirm"))) return;
  settings = EnvFavicon.normalizeSettings(DEFAULT_SETTINGS);
  await persist(t("configurationReset"));
});
$("#exportConfig").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "environment-favicon-config.json";
  a.click();
  URL.revokeObjectURL(url);
});
$("#importConfig").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    settings = EnvFavicon.normalizeSettings(imported);
    await persist(t("configurationImported"));
  } catch (_) {
    toast(t("invalidJson"));
  }
});

EnvFavicon.getSettings().then((loaded) => {
  settings = loaded;
  render();
});
