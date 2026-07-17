# Security Policy

## Supported versions

Security fixes are developed against the latest maintained version of the extension. Older unpacked snapshots may not receive backports.

| Version | Supported |
| --- | --- |
| 2.2.x | Yes |
| 2.1.x and earlier | No |

## Reporting a vulnerability

Do not include exploit details, private URLs or user data in a public issue. Use the repository's private **Report a vulnerability** workflow when it is available. Otherwise, contact the maintainer privately through the GitHub profile associated with the repository and provide a minimal description first.

A useful report contains:

- the affected extension version and browser;
- the vulnerable extension context: page/content script, popup, options or background;
- clear reproduction steps using a non-sensitive test page;
- the expected and observed result;
- the impact and whether user interaction is required;
- a suggested mitigation, when known.

Please allow reasonable time for triage and a coordinated release before public disclosure.

## Security boundaries

The extension evaluates every page URL locally because rules may target arbitrary hosts. It does not intentionally transmit browsing history to a project-controlled service.

Two opt-in settings can involve external services:

- a remote favicon URL causes the browser to request that resource;
- browser synchronization copies configuration through the signed-in browser account and vendor infrastructure.

Configuration exports can contain internal hostnames and embedded images. Treat exported JSON as potentially sensitive and review it before sharing.

## Safe configuration guidance

- Prefer bundled or generated favicons over remote resources.
- Import configuration only from trusted sources.
- Use hostname or glob matching when a regular expression is unnecessary.
- Keep patterns as narrow as practical.
- Review every permission change in `manifest.json`.
- Do not place credentials, session tokens or secrets in URL patterns, rule names or favicon URLs.
- Disable browser synchronization for configurations that must remain local.

## Implementation safeguards

The repository enforces several security invariants:

- user-controlled strings are inserted with DOM text APIs rather than HTML parsing;
- runtime source is checked for unsafe HTML injection and dynamic code execution;
- generated SVG labels are normalized and XML-escaped;
- regular expressions have a length limit and invalid patterns fail closed;
- synchronized data is length-limited and checksum-verified;
- malformed imports and unknown format versions are rejected;
- page-owned favicon nodes are not removed or rewritten;
- extension packages contain only audited runtime files.
