(() => {
  "use strict";

  const optionsPage = document.querySelector(".options-page");
  if (!optionsPage) return;

  const rulesContainer = document.querySelector("#rulesContainer");
  const groupTabs = document.querySelector("#groupTabs");
  const testerResults = document.querySelector("#testerResults");
  if (!rulesContainer || !groupTabs) return;

  const ruleControlClasses = [
    "rule-name",
    "rule-enabled",
    "rule-label",
    "rule-color",
    "rule-priority",
    "rule-group",
    "rule-match-type",
    "rule-keep-original",
    "rule-patterns",
    "rule-exclusions",
    "rule-favicon",
    "rule-favicon-file",
    "generate-favicon",
    "move-up",
    "move-down",
    "duplicate-rule",
    "remove-rule"
  ];

  let focusIntent = null;
  let lastRuleFocus = null;
  let enhancementFrame = 0;

  function currentRuleCards() {
    return Array.from(rulesContainer.querySelectorAll(".rule-card[data-id]"));
  }

  function ruleCardById(ruleId) {
    return currentRuleCards().find((card) => card.dataset.id === ruleId) || null;
  }

  function groupButtonById(groupId) {
    return Array.from(groupTabs.querySelectorAll(".group-tab")).find(
      (button) => button.dataset.groupId === groupId
    ) || null;
  }

  function controlSelector(element) {
    const matchingClass = ruleControlClasses.find((className) => element.classList.contains(className));
    return matchingClass ? `.${matchingClass}` : null;
  }

  function selectionState(element) {
    if (typeof element.selectionStart !== "number") return null;
    return {
      start: element.selectionStart,
      end: element.selectionEnd,
      direction: element.selectionDirection
    };
  }

  function setFocusIntent(intent) {
    focusIntent = {
      ...intent,
      expiresAt: Date.now() + 5000
    };
  }

  function focusElement(element, selection = null) {
    if (!element || element.disabled || element.getAttribute("aria-disabled") === "true") return false;

    element.focus({ preventScroll: true });
    if (selection && typeof element.setSelectionRange === "function") {
      try {
        element.setSelectionRange(selection.start, selection.end, selection.direction || "none");
      } catch (_) {
        // Some input types, such as number and color, do not expose a text selection.
      }
    }

    element.scrollIntoView({ block: "nearest", inline: "nearest" });
    return document.activeElement === element;
  }

  function normalizeGroupButtons() {
    groupTabs.setAttribute("role", "group");

    groupTabs.querySelectorAll(".group-tab").forEach((button) => {
      const isActive = button.classList.contains("active") || button.getAttribute("aria-selected") === "true";
      button.removeAttribute("role");
      button.removeAttribute("aria-selected");
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function tokenizedId(value, fallback) {
    const token = String(value || "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
    return token || fallback;
  }

  function appendDescribedBy(element, id) {
    const ids = new Set((element.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
    ids.add(id);
    element.setAttribute("aria-describedby", Array.from(ids).join(" "));
  }

  function removeDescribedBy(element, id) {
    const ids = (element.getAttribute("aria-describedby") || "")
      .split(/\s+/)
      .filter((candidate) => candidate && candidate !== id);
    if (ids.length) element.setAttribute("aria-describedby", ids.join(" "));
    else element.removeAttribute("aria-describedby");
  }

  function enhanceRuleCards() {
    currentRuleCards().forEach((card, index) => {
      const idToken = tokenizedId(card.dataset.id, String(index + 1));
      const heading = card.querySelector(".rule-card-heading");
      const nameInput = card.querySelector(".rule-name");
      const priorityInput = card.querySelector(".rule-priority");
      const priorityHint = card.querySelector(".field-hint");
      const validation = card.querySelector(".rule-validation");

      if (heading && nameInput) {
        heading.id = `rule-${idToken}-heading`;
        if (heading.textContent !== nameInput.value) heading.textContent = nameInput.value;
        card.setAttribute("aria-labelledby", heading.id);
      }

      if (priorityInput && priorityHint) {
        priorityHint.id = `rule-${idToken}-priority-hint`;
        appendDescribedBy(priorityInput, priorityHint.id);
      }

      if (validation) {
        validation.id = `rule-${idToken}-validation`;
        if (validation.classList.contains("invalid") && validation.textContent.trim()) {
          appendDescribedBy(card, validation.id);
        } else {
          removeDescribedBy(card, validation.id);
        }
      }
    });
  }

  function hideDecorativeDots(root) {
    root?.querySelectorAll(".dot:not([aria-hidden])").forEach((dot) => {
      dot.setAttribute("aria-hidden", "true");
    });
  }

  function activeElementCanKeepFocus() {
    const activeElement = document.activeElement;
    return Boolean(
      activeElement &&
      activeElement !== document.body &&
      activeElement !== document.documentElement &&
      activeElement.isConnected
    );
  }

  function restoreFocusIntent() {
    if (!focusIntent) return false;
    if (Date.now() > focusIntent.expiresAt) {
      focusIntent = null;
      return false;
    }

    let target = null;

    if (focusIntent.type === "new-rule") {
      const newCard = currentRuleCards().find((card) => !focusIntent.beforeIds.has(card.dataset.id));
      target = newCard?.querySelector(".rule-name") || null;
    } else if (focusIntent.type === "remove-rule") {
      const cards = currentRuleCards();
      const fallbackCard = cards[focusIntent.index] || cards[focusIntent.index - 1] || null;
      target = fallbackCard?.querySelector(".rule-name") || document.querySelector("#addRule");
    } else if (focusIntent.type === "same-rule") {
      target = ruleCardById(focusIntent.ruleId)?.querySelector(focusIntent.selector) || null;
    } else if (focusIntent.type === "group") {
      target = groupButtonById(focusIntent.groupId);
    }

    if (!target) return false;
    const focused = focusElement(target);
    if (focused) focusIntent = null;
    return focused;
  }

  function restoreRuleControlFocus() {
    if (!lastRuleFocus || activeElementCanKeepFocus()) return;

    const card = ruleCardById(lastRuleFocus.ruleId);
    const control = card?.querySelector(lastRuleFocus.selector) || null;
    if (focusElement(control, lastRuleFocus.selection)) {
      lastRuleFocus = {
        ...lastRuleFocus,
        selection: selectionState(control)
      };
    }
  }

  function enhanceRenderedInterface() {
    enhancementFrame = 0;
    normalizeGroupButtons();
    enhanceRuleCards();
    hideDecorativeDots(rulesContainer);
    hideDecorativeDots(testerResults);

    if (!rulesContainer.querySelector(".loading-state")) {
      rulesContainer.setAttribute("aria-busy", "false");
    }

    if (!restoreFocusIntent()) restoreRuleControlFocus();
  }

  function scheduleEnhancement() {
    if (enhancementFrame) cancelAnimationFrame(enhancementFrame);
    enhancementFrame = requestAnimationFrame(enhanceRenderedInterface);
  }

  document.addEventListener("focusin", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const card = target.closest(".rule-card[data-id]");
    if (!card || !rulesContainer.contains(card)) {
      lastRuleFocus = null;
      return;
    }

    const selector = controlSelector(target);
    if (!selector) return;

    lastRuleFocus = {
      ruleId: card.dataset.id,
      selector,
      selection: selectionState(target)
    };
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const button = target.closest("button");
    if (!button) return;

    if (button.id === "addRule") {
      setFocusIntent({
        type: "new-rule",
        beforeIds: new Set(currentRuleCards().map((card) => card.dataset.id))
      });
      return;
    }

    if (button.classList.contains("group-tab")) {
      setFocusIntent({ type: "group", groupId: button.dataset.groupId });
      return;
    }

    const card = button.closest(".rule-card[data-id]");
    if (!card) return;

    if (button.classList.contains("duplicate-rule")) {
      setFocusIntent({
        type: "new-rule",
        beforeIds: new Set(currentRuleCards().map((candidate) => candidate.dataset.id))
      });
      return;
    }

    if (button.classList.contains("remove-rule")) {
      setFocusIntent({
        type: "remove-rule",
        index: currentRuleCards().indexOf(card)
      });
      return;
    }

    if (button.classList.contains("move-up") || button.classList.contains("move-down")) {
      setFocusIntent({
        type: "same-rule",
        ruleId: card.dataset.id,
        selector: button.classList.contains("move-up") ? ".move-up" : ".move-down"
      });
    }
  }, true);

  const rulesObserver = new MutationObserver(scheduleEnhancement);
  rulesObserver.observe(rulesContainer, { childList: true, subtree: true });

  const groupsObserver = new MutationObserver(() => {
    normalizeGroupButtons();
    scheduleEnhancement();
  });
  groupsObserver.observe(groupTabs, { childList: true });

  if (testerResults) {
    const diagnosticsObserver = new MutationObserver(() => hideDecorativeDots(testerResults));
    diagnosticsObserver.observe(testerResults, { childList: true, subtree: true });
  }

  normalizeGroupButtons();
  hideDecorativeDots(testerResults);
  scheduleEnhancement();
})();
