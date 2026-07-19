# Interface design system

The extension retains its dependency-free HTML, CSS and JavaScript architecture. The design system lives primarily in `styles/app.css`; `src/ui.js` contains only the accessibility and focus behaviour that cannot be expressed in CSS or static HTML.

## Principles

1. Prefer native HTML and browser behaviour.
2. Name design decisions by purpose, not by literal color.
3. Keep one clear primary action per local task area.
4. Use composition and shared classes before creating another component variant.
5. Do not add a generic component until an existing product flow needs it.
6. Preserve readable density and a minimum 44 px interactive target.
7. Treat keyboard, contrast, zoom, motion and high-contrast support as component requirements.

## Token architecture

### 1. Primitive tokens

Raw palette values are private implementation details such as `--primitive-slate-900`, `--primitive-blue-600` and `--primitive-red-700`. Product selectors should not consume these directly unless they define a new semantic role.

### 2. Semantic tokens

Semantic roles define the meaning of a value:

- backgrounds: `--color-background-primary`, `--color-background-muted`;
- surfaces: `--color-surface`, `--color-surface-raised`, `--color-surface-subtle`;
- text: `--color-text-primary`, `--color-text-secondary`, `--color-text-tertiary`;
- borders: `--color-border-default`, `--color-border-strong`;
- actions: `--color-action-primary`, `--color-action-danger` and interaction-state variants;
- feedback: `--color-feedback-success`, `--color-feedback-warning`, `--color-feedback-error` plus surface and border roles;
- accessibility: `--color-focus-ring`, `--color-focus-offset`.

Dark mode overrides semantic roles under `prefers-color-scheme: dark`. Components therefore keep the same implementation in both themes.

### 3. Component tokens

Component aliases—such as `--button-primary-background`, `--input-border` and `--card-radius`—allow local component evolution without changing the semantic palette contract.

## Foundation scales

| Foundation | Convention |
| --- | --- |
| Typography | System-font stack; `--font-size-100` through `--font-size-800`; explicit regular, medium, semibold and bold weights. |
| Spacing | Four-pixel base rhythm via `--space-0` through `--space-16`. |
| Radius | `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl` and pill. |
| Icon size | Small, medium and large tokens; functional icons use the shared `.icon` SVG treatment. |
| Controls | Small, medium and large heights; minimum target defined by `--size-target-min: 2.75rem`. |
| Containers | A bounded application content width and a narrower reading width. |
| Density | Shared control inline padding, control gap and responsive panel padding. |
| Elevation | Four levels from none to transient overlay; routine panels use restrained elevation. |
| Motion | Instant, fast and moderate durations with standard and emphasized curves. |
| Breakpoints | Small mobile, mobile, tablet and desktop tokens document the responsive contract. Concrete values are repeated in media queries because custom properties cannot be used in media-query conditions. |

## Implemented component inventory

### Actions

- **Button**: default, primary and danger intentions; hover, active, focus and disabled states.
- **IconButton**: fixed square target with localized accessible name; SVG is decorative.
- **ImportButton**: visual button composed with a native file input that remains keyboard-focusable.

### Forms

- **FormField**: visible label, control and optional `.field-hint` description.
- **Input / SearchField / Textarea / Select**: shared sizing, border, focus and disabled treatment.
- **Checkbox**: native input with semantic label.
- **Switch**: native checkbox exposed as a switch in the popup, with a forced-colors fallback to native appearance.
- **Color input**: native picker retained for browser compatibility.

### Feedback and content

- **Status / Alert**: muted, success, warning, conflict and error presentations; color is reinforced by text and structure.
- **Badge / Pill**: conflict, winner and priority metadata.
- **Card / Panel**: hero, settings, diagnostics, groups, rule and popup status surfaces share tokenized borders and radii.
- **Skeleton / Spinner**: stable initial rule-loading presentation.
- **Toast**: concise transient confirmation region.
- **EmptyState**: centered, readable state with room for a recovery action.
- **PageHeader / SectionHeading**: consistent eyebrow, heading, description and local actions.
- **EnvironmentFilter**: labelled group of toggle buttons using `aria-pressed`.
- **RuleCard**: composed form fields, local validation and local actions with a generated accessible heading.

Modal, dropdown, tooltip, tab, breadcrumb, pagination and table components are intentionally absent because no current screen requires them.

## Interaction conventions

- Use a native element before adding an ARIA role.
- Pair every editable value with a visible label.
- Keep help and errors close to their control and connect them with `aria-describedby`.
- Reserve `role="status"` for concise non-blocking feedback; never make a large editable region live.
- Use `.primary` only for the main action in a local task area.
- Use `.danger` only for destructive actions.
- Use `.icon-button` only with an accessible name from `aria-label` or the existing localization attribute.
- Hide decorative SVGs and dots with `aria-hidden="true"`.
- Never rely on hover or color alone to communicate state.
- Preserve user input and keyboard position through validation or re-rendering.

## Focus model

- Focus uses a consistent three-pixel ring with a three-pixel offset.
- The ring meets the non-text contrast requirement against supported surfaces in light and dark themes.
- Native file inputs receive focus even though the visual label supplies the button appearance.
- Dynamic rule rendering restores focus to the equivalent control.
- Add and duplicate focus the new rule name; delete focuses the nearest remaining rule or the add action; move preserves the moved rule action; environment filtering preserves the selected filter.

## Responsive contract

- **Large desktop**: full rule metadata grid and inline toolbars.
- **Small desktop**: reduced metadata columns without truncating content.
- **Tablet**: two-column forms where useful; page-level headers and toolbars may stack.
- **Mobile**: single-column forms, full-width important actions and wrapped rule headers.
- **Small mobile (320–360 px)**: one-column popup actions and compact but touch-safe spacing.
- Grid tracks use `minmax(0, …)` and flexible children use `min-width: 0` so long content and 200% text resize can reflow instead of forcing horizontal scrolling.

## User preferences and compatibility

- `prefers-color-scheme` changes semantic tokens, not component selectors.
- `prefers-reduced-motion` removes smooth scrolling and reduces animation/transition time to effectively immediate feedback.
- `forced-colors` restores system-visible borders, focus and native switch rendering.
- The implementation uses standards-based HTML, CSS and DOM APIs shared by current Firefox and Chromium-based browsers; final packaged-extension verification remains required in both target browsers.
