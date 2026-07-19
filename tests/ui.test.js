const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const optionsHtml = read("options.html");
const popupHtml = read("popup.html");
const styles = read("styles/app.css");
const uiScript = read("src/ui.js");

function staticIds(html) {
  return Array.from(html.matchAll(/\sid="([^"]+)"/g), (match) => match[1]);
}

function tagById(html, id) {
  const expression = new RegExp(`<[^>]+\\sid="${id}"[^>]*>`, "i");
  return html.match(expression)?.[0] || "";
}

function blockAfter(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Missing CSS block marker: ${marker}`);
  const start = source.indexOf("{", markerIndex);
  assert.notEqual(start, -1, `Missing opening brace after: ${marker}`);

  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start + 1, index);
  }

  assert.fail(`Unclosed CSS block after: ${marker}`);
}

function tokenMap(block, base = {}) {
  const tokens = { ...base };
  for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    tokens[match[1]] = match[2].trim();
  }
  return tokens;
}

function resolveToken(name, tokens, seen = new Set()) {
  assert.ok(!seen.has(name), `Circular token reference: ${name}`);
  seen.add(name);
  const value = tokens[name];
  assert.ok(value, `Missing token: ${name}`);
  const reference = value.match(/^var\((--[a-z0-9-]+)\)$/i);
  return reference ? resolveToken(reference[1], tokens, seen) : value;
}

function relativeLuminance(hex) {
  assert.match(hex, /^#[0-9a-f]{6}$/i, `Expected an opaque hexadecimal color, received ${hex}`);
  const channels = [1, 3, 5].map(
    (index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255
  );
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

test("semantic design tokens cover color, type, spacing, shape, elevation and motion", () => {
  const requiredTokens = [
    "--color-background-primary",
    "--color-background-muted",
    "--color-surface",
    "--color-text-primary",
    "--color-text-secondary",
    "--color-border-default",
    "--color-action-primary",
    "--color-action-danger",
    "--color-feedback-success",
    "--color-feedback-warning",
    "--color-feedback-error",
    "--font-size-400",
    "--space-4",
    "--radius-md",
    "--elevation-1",
    "--size-icon-md",
    "--size-target-min",
    "--container-content",
    "--breakpoint-tablet",
    "--duration-fast",
    "--easing-standard"
  ];

  requiredTokens.forEach((token) => assert.match(styles, new RegExp(`${token}\\s*:`), token));
  assert.match(styles, /--size-target-min:\s*2\.75rem/);
  assert.match(styles, /--font-size-100:\s*0\.8125rem/);
});

test("semantic text and feedback pairs meet WCAG AA contrast in both themes", () => {
  const lightTokens = tokenMap(blockAfter(styles, ":root"));
  const darkMedia = blockAfter(styles, "@media (prefers-color-scheme: dark)");
  const darkTokens = tokenMap(blockAfter(darkMedia, ":root"), lightTokens);
  const pairs = [
    ["--color-text-primary", "--color-background-primary"],
    ["--color-text-secondary", "--color-background-primary"],
    ["--color-text-tertiary", "--color-surface"],
    ["--color-action-primary-text", "--color-action-primary"],
    ["--color-action-danger", "--color-surface"],
    ["--color-feedback-success", "--color-feedback-success-surface"],
    ["--color-feedback-warning", "--color-feedback-warning-surface"],
    ["--color-feedback-error", "--color-feedback-error-surface"]
  ];

  for (const [theme, tokens] of [["light", lightTokens], ["dark", darkTokens]]) {
    for (const [foregroundToken, backgroundToken] of pairs) {
      const ratio = contrastRatio(
        resolveToken(foregroundToken, tokens),
        resolveToken(backgroundToken, tokens)
      );
      assert.ok(
        ratio >= 4.5,
        `${theme}: ${foregroundToken} on ${backgroundToken} has contrast ${ratio.toFixed(2)}:1`
      );
    }

    const focusRatio = contrastRatio(
      resolveToken("--color-focus-ring", tokens),
      resolveToken("--color-surface", tokens)
    );
    assert.ok(focusRatio >= 3, `${theme}: focus indicator contrast is ${focusRatio.toFixed(2)}:1`);
  }
});

test("theme, motion and forced-color preferences are explicit", () => {
  assert.match(styles, /@media\s*\(prefers-color-scheme:\s*dark\)/);
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(styles, /@media\s*\(forced-colors:\s*active\)/);
  assert.match(styles, /outline:\s*3px solid var\(--color-focus-ring\)/);
});

test("file pickers stay keyboard focusable", () => {
  const fileInputRule = styles.match(/\.import-button\s*>\s*input\[type="file"\]\s*\{([^}]*)\}/s);
  assert.ok(fileInputRule, "Expected a dedicated file-input rule");
  assert.doesNotMatch(fileInputRule[1], /display\s*:\s*none/);
  assert.match(fileInputRule[1], /position\s*:\s*absolute/);
  assert.match(fileInputRule[1], /opacity\s*:\s*0/);
  assert.match(optionsHtml, /<label class="import-button">[\s\S]*?<input id="importConfig" type="file"/);
});

test("group filters use pressed buttons rather than incomplete tab semantics", () => {
  assert.doesNotMatch(optionsHtml, /role="tablist"/);
  assert.match(tagById(optionsHtml, "groupTabs"), /role="group"/);
  assert.match(uiScript, /setAttribute\("aria-pressed"/);
  assert.match(uiScript, /removeAttribute\("aria-selected"\)/);
  assert.match(uiScript, /removeAttribute\("role"\)/);
});

test("live regions are scoped to concise status messages", () => {
  const rulesContainer = tagById(optionsHtml, "rulesContainer");
  assert.ok(rulesContainer);
  assert.doesNotMatch(rulesContainer, /aria-live=/);
  assert.match(rulesContainer, /aria-busy="true"/);
  assert.doesNotMatch(optionsHtml, /class="rule-validation"\s+role="status"/);

  ["testerSummary", "validationSummary", "toast"].forEach((id) => {
    const tag = tagById(optionsHtml, id);
    assert.match(tag, /role="status"/, id);
    assert.doesNotMatch(tag, /aria-live=/, `${id} relies on the status role's implicit live behavior`);
  });

  const popupStatus = tagById(popupHtml, "status");
  assert.match(popupStatus, /role="status"/);
  assert.doesNotMatch(popupStatus, /aria-live=/);
});

test("native labels, descriptions and accessible icon controls are present", () => {
  assert.match(optionsHtml, /<label class="rule-name-field">[\s\S]*?<input class="rule-name"/);
  assert.match(tagById(optionsHtml, "storagePreference"), /aria-describedby="storageStatus"/);
  assert.doesNotMatch(optionsHtml, /&#8593;|&#8595;|↑|↓/);

  const iconButtons = Array.from(
    optionsHtml.matchAll(/<button class="(?:move-up|move-down) icon-button"[\s\S]*?<\/button>/g),
    (match) => match[0]
  );
  assert.equal(iconButtons.length, 2);
  iconButtons.forEach((button) => {
    assert.match(button, /data-i18n-aria-label=/);
    assert.match(button, /<svg[^>]+aria-hidden="true"/);
  });

  const popupToggle = tagById(popupHtml, "enabledToggle");
  assert.match(popupToggle, /class="switch-control"/);
  assert.match(popupToggle, /role="switch"/);
});

test("dynamic UI adapter restores focus and connects contextual help", () => {
  assert.match(uiScript, /new MutationObserver/);
  assert.match(uiScript, /focus\(\{ preventScroll: true \}\)/);
  assert.match(uiScript, /scrollIntoView\(\{ block: "nearest", inline: "nearest" \}\)/);
  assert.match(uiScript, /appendDescribedBy\(priorityInput, priorityHint\.id\)/);
  assert.match(uiScript, /validation\.classList\.contains\("invalid"\)/);
  assert.match(uiScript, /appendDescribedBy\(card, validation\.id\)/);
  assert.match(uiScript, /removeDescribedBy\(card, validation\.id\)/);
  assert.match(uiScript, /rulesContainer\.setAttribute\("aria-busy", "false"\)/);
  assert.match(uiScript, /type: "new-rule"/);
  assert.match(uiScript, /type: "remove-rule"/);
  assert.match(uiScript, /type: "group"/);
  assert.match(uiScript, /hideDecorativeDots\(testerResults\);\s*scheduleEnhancement\(\);/);
});

test("responsive layouts reflow without preserving desktop minimum widths", () => {
  const tabletBlock = blockAfter(styles, "@media (max-width: 48rem)");
  assert.match(tabletBlock, /\.toolbar-search\s*\{[\s\S]*?flex-basis:\s*auto/);
  assert.match(tabletBlock, /\.rule-title\s*\{[\s\S]*?flex-basis:\s*auto/);
  assert.match(styles, /\.rule-card-header\s*\{[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(styles, /\.rule-card\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(styles, /\.rule-main-grid\s*\{[\s\S]*?minmax\(0,/);
});

test("static document ids are unique and enhancement scripts are scoped", () => {
  [optionsHtml, popupHtml].forEach((html) => {
    const ids = staticIds(html);
    assert.equal(ids.length, new Set(ids).size, "Static IDs must be unique");
  });

  assert.ok(optionsHtml.indexOf('src="src/ui.js"') > optionsHtml.indexOf('src="src/options.js"'));
  assert.doesNotMatch(popupHtml, /src="src\/ui\.js"/, "The popup must not load the options-only adapter");
});
