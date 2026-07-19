# UX, UI and accessibility audit

## Scope and product context

The project is a small, dependency-free browser extension with two user-facing surfaces:

- `options.html`: configuration, diagnostics, environment groups and rule management.
- `popup.html`: current-page status, extension enablement and a shortcut to configuration.

The intervention deliberately keeps the existing native HTML/CSS/JavaScript architecture, DOM identifiers and business-event hooks. The goal is a safer, clearer and more maintainable interface rather than a framework migration or a rewrite of rule logic.

## Method

The audit covered:

- source structure and runtime boundaries;
- component and style duplication;
- typography, color, spacing, radius and elevation consistency;
- primary tasks and information hierarchy;
- form labelling, validation and feedback;
- loading, empty, success, error and disabled states;
- semantic HTML, accessible names, live regions and focus management;
- keyboard access, target size and tab order;
- responsive reflow from 320 px to 1440 px;
- light, dark, reduced-motion and forced-color preferences;
- 200% text resize and horizontal overflow;
- Chromium accessibility-tree output.

## Prioritized findings and decisions

### Critical — addressed

| Finding                                                                                    | Risk                                                                          | Decision and user benefit                                                                                                                                                   |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File inputs were hidden with `display: none`.                                              | Import actions could not be reached or operated reliably from the keyboard.   | Keep each native file input focusable and position it over the visual import control. The action retains native browser behaviour, a visible focus ring and a 44 px target. |
| Environment filters used `tablist` and `tab` without tab panels or the tab keyboard model. | Assistive technologies received a misleading interaction pattern.             | Use native toggle buttons in a labelled group and expose selection through `aria-pressed`.                                                                                  |
| The complete rules list was a live region.                                                 | Every render could announce a large, repetitive block of controls and values. | Limit announcements to concise status, validation and toast regions; expose list loading with `aria-busy`.                                                                  |
| A rule re-render could remove the currently focused node.                                  | Keyboard and screen-reader users could lose their place while editing.        | Add a small native DOM adapter that restores focus to the equivalent control and selects predictable targets after structural actions.                                      |

### Important — addressed

| Finding                                                                              | Risk                                                                              | Decision and user benefit                                                                                                       |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Visual decisions mixed generic variables and hard-coded values.                      | Inconsistent styling and expensive future theme changes.                          | Add primitive, semantic and component token layers for color, typography, spacing, shape, sizing, layout, elevation and motion. |
| Rule names lacked a persistent visible label and cards lacked programmatic headings. | Scanning and screen-reader navigation were weaker than the visual design implied. | Add a visible rule-name label and generate one heading per rendered rule card.                                                  |
| Several icon actions used arrow characters.                                          | Inconsistent rendering and ambiguous spoken output.                               | Use one inline SVG icon language; hide decorative SVGs and keep localized accessible button names.                              |
| Some controls were below a robust touch target.                                      | Higher error rate for touch, zoom and motor-impaired users.                       | Standardize interactive targets to at least 44 by 44 CSS pixels.                                                                |
| Initial rule loading looked like missing content.                                    | Poor perceived performance and uncertainty about application state.               | Reserve the final layout with a skeleton, spinner and explicit busy state.                                                      |
| Focus, dark mode, motion reduction and high-contrast behaviour were incomplete.      | Accessibility depended on browser defaults and could regress between themes.      | Define these behaviours centrally and test their computed output.                                                               |
| Page hierarchy mixed global settings, diagnostics, groups and rules.                 | Users had to infer which controls affected the extension globally versus locally. | Separate the four tasks into clearly titled surfaces, while preserving existing functionality and wording keys.                 |
| Small-width flex items kept desktop basis values.                                    | Mobile layouts could produce excessive gaps or clipped controls.                  | Reset flex basis and stack forms/actions at task-appropriate breakpoints.                                                       |

### Refinement — addressed

- Reduced excessive surface emphasis, shadows and decorative effects.
- Harmonized borders, radii, icon alignment, feedback colors and vertical rhythm.
- Improved line length, content width and spacing density.
- Added responsive single-column transformations rather than shrinking desktop layouts.
- Added a coherent native-role switch treatment in the popup.
- Preserved space for asynchronous content to reduce layout shifts.
- Kept actions next to the rule or section they affect.

## Main-task review

### Configure extension-wide preferences

The task now starts with a clear page title and compact settings section. Storage status is programmatically associated with its control. Import/export actions remain visually secondary to rule creation and editing.

### Diagnose a URL

The diagnostic form presents one explicit input and one action. Results, conflicts and validation use semantic feedback styles and concise status regions rather than relying only on color.

### Organize environments

Environment filters are represented as pressed buttons, making the interaction understandable with keyboard, touch and assistive technology. Group management stays adjacent to the filters it affects.

### Create and edit rules

Rule cards have a navigable heading, a visible name label, grouped metadata and local actions. Priority help and validation are associated programmatically. Adding, duplicating, moving and deleting rules preserve a predictable keyboard position after the existing renderer updates the DOM.

### Inspect current-page status in the popup

The popup prioritizes current status, enablement and the two relevant actions. It remains usable at 320 px, exposes the enable control as a switch and does not load the options-only enhancement script.

## State coverage

The refreshed UI provides explicit styling or structure for:

- initial and loading states;
- partial diagnostic results;
- success, warning, conflict and error feedback;
- empty rule lists;
- disabled controls;
- invalid rule cards and summaries;
- transient toast confirmation;
- busy rule rendering;
- dark mode, reduced motion and forced colors.

Offline and unauthorized states are not introduced because the current extension surfaces do not expose network authentication or remote-data flows.

## Architectural restraint

Generic components that the product does not currently use—modal, dropdown, tooltip, tabs, breadcrumb, pagination and table—were not added. Creating dormant abstractions would increase maintenance cost without improving an existing user journey. The implemented foundations make those components possible later without bypassing semantic tokens.

## Manual verification still required

- Screen-reader passes in current Firefox/NVDA and Chrome/JAWS or Chrome/VoiceOver combinations.
- Browser-extension popup sizing, permissions and focus behaviour in packaged Firefox and Chrome builds.
- A complete business-logic regression pass against the full repository test suite.
- Contrast checks for arbitrary user-selected environment colors, because those values are user content rather than design-system colors.
- Long localized strings and unusually long environment or rule names in every shipped locale.
- Final product review of whether destructive rule deletion should gain an explicit confirmation step; the existing business behaviour was intentionally preserved.
