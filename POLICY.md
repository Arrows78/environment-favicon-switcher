# Privacy Policy — Environment Favicon Switcher

Last updated: July 22, 2026

Environment Favicon Switcher is a browser extension that identifies development environments by changing the favicon, toolbar badge, and optionally the page title.

## Data processed locally

The extension processes the following information locally inside the browser:

- the URL of the pages on which the extension runs;
- user-defined environment names and labels;
- URL matching and exclusion patterns;
- favicon configuration;
- extension preferences;
- imported configuration files.

Page URLs are evaluated locally to determine whether an environment rule matches.

## Local storage

By default, configuration is stored locally using the browser extension storage API.

This configuration may contain environment names, domain names, URL patterns, exclusion patterns, colors, labels, and favicon data.

## Optional browser synchronization

The user may explicitly enable browser synchronization.

When enabled, extension settings may be transferred to and stored by the browser vendor’s synchronization service. Depending on the configuration, synchronized information may include rule names, URL patterns, domain names, preferences, and embedded favicon data.

Environment Favicon Switcher does not operate its own synchronization server.

## Optional remote favicons

A user may configure a favicon using a remote HTTPS image URL.

When such a favicon is active, the browser requests the image from the server selected by the user. That server may receive normal network information such as the user’s IP address, browser request headers, and request time.

Bundled, generated, and imported favicons do not require this external request.

## Data not collected by the developer

The developer does not:

- operate an analytics or telemetry service;
- collect browsing history on a developer-controlled server;
- sell or rent user data;
- use data for advertising;
- create user profiles;
- transmit configuration to a developer-controlled backend;
- execute remotely hosted JavaScript.

## Data sharing

The extension does not share information with third parties controlled by the developer.

Information may be processed by:

- the browser vendor, when the user enables browser synchronization;
- the operator of a remote favicon server selected by the user.

## Data retention

Locally stored data remains in the browser until the user changes the configuration, resets the extension, clears extension storage, or uninstalls the extension.

Synchronized data is managed according to the policies and controls of the user’s browser account provider.

## User choices

Users can:

- keep all configuration local;
- disable browser synchronization;
- avoid remote favicon URLs;
- use bundled, generated, or imported favicons;
- export or delete their configuration;
- uninstall the extension.

## Security

The extension does not include analytics, advertising, telemetry, or remotely hosted executable code.

Users should only import configuration files from trusted sources and should review remote favicon URLs before using them.

## Chrome Web Store Limited Use

The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Changes to this policy

Material changes to this policy will be documented in the project repository and reflected in the extension’s store disclosures where required.

## Contact

Questions and privacy requests can be submitted through the project’s GitHub issue tracker:

https://github.com/Arrows78/environment-favicon-switcher/issues
