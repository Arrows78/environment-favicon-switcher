/* global EnvFavicon, EnvI18n, DEFAULT_SETTINGS */
const $ = (selector, root = document) => root.querySelector(selector);
const t = EnvI18n.t;
EnvI18n.localizeDocument();

const ALL_GROUPS = "__all__";
const UNGROUPED = "__ungrouped__";
let settings;
let searchValue = "";
let activeGroupId = ALL_GROUPS;

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

function groupName(groupId) {
  if (!groupId) return t("ungrouped");
  return settings.groups.find((group) => group.id === groupId)?.name || t("ungrouped");
}

function ruleMatchesActiveGroup(rule) {
  if (activeGroupId === ALL_GROUPS) return true;
  if (activeGroupId === UNGROUPED) return !rule.groupId;
  return rule.groupId === activeGroupId;
}

function renderGroupTabs() {
  const tabs = $("#groupTabs");
  tabs.innerHTML = "";
  const definitions = [
    { id: ALL_GROUPS, name: t("allGroups"), color: "#64748b" },
    ...settings.groups,
    { id: UNGROUPED, name: t("ungrouped"), color: "#94a3b8" }
  ];

  definitions.forEach((group) => {
    const count = settings.rules.filter((rule) => {
      if (group.id === ALL_GROUPS) return true;
      if (group.id === UNGROUPED) return !rule.groupId;
      return rule.groupId === group.id;
    }).length;
    if (group.id === UNGROUPED && count === 0) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "group-tab";
    button.dataset.groupId = group.id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(activeGroupId === group.id));
    button.classList.toggle("active", activeGroupId === group.id);
    button.innerHTML = `<span class="group-tab-dot"></span><span></span><strong>${count}</strong>`;
    $(".group-tab-dot", button).style.background = group.color;
    button.children[1].textContent = group.name;
    button.addEventListener("click", () => { activeGroupId = group.id; render(); });
    tabs.appendChild(button);
  });

  const editable = ![ALL_GROUPS, UNGROUPED].includes(activeGroupId);
  $("#renameGroup").disabled = !editable;
  $("#deleteGroup").disabled = !editable;
}

function fillGroupSelect(select, selectedId) {
  select.innerHTML = "";
  const ungrouped = document.createElement("option");
  ungrouped.value = "";
  ungrouped.textContent = t("ungrouped");
  select.appendChild(ungrouped);
  settings.groups.forEach((group) => {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.name;
    select.appendChild(option);
  });
  select.value = selectedId || "";
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
  fillGroupSelect($(".rule-group", card), rule.groupId);
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
  bind(".rule-group", "change", (e) => { rule.groupId = e.target.value || null; persist(); });
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
  renderGroupTabs();

  const container = $("#rulesContainer");
  container.innerHTML = "";
  const filteredRules = settings.rules.filter((rule) =>
    ruleMatchesActiveGroup(rule) &&
    `${rule.name} ${rule.label} ${groupName(rule.groupId)} ${rule.patterns.join(" ")}`.toLowerCase().includes(searchValue)
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
$("#addGroup").addEventListener("click", async () => {
  const name = prompt(t("newGroupName"));
  if (name === null) return;
  if (!name.trim()) return toast(t("groupNameRequired"));
  const group = EnvFavicon.normalizeGroup({ id: EnvFavicon.makeId("group"), name: name.trim(), color: "#64748b" });
  settings.groups.push(group);
  activeGroupId = group.id;
  await persist(t("groupAdded"));
});
$("#renameGroup").addEventListener("click", async () => {
  const group = settings.groups.find((candidate) => candidate.id === activeGroupId);
  if (!group) return;
  const name = prompt(t("renameGroupPrompt"), group.name);
  if (name === null) return;
  if (!name.trim()) return toast(t("groupNameRequired"));
  group.name = name.trim();
  await persist(t("groupRenamed"));
});
$("#deleteGroup").addEventListener("click", async () => {
  const group = settings.groups.find((candidate) => candidate.id === activeGroupId);
  if (!group || !confirm(t("deleteGroupConfirm", group.name))) return;
  settings.groups = settings.groups.filter((candidate) => candidate.id !== group.id);
  settings.rules.forEach((rule) => { if (rule.groupId === group.id) rule.groupId = null; });
  activeGroupId = ALL_GROUPS;
  await persist(t("groupDeleted"));
});
$("#addRule").addEventListener("click", async () => {
  const groupId = ![ALL_GROUPS, UNGROUPED].includes(activeGroupId) ? activeGroupId : null;
  settings.rules.unshift(EnvFavicon.normalizeRule({
    id: EnvFavicon.makeId("rule"),
    groupId,
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
  activeGroupId = ALL_GROUPS;
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
    activeGroupId = ALL_GROUPS;
    await persist(t("configurationImported"));
  } catch (_) {
    toast(t("invalidJson"));
  }
});

EnvFavicon.getSettings().then((loaded) => {
  settings = loaded;
  render();
});
