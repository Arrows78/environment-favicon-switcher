# Environment Favicon Switcher

Environment Favicon Switcher is a Chrome and Firefox extension that automatically changes a tab's favicon based on the environment detected in its URL.

It supports multiple environments: local, review app, sandbox, staging, production, and any custom internal environment.

The goal is simple: prevent context-related mistakes. When multiple tabs look alike, the custom favicon, browser badge, and optional title prefix make it immediately clear which environment you are currently using.

## Features

- Automatically detects the current environment from the page URL.
- Provides configurable rules through an options page, without requiring code changes.
- Includes a browser toolbar popup showing the status of the active tab.
- Allows the extension to be enabled or disabled globally.
- Supports adding, editing, duplicating, and deleting environments.
- Provides three matching modes:
  - URL contains
  - Domain or subdomain
  - Regular expression
- Supports custom favicons from:
  - Local extension paths
  - Remote URLs
  - Imported image files
- Can preserve the original website favicon, which is especially useful for production.
- Displays the detected environment in the browser badge.
- Can prefix the tab title, for example: `[STAGING] MyApp`
- Automatically reapplies the favicon if a single-page application replaces it after the page has loaded.
- Supports JSON configuration import and export.
- Includes default configurations for MyApp that can be customized by each user.

## Localization

English is the default locale, configured through `default_locale` in `manifest.json`.
Translations are stored in:

```text
_locales/
├── en/messages.json
└── fr/messages.json
```

Chrome and Firefox automatically select the locale from the browser UI language. Unsupported languages fall back to English.

To add another language, create `_locales/<locale>/messages.json` and provide the same message keys as the English file.

## Project Structure

```text
.
├── manifest.json
├── config/
│   └── defaults.js           # Initial configuration
├── src/
│   ├── content.js            # Environment detection and favicon replacement
│   ├── options.js            # Configuration page
│   ├── popup.js              # Browser popup
│   ├── service-worker.js     # Badge management and initialization
│   └── shared.js             # Shared helpers
├── styles/
│   └── app.css
├── popup.html
├── options.html
└── icons/
```

## Development Setup

### Chrome, Chromium, Brave, and Edge

1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the extension folder containing `manifest.json`.
6. Click the extension icon in the browser toolbar and verify that the popup opens correctly.

### Firefox

1. Download or clone this repository.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on**.
4. Select the `manifest.json` file.
5. Click the extension icon in the browser toolbar and verify that the popup opens correctly.

> Firefox removes temporary extensions when the browser restarts. For permanent distribution, the extension must be packaged as an XPI file and signed through Firefox Add-ons.

## Configuration

Open the extension popup and click **Configure**, or open the extension's options page directly from your browser.

Each environment contains the following fields:

| Field                 | Description                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Name                  | Human-readable environment name, for example `MyApp Staging`.                                                                |
| Short label           | Text displayed in the browser badge, for example `STG`                                                                       |
| Badge color           | Color associated with the environment.                                                                                       |
| Match type            | Method used to identify matching URLs.                                                                                       |
| URL patterns          | One value per line.                                                                                                          |
| Favicon               | Local path, remote URL, or image imported from your computer.                                                                |
| Keep original favicon | Keeps environment detection and the browser badge enabled without replacing the website favicon. Recommended for production. |

## Match Types

### URL Contains

This is the simplest matching mode.
A rule matches when the full page URL contains one of the configured values.

```text
staging.myapp.com
reviewapps.myapp.com
localhost
```

### Domain or Subdomain

A rule matches when the hostname is exactly the configured domain or one of its subdomains.

```text
myapp.com
example.local
```

For example, the following domains match the `myapp.com` rule:

```text
myapp.com
app.myapp.com
admin.myapp.com
```

A domain such as `fake-myapp.com` does not match.

### Regular Expression

Regular expressions can be used for more advanced matching rules.

```regex
https://pr-[0-9]+\.reviewapps\.myapp\.com
```

Invalid regular expressions are ignored.

## Custom Favicons

You can configure favicons using three different formats.

### Local Extension Path

```text
icons/favicon-staging.ico
```

This is the recommended option for stable configurations shared across a team.
The referenced file must be included in the extension package.

### Remote URL

```text
https://example.com/favicon-staging.ico
```

Remote favicons are supported, but they depend on the URL remaining publicly accessible.
For widely distributed extensions, bundled files or imported images are generally more reliable.

### Imported File

From the options page, click **Choose a file**.
The image is converted into a Data URL and stored in the user's local extension configuration.
This makes it possible to use custom images without modifying the extension source code.

## Production Environments

For production environments, enabling **Keep original favicon** is recommended.

The rule remains active, which means:

- The popup still identifies the tab as production.
- The browser badge can display `PROD`.
- The optional title prefix can still be applied.
- The extension does not replace the product's original favicon.

This provides a clear production warning while preserving the official product branding.

## Importing and Exporting Configuration

The options page provides two configuration actions.

### Export

The **Export** action downloads the current configuration as:

```text
environment-favicon-config.json
```

### Import

The **Import** action loads a previously exported JSON configuration.
This is the easiest way to share a common configuration across a team while still allowing each user to customize it locally.

## Default Configuration

Default environments are defined in:

```text
config/defaults.js
```

You can update this file to provide your team with a shared initial configuration.
Existing users may need to reset or import their configuration before changes to the default file become visible, depending on how their local configuration has already been initialized.

## Build and Packaging

From the project root, create a ZIP archive with:

```bash
zip -r environment-favicon-switcher.zip \
  manifest.json \
  popup.html \
  options.html \
  README.md \
  config \
  src \
  styles \
  icons
```

Make sure the archive contains `manifest.json` at its root.

## Chrome Web Store

1. Create the ZIP archive described above.
2. Open the Chrome Web Store Developer Dashboard.
3. Create a new item.
4. Upload the ZIP file.
5. Add the required store information:

   - Extension description
   - Screenshots
   - Icons
   - Privacy information
   - Support information
6. Submit the extension for review.

## Firefox Add-ons

1. Create the ZIP archive described above.

  ```bash
  zip -r environment-favicon-switcher.zip
  ```

2. Optionally rename the archive to `.xpi` for local testing.

  ```bash
  cp environment-favicon-switcher.zip environment-favicon-switcher.xpi
  ```

3. For official distribution, submit the extension to Firefox Add-ons.
4. Complete the review process to obtain a signed version.

## Permissions

The extension requests the following permissions:

- `storage`: Used to save the extension configuration locally.
- `tabs`: Used by the popup to read information about the active browser tab.
- `activeTab`: Used to interact with the current tab and reapply the matching environment rule.
- `<all_urls>`: Allows the content script to detect configured environments on any website.

The extension only applies changes when a configured rule matches the current URL.

## Privacy

Environment Favicon Switcher does not collect user data.

The extension does not:

- Track browsing history
- Send URLs to an external server
- Send configuration data to an external server
- Include analytics
- Include advertising
- Sell or share user data

Configuration is stored locally in the browser through the extension storage API.

Remote favicon URLs, when configured by the user, may cause the browser to request the corresponding external resource.

## Team Usage Recommendations

- Define common environments in `config/defaults.js`.
- Use short and recognizable badge labels: `LOC`, `REV`, `SBOX`, `STG`, `PROD`.
- Use **Domain or Subdomain** matching for stable domains.
- Use **Regular Expression** matching for dynamic review apps.
- Enable **Keep original favicon** for production environments.
- Use a consistent color convention across all team members.
- Export a reference JSON configuration and share it with the team.
- Keep production visually distinct from non-production environments.
- Avoid overly broad URL patterns that could match unrelated websites.

## Example Environment Rules

### Local Development

```text
Name: Local
Label: LOC
Match type: URL contains
Patterns:
localhost
127.0.0.1
```

### Review Apps

```text
Name: Review App
Label: REV
Match type: Regular expression
Patterns:
https://pr-[0-9]+\.reviewapps\.example\.com
```

### Staging

```text
Name: Staging
Label: STG
Match type: Domain or subdomain
Patterns:
staging.example.com
```

### Production

```text
Name: Production
Label: PROD
Match type: Domain or subdomain
Patterns:
example.com

Keep original favicon: enabled
```

## Troubleshooting

### The favicon does not change

Check the following:

1. Make sure the extension is enabled in the popup.
2. Verify that at least one environment rule matches the current URL.
3. Make sure the configured favicon path or URL is valid.
4. Click **Reapply** in the popup.
5. Enable the option that reapplies the favicon when the application changes it.
6. Reload the browser tab.

### The environment is not detected

- Verify the selected match type.
- Check for typing errors in the URL patterns.
- Make sure each pattern is entered on a separate line.
- Check whether another rule matches first.
- Test the regular expression separately if regex matching is enabled.

### Nothing happens on `chrome://` or `about:` pages

Browsers prevent extensions from injecting scripts into certain internal pages.

Examples include:

```text
chrome://extensions
chrome://settings
about:debugging
about:addons
```

This is expected browser behavior.

### The popup detects the environment, but the favicon does not change

The environment may have **Keep original favicon** enabled.
Disable this option if you want the extension to replace the favicon.

### The favicon changes and then reverts

Some single-page applications dynamically replace their favicon after the initial page load.
Enable the automatic favicon reapplication option in the extension settings.

### Remote favicons are not displayed

Make sure that the remote URL:

- Is publicly accessible
- Uses HTTPS
- Returns a valid image
- Does not require authentication
- Is not blocked by the website or browser security policy

For better reliability, import the image or include it in the `icons/` folder.

### An imported favicon is missing on another computer

Imported files are stored in the local browser configuration.
They are not automatically added to the source repository or synchronized with other users.
Export and share the configuration, or include the favicon directly in the extension package.

### Changes to `defaults.js` are not visible

The default configuration is generally used during the first initialization.
If a user already has a saved configuration, the extension may continue using the stored version.
Reset the configuration or import an updated JSON file.

## Browser Compatibility

The extension is designed for browsers supporting the WebExtensions API and Manifest V3, including:

- Google Chrome
- Chromium
- Brave
- Microsoft Edge
- Mozilla Firefox

Behavior may vary slightly between browsers, particularly for extension packaging, temporary installation, and store distribution.

## Security Considerations

- Only install the extension from a trusted source.
- Review remote favicon URLs before sharing a configuration.
- Avoid importing configuration files from unknown sources.
- Do not use excessively broad regular expressions.
- Keep extension permissions limited to what is required.
- Review changes to `manifest.json` before publishing a new release.

## Roadmap

Potential future improvements include:

- Optional synchronization through `storage.sync`
- Configuration profiles by team or project
- Built-in favicon generation from a color and label
- Configuration import from an internal JSON URL
- Explicit rule priorities
- Drag-and-drop rule ordering
- Per-project configuration groups
- Automatic environment suggestions
- Shared managed configuration for organizations
- Additional badge and title customization options

## Contributing

Contributions are welcome.

To contribute:

1. Fork the repository.

2. Create a feature branch.

   ```bash
   git checkout -b feat/my-feature
   ```

3. Make your changes.

4. Test the extension in Chrome and Firefox.

5. Commit your changes using Conventional Commits.

   ```bash
   git commit -m "feat: add a new matching option"
   ```

6. Push your branch.

   ```bash
   git push origin feat/my-feature
   ```

7. Open a pull request.

Please keep pull requests focused and document any user-facing behavior changes.

## Commit Convention

This project uses Conventional Commits.

Examples:

```text
feat: add environment duplication
fix: restore favicon after SPA navigation
docs: improve Firefox installation guide
refactor: simplify URL matching logic
style: improve options page layout
chore: update extension metadata
```
