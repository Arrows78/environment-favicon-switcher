/* global EnvFavicon, EnvI18n, DEFAULT_SETTINGS */
(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const t = EnvI18n.t;
  const ALL_GROUPS = "__all__";
  const UNGROUPED = "__ungrouped__";
  const MAX_FAVICON_BYTES = 128 * 1024;
  const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

  let settings = null;
  let storageStatus = null;
  let searchValue = "";
  let activeGroupId = ALL_GROUPS;
  let testedUrl = "";
  let toastTimer = null;
  let testerTimer = null;
  let saveQueue = Promise.resolve();
  let saveRevision = 0;

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

  function toast(message) {
    const node = $("#toast");
    node.textContent = message;
    node.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("visible"), 2200);
  }

  function linesToArray(value) {
    return String(value || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function formatIssue(issue) {
    const keys = {
      "missing-patterns": "issueMissingPatterns",
      "invalid-pattern": "issueInvalidPattern",
      "regex-too-long": "issueRegexTooLong",
      "missing-favicon": "issueMissingFavicon",
      "invalid-url": "issueInvalidUrl",
    };
    const key = keys[issue.code] || "issueUnknown";
    return issue.pattern ? t(key, issue.pattern) : t(key);
  }

  async function persist(message = t("configurationSaved")) {
    const revision = ++saveRevision;
    const snapshot = EnvFavicon.normalizeSettings(settings);
    saveQueue = saveQueue
      .catch(() => undefined)
      .then(() => EnvFavicon.saveSettings(snapshot));

    try {
      const saved = await saveQueue;
      if (revision === saveRevision) {
        settings = saved;
        storageStatus = await EnvFavicon.getStorageStatus(saved);
        render();
      }
      toast(message);
      return saved;
    } catch (error) {
      console.error("Unable to save configuration", error);
      storageStatus = await EnvFavicon.getStorageStatus(snapshot).catch(
        () => storageStatus,
      );
      render();
      toast(
        error?.code === "sync-fallback-local"
          ? t("syncFallbackLocal")
          : t("saveFailed"),
      );
      return null;
    }
  }

  function updateGlobalSetting(key, value) {
    settings[key] = value;
    void persist();
  }

  function faviconPreviewUrl(rule) {
    if (rule.keepOriginalFavicon) return "icons/icon-48.png";
    return EnvFavicon.faviconToUrl(rule.favicon || "icons/icon-48.png");
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () =>
        reject(reader.error || new Error("Unable to read the file."));
      reader.readAsDataURL(file);
    });
  }

  function groupName(groupId) {
    if (!groupId) return t("ungrouped");
    return (
      settings.groups.find((group) => group.id === groupId)?.name ||
      t("ungrouped")
    );
  }

  function ruleMatchesActiveGroup(rule) {
    if (activeGroupId === ALL_GROUPS) return true;
    if (activeGroupId === UNGROUPED) return !rule.groupId;
    return rule.groupId === activeGroupId;
  }

  function filteredRules() {
    return settings.rules.filter((rule) => {
      const searchable = [
        rule.name,
        rule.label,
        groupName(rule.groupId),
        ...(rule.patterns || []),
        ...(rule.excludePatterns || []),
      ]
        .join(" ")
        .toLowerCase();
      return ruleMatchesActiveGroup(rule) && searchable.includes(searchValue);
    });
  }

  function formatKilobytes(bytes) {
    return (Math.max(0, Number(bytes) || 0) / 1024).toFixed(1);
  }

  function storageErrorMessage(code) {
    if (code === "sync-too-large") return t("syncTooLarge");
    if (code === "sync-unavailable") return t("syncUnavailable");
    if (
      code === "sync-corrupt" ||
      code === "sync-format" ||
      code === "sync-missing"
    ) {
      return t("syncDataInvalid");
    }
    return t("syncFallbackLocal");
  }

  function renderStorageStatus() {
    const select = $("#storagePreference");
    const node = $("#storageStatus");
    if (!storageStatus) {
      select.value = "local";
      node.textContent = t("storageLoading");
      return;
    }

    select.value = storageStatus.preference;
    const syncOption = Array.from(select.options).find(
      (option) => option.value === "sync",
    );
    if (syncOption) syncOption.disabled = !storageStatus.syncAvailable;

    if (!storageStatus.syncAvailable) {
      node.className = "storage-status warning";
      node.textContent = t("syncUnavailable");
      return;
    }
    if (storageStatus.lastError) {
      node.className = "storage-status warning";
      node.textContent = storageErrorMessage(storageStatus.lastError);
      return;
    }
    if (storageStatus.preference === "sync") {
      node.className = "storage-status success";
      node.textContent = t(
        "storageSyncActive",
        formatKilobytes(storageStatus.bytes),
      );
      return;
    }
    node.className = "storage-status";
    node.textContent = t("storageLocalActive");
  }

  async function changeStoragePreference(preference) {
    const select = $("#storagePreference");
    select.disabled = true;
    try {
      await EnvFavicon.setStoragePreference(preference, settings);
      storageStatus = await EnvFavicon.getStorageStatus(settings);
      renderStorageStatus();
      toast(
        preference === "sync"
          ? t("storageSyncEnabled")
          : t("storageLocalEnabled"),
      );
    } catch (error) {
      console.error("Unable to change storage preference", error);
      storageStatus = await EnvFavicon.getStorageStatus(settings).catch(
        () => storageStatus,
      );
      renderStorageStatus();
      toast(storageErrorMessage(error?.code));
    } finally {
      select.disabled = false;
    }
  }

  function renderGroupTabs() {
    const tabs = $("#groupTabs");
    clear(tabs);
    const definitions = [
      { id: ALL_GROUPS, name: t("allGroups"), color: "#64748B" },
      ...settings.groups,
      { id: UNGROUPED, name: t("ungrouped"), color: "#94A3B8" },
    ];

    definitions.forEach((group) => {
      const count = settings.rules.filter((rule) => {
        if (group.id === ALL_GROUPS) return true;
        if (group.id === UNGROUPED) return !rule.groupId;
        return rule.groupId === group.id;
      }).length;
      if (group.id === UNGROUPED && count === 0) return;

      const button = createElement("button", "group-tab");
      button.type = "button";
      button.dataset.groupId = group.id;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(activeGroupId === group.id));
      button.classList.toggle("active", activeGroupId === group.id);

      const dot = createElement("span", "group-tab-dot");
      dot.style.backgroundColor = group.color;
      dot.setAttribute("aria-hidden", "true");
      const name = createElement("span", "", group.name);
      const badge = createElement("strong", "", String(count));
      button.append(dot, name, badge);
      button.addEventListener("click", () => {
        activeGroupId = group.id;
        render();
      });
      tabs.appendChild(button);
    });

    const editable = ![ALL_GROUPS, UNGROUPED].includes(activeGroupId);
    $("#renameGroup").disabled = !editable;
    $("#deleteGroup").disabled = !editable;
  }

  function fillGroupSelect(select, selectedId) {
    clear(select);
    const ungrouped = createElement("option", "", t("ungrouped"));
    ungrouped.value = "";
    select.appendChild(ungrouped);
    settings.groups.forEach((group) => {
      const option = createElement("option", "", group.name);
      option.value = group.id;
      select.appendChild(option);
    });
    select.value = selectedId || "";
  }

  function moveRule(rule, direction) {
    const visible = filteredRules();
    const visibleIndex = visible.findIndex(
      (candidate) => candidate.id === rule.id,
    );
    const neighbor = visible[visibleIndex + direction];
    if (!neighbor) return;

    const ruleIndex = settings.rules.findIndex(
      (candidate) => candidate.id === rule.id,
    );
    const neighborIndex = settings.rules.findIndex(
      (candidate) => candidate.id === neighbor.id,
    );
    [settings.rules[ruleIndex], settings.rules[neighborIndex]] = [
      settings.rules[neighborIndex],
      settings.rules[ruleIndex],
    ];
    void persist(t("ruleMoved"));
  }

  function renderRuleValidation(card, rule, ruleIndex) {
    const node = $(".rule-validation", card);
    const issues = EnvFavicon.validateRule(rule, ruleIndex);
    clear(node);

    if (!issues.length) {
      node.className = "rule-validation valid";
      node.textContent = t("ruleValid");
      return;
    }

    node.className = "rule-validation invalid";
    const title = createElement("strong", "", t("validationIssues"));
    const list = createElement("ul");
    issues.forEach((issue) =>
      list.appendChild(createElement("li", "", formatIssue(issue))),
    );
    node.append(title, list);
  }

  function renderRule(rule, visibleIndex, visibleCount) {
    const template = $("#ruleTemplate");
    const card = template.content.firstElementChild.cloneNode(true);
    EnvI18n.localizeDocument(card);
    card.dataset.id = rule.id;

    const ruleIndex = settings.rules.findIndex(
      (candidate) => candidate.id === rule.id,
    );
    $(".dot", card).style.backgroundColor = rule.color;
    $(".rule-name", card).value = rule.name;
    $(".rule-enabled", card).checked = rule.enabled;
    $(".rule-label", card).value = rule.label;
    $(".rule-color", card).value = rule.color;
    $(".rule-priority", card).value = String(rule.priority || 0);
    fillGroupSelect($(".rule-group", card), rule.groupId);
    $(".rule-match-type", card).value = rule.matchType;
    $(".rule-keep-original", card).checked = rule.keepOriginalFavicon;
    $(".rule-patterns", card).value = rule.patterns.join("\n");
    $(".rule-exclusions", card).value = rule.excludePatterns.join("\n");
    $(".rule-favicon", card).value = rule.favicon;

    const preview = $(".favicon-preview", card);
    preview.src = faviconPreviewUrl(rule);
    preview.addEventListener(
      "error",
      () => {
        preview.src = "icons/icon-48.png";
        preview.classList.add("preview-error");
      },
      { once: true },
    );

    const moveUp = $(".move-up", card);
    const moveDown = $(".move-down", card);
    moveUp.disabled = visibleIndex === 0;
    moveDown.disabled = visibleIndex === visibleCount - 1;

    const bind = (selector, event, handler) =>
      $(selector, card).addEventListener(event, handler);
    bind(".rule-name", "change", (event) => {
      rule.name = event.target.value.trim() || t("untitled");
      void persist();
    });
    bind(".rule-enabled", "change", (event) => {
      rule.enabled = event.target.checked;
      void persist();
    });
    bind(".rule-label", "change", (event) => {
      rule.label = event.target.value.trim().toUpperCase() || "ENV";
      void persist();
    });
    bind(".rule-color", "change", (event) => {
      rule.color = event.target.value;
      void persist();
    });
    bind(".rule-priority", "change", (event) => {
      rule.priority = Number.parseInt(event.target.value, 10) || 0;
      void persist();
    });
    bind(".rule-group", "change", (event) => {
      rule.groupId = event.target.value || null;
      void persist();
    });
    bind(".rule-match-type", "change", (event) => {
      rule.matchType = event.target.value;
      void persist();
    });
    bind(".rule-keep-original", "change", (event) => {
      rule.keepOriginalFavicon = event.target.checked;
      void persist();
    });
    bind(".rule-patterns", "change", (event) => {
      rule.patterns = linesToArray(event.target.value);
      void persist();
    });
    bind(".rule-exclusions", "change", (event) => {
      rule.excludePatterns = linesToArray(event.target.value);
      void persist();
    });
    bind(".rule-favicon", "change", (event) => {
      rule.favicon = event.target.value.trim();
      void persist();
    });
    bind(".rule-favicon-file", "change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (file.size > MAX_FAVICON_BYTES) {
        toast(t("faviconTooLarge"));
        event.target.value = "";
        return;
      }
      if (file.type && !file.type.startsWith("image/")) {
        toast(t("faviconInvalidType"));
        event.target.value = "";
        return;
      }
      try {
        rule.favicon = await readFileAsDataUrl(file);
        rule.keepOriginalFavicon = false;
        await persist(t("faviconImported"));
      } catch (error) {
        console.error("Unable to import favicon", error);
        toast(t("faviconImportFailed"));
      } finally {
        event.target.value = "";
      }
    });
    bind(".generate-favicon", "click", () => {
      rule.favicon = EnvFavicon.createGeneratedFavicon(
        rule.label || rule.name,
        rule.color,
      );
      rule.keepOriginalFavicon = false;
      void persist(t("faviconGenerated"));
    });
    bind(".move-up", "click", () => moveRule(rule, -1));
    bind(".move-down", "click", () => moveRule(rule, 1));
    bind(".duplicate-rule", "click", () => {
      const copy = EnvFavicon.normalizeRule({
        ...rule,
        id: EnvFavicon.makeId("rule"),
        name: `${rule.name} ${t("copySuffix")}`,
      });
      settings.rules.splice(ruleIndex + 1, 0, copy);
      void persist(t("environmentDuplicated"));
    });
    bind(".remove-rule", "click", () => {
      if (!confirm(t("removeEnvironmentConfirm", rule.name))) return;
      settings.rules = settings.rules.filter(
        (candidate) => candidate.id !== rule.id,
      );
      void persist(t("environmentRemoved"));
    });

    renderRuleValidation(card, rule, ruleIndex);
    return card;
  }

  function renderValidationSummary() {
    const node = $("#validationSummary");
    const issues = EnvFavicon.validateSettings(settings);
    node.className = `validation-summary ${issues.length ? "invalid" : "valid"}`;
    node.textContent = issues.length
      ? t("configurationIssueCount", String(issues.length))
      : t("configurationValid");
  }

  function appendDiagnosticRow(container, evaluation, isWinner) {
    const row = createElement(
      "article",
      `diagnostic-row${isWinner ? " winner" : ""}`,
    );
    const heading = createElement("div", "diagnostic-row-heading");
    const dot = createElement("span", "dot");
    dot.style.backgroundColor = evaluation.rule.color;
    dot.setAttribute("aria-hidden", "true");
    const name = createElement("strong", "", evaluation.rule.name);
    const priority = createElement(
      "span",
      "priority-pill",
      t("priorityValue", String(evaluation.rule.priority || 0)),
    );
    heading.append(dot, name, priority);
    if (isWinner)
      heading.appendChild(createElement("span", "winner-pill", t("winner")));

    const details = createElement("p", "diagnostic-detail");
    details.textContent = t("matchedBy", evaluation.includedBy || "-");
    row.append(heading, details);
    container.appendChild(row);
  }

  function renderTester() {
    const summary = $("#testerSummary");
    const results = $("#testerResults");
    clear(summary);
    clear(results);

    const url = testedUrl.trim();
    if (!url) {
      summary.className = "tester-summary muted";
      summary.textContent = t("noUrlTested");
      return;
    }

    const diagnosis = EnvFavicon.diagnoseUrl(url, settings);
    if (!diagnosis.validUrl) {
      summary.className = "tester-summary warning";
      summary.textContent = t("invalidUrl");
      return;
    }

    if (!diagnosis.enabled) {
      summary.className = "tester-summary warning";
      summary.textContent = t("globallyDisabled");
      return;
    }

    if (!diagnosis.winner) {
      summary.className = "tester-summary muted";
      summary.textContent = t("noMatchingEnvironment");
    } else {
      summary.className = `tester-summary success${diagnosis.hasConflict ? " conflict" : ""}`;
      const dot = createElement("span", "dot");
      dot.style.backgroundColor = diagnosis.winner.color;
      dot.setAttribute("aria-hidden", "true");
      summary.append(
        dot,
        document.createTextNode(t("winnerSummary", diagnosis.winner.name)),
      );
      if (diagnosis.hasConflict) {
        summary.appendChild(
          createElement("span", "conflict-badge", t("conflictDetected")),
        );
      }
    }

    if (diagnosis.matches.length) {
      const matchesSection = createElement("section", "diagnostic-section");
      matchesSection.appendChild(createElement("h3", "", t("matchedRules")));
      diagnosis.matches.forEach((evaluation, index) =>
        appendDiagnosticRow(matchesSection, evaluation, index === 0),
      );
      results.appendChild(matchesSection);
    }

    const excluded = diagnosis.evaluations.filter(
      (evaluation) => evaluation.includedBy && evaluation.excludedBy,
    );
    if (excluded.length) {
      const excludedSection = createElement("section", "diagnostic-section");
      excludedSection.appendChild(createElement("h3", "", t("excludedRules")));
      excluded.forEach((evaluation) => {
        const row = createElement("article", "diagnostic-row excluded");
        const heading = createElement("div", "diagnostic-row-heading");
        const dot = createElement("span", "dot");
        dot.style.backgroundColor = evaluation.rule.color;
        heading.append(dot, createElement("strong", "", evaluation.rule.name));
        row.append(
          heading,
          createElement(
            "p",
            "diagnostic-detail",
            t("excludedBy", evaluation.excludedBy),
          ),
        );
        excludedSection.appendChild(row);
      });
      results.appendChild(excludedSection);
    }

    const errors = diagnosis.evaluations.flatMap((evaluation) =>
      evaluation.errors.map((error) => ({ ...error, rule: evaluation.rule })),
    );
    if (errors.length) {
      const errorSection = createElement(
        "section",
        "diagnostic-section diagnostic-errors",
      );
      errorSection.appendChild(createElement("h3", "", t("patternErrors")));
      const list = createElement("ul");
      errors.forEach((error) => {
        const issue = { code: error.code, pattern: error.pattern };
        list.appendChild(
          createElement("li", "", `${error.rule.name}: ${formatIssue(issue)}`),
        );
      });
      errorSection.appendChild(list);
      results.appendChild(errorSection);
    }
  }

  function render() {
    if (!settings) return;
    $("#enabled").checked = settings.enabled;
    $("#titlePrefixEnabled").checked = settings.titlePrefixEnabled;
    $("#reapplyOnChanges").checked = settings.reapplyOnChanges;
    $("#debug").checked = settings.debug;

    renderStorageStatus();
    renderGroupTabs();
    renderValidationSummary();

    const container = $("#rulesContainer");
    clear(container);
    const visible = filteredRules();
    if (!visible.length) {
      container.appendChild(
        createElement("p", "empty-state", t("noFilterMatches")),
      );
    } else {
      visible.forEach((rule, index) =>
        container.appendChild(renderRule(rule, index, visible.length)),
      );
    }
    renderTester();
  }

  function downloadJson(payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `environment-favicon-config-${date}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function useActiveTab() {
    const tabsApi = EnvFavicon.api?.tabs;
    if (!tabsApi?.query) {
      toast(t("activeTabUnavailable"));
      return;
    }
    try {
      const tabs = await EnvFavicon.callApi(tabsApi.query.bind(tabsApi), {
        active: true,
        currentWindow: true,
      });
      const url = tabs?.[0]?.url || "";
      if (!url) throw new Error("The active tab has no readable URL.");
      testedUrl = url;
      $("#testUrl").value = url;
      renderTester();
    } catch (error) {
      console.error("Unable to read active tab", error);
      toast(t("activeTabUnavailable"));
    }
  }

  $("#enabled").addEventListener("change", (event) =>
    updateGlobalSetting("enabled", event.target.checked),
  );
  $("#titlePrefixEnabled").addEventListener("change", (event) =>
    updateGlobalSetting("titlePrefixEnabled", event.target.checked),
  );
  $("#reapplyOnChanges").addEventListener("change", (event) =>
    updateGlobalSetting("reapplyOnChanges", event.target.checked),
  );
  $("#debug").addEventListener("change", (event) =>
    updateGlobalSetting("debug", event.target.checked),
  );
  $("#storagePreference").addEventListener("change", (event) => {
    void changeStoragePreference(event.target.value);
  });

  $("#search").addEventListener("input", (event) => {
    searchValue = event.target.value.trim().toLowerCase();
    render();
  });

  $("#ruleTesterForm").addEventListener("submit", (event) => {
    event.preventDefault();
    testedUrl = $("#testUrl").value;
    renderTester();
  });
  $("#testUrl").addEventListener("input", (event) => {
    testedUrl = event.target.value;
    clearTimeout(testerTimer);
    testerTimer = setTimeout(renderTester, 180);
  });
  $("#useActiveTab").addEventListener("click", () => void useActiveTab());

  $("#addGroup").addEventListener("click", () => {
    const name = prompt(t("newGroupName"));
    if (name === null) return;
    if (!name.trim()) {
      toast(t("groupNameRequired"));
      return;
    }
    const group = EnvFavicon.normalizeGroup({
      id: EnvFavicon.makeId("group"),
      name: name.trim(),
      color: "#64748B",
    });
    settings.groups.push(group);
    activeGroupId = group.id;
    void persist(t("groupAdded"));
  });

  $("#renameGroup").addEventListener("click", () => {
    const group = settings.groups.find(
      (candidate) => candidate.id === activeGroupId,
    );
    if (!group) return;
    const name = prompt(t("renameGroupPrompt"), group.name);
    if (name === null) return;
    if (!name.trim()) {
      toast(t("groupNameRequired"));
      return;
    }
    group.name = name.trim();
    void persist(t("groupRenamed"));
  });

  $("#deleteGroup").addEventListener("click", () => {
    const group = settings.groups.find(
      (candidate) => candidate.id === activeGroupId,
    );
    if (!group || !confirm(t("deleteGroupConfirm", group.name))) return;
    settings.groups = settings.groups.filter(
      (candidate) => candidate.id !== group.id,
    );
    settings.rules.forEach((rule) => {
      if (rule.groupId === group.id) rule.groupId = null;
    });
    activeGroupId = ALL_GROUPS;
    void persist(t("groupDeleted"));
  });

  $("#addRule").addEventListener("click", () => {
    const groupId = ![ALL_GROUPS, UNGROUPED].includes(activeGroupId)
      ? activeGroupId
      : null;
    const highestPriority = settings.rules.reduce(
      (maximum, rule) => Math.max(maximum, rule.priority || 0),
      0,
    );
    settings.rules.unshift(
      EnvFavicon.normalizeRule({
        id: EnvFavicon.makeId("rule"),
        groupId,
        name: t("newEnvironment"),
        label: "ENV",
        color: "#64748B",
        priority: Math.min(999, highestPriority + 10),
        matchType: "hostname",
        patterns: ["example.local"],
        favicon: EnvFavicon.createGeneratedFavicon("ENV", "#64748B"),
      }),
    );
    void persist(t("environmentAdded"));
  });

  $("#resetDefaults").addEventListener("click", () => {
    if (!confirm(t("resetConfirm"))) return;
    settings = EnvFavicon.normalizeSettings(DEFAULT_SETTINGS);
    activeGroupId = ALL_GROUPS;
    void persist(t("configurationReset"));
  });

  $("#exportConfig").addEventListener("click", () => {
    downloadJson(EnvFavicon.createExportPayload(settings));
    toast(t("configurationExported"));
  });

  $("#importConfig").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      toast(t("importTooLarge"));
      event.target.value = "";
      return;
    }

    try {
      const payload = JSON.parse(await file.text());
      const imported = EnvFavicon.parseImportPayload(payload);
      settings = $("#mergeImport").checked
        ? EnvFavicon.mergeSettings(settings, imported)
        : imported;
      activeGroupId = ALL_GROUPS;
      await persist(t("configurationImported"));
    } catch (error) {
      console.error("Unable to import configuration", error);
      toast(t("invalidJson"));
    } finally {
      event.target.value = "";
    }
  });

  EnvFavicon.getSettings()
    .then(async (loaded) => {
      settings = loaded;
      storageStatus = await EnvFavicon.getStorageStatus(loaded);
      render();
    })
    .catch((error) => {
      console.error("Unable to load configuration", error);
      settings = EnvFavicon.normalizeSettings(DEFAULT_SETTINGS);
      storageStatus = {
        preference: "local",
        syncAvailable: Boolean(EnvFavicon.api?.storage?.sync),
        bytes: EnvFavicon.byteLength(JSON.stringify(settings)),
        maximumBytes: EnvFavicon.MAX_SYNC_BYTES,
        lastError: null,
      };
      render();
      toast(t("loadFailed"));
    });
})();
