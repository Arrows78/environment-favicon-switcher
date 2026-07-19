# UI verification report

## Automated source checks

Executed in the prepared UI bundle:

```sh
node --check src/ui.js
node --test tests/ui.test.js
```

The source test suite checks:

- presence of the required semantic token families;
- WCAG AA contrast ratios for key light- and dark-theme pairs;
- focus-indicator contrast;
- dark mode, reduced motion and forced colors;
- keyboard-focusable file inputs;
- correct environment-filter semantics;
- scoped live regions and busy state;
- visible labels, descriptions and icon-button names;
- dynamic focus restoration and validation associations;
- mobile reflow safeguards;
- unique static IDs and correct script scope.

## Browser rendering checks

A local Chromium harness rendered representative populated options and popup states using the shipped HTML, CSS and UI adapter. It checked:

- options widths: 1440, 1024, 768, 390, 320 CSS pixels;
- popup widths: 384 and 320 CSS pixels;
- horizontal overflow;
- minimum button height;
- file-input focus and visible focus ring;
- environment-filter role and pressed state;
- generated rule labels and descriptions;
- focus after an ordinary re-render and after adding a rule;
- reduced-motion computed styles;
- forced-colors switch fallback;
- 200% text-size reflow;
- keyboard tab reachability of both global and per-rule import controls;
- unnamed interactive nodes in Chromium's accessibility tree.

Captured screenshots and machine-readable check results are supplied in the separate review-evidence archive.

## Not executed in this environment

- `npm ci`, repository lint, full validation, packaging and original unit/integration tests, because a complete Git checkout was not available in the execution environment.
- Firefox runtime rendering, because no Firefox binary was installed.
- Installation as a live browser extension with real browser APIs and permissions.
- Manual screen-reader testing.
- Automated end-to-end business-flow testing against the original extension runtime.

These checks must be completed after applying the bundle to a full checkout.
