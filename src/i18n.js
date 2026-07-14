(() => {
  const api = globalThis.browser || globalThis.chrome;

  function t(key, substitutions) {
    const translated = api?.i18n?.getMessage?.(key, substitutions);
    return translated || key;
  }

  function localizeDocument(root = document) {
    const documentRoot = root.documentElement || root.ownerDocument?.documentElement;
    if (documentRoot) documentRoot.lang = (api?.i18n?.getUILanguage?.() || "en").split("-")[0];

    root.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = t(node.dataset.i18n);
    });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
      node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
    });
    root.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
      node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
    });
    root.querySelectorAll("[data-i18n-alt]").forEach((node) => {
      node.setAttribute("alt", t(node.dataset.i18nAlt));
    });
    root.querySelectorAll("[data-i18n-title]").forEach((node) => {
      node.setAttribute("title", t(node.dataset.i18nTitle));
    });
  }

  globalThis.EnvI18n = { t, localizeDocument };
})();
