# Security and privacy

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/eliottness/VacuumStream/security/advisories/new).
Do not disclose a vulnerability, working exploit, or account token in a public issue.
Include the affected version, reproduction steps, impact, and sanitized evidence.

This is an early-stage, volunteer-maintained project. Security fixes target `main` and the
latest release; older versions do not have a separate support branch. There is no guaranteed
response time. If private reporting is unavailable, ask @eliottness for a private contact route
without posting vulnerability details.

## Data handling

- Twitch OAuth requests `user:read:follows`. Tokens stay in Electron's main process.
- Tokens persist encrypted only when a secure Linux keyring is available; otherwise sign-in
  lasts until the application closes. Settings, including a custom public Client ID, are local.
- The official Twitch player and Twitch APIs contact Twitch and its infrastructure directly.
  Their privacy policies apply. VacuumStream has no application analytics backend.
- Device sign-in does not share browser cookies or authenticate the embedded player.
- Flatpak grants network, audio, GPU, input-device, and keyring access, but not home-directory access.
  Input-device permissions cover more than gamepads; see the [architecture](docs/contributing/architecture.md).

## Intentional public values

The embedded Twitch Client ID is not a secret. The certificate and matching key under
`resources/certs/` are a localhost-only TLS fixture, distributed with the application. They
must never identify a public service or be installed as a trusted system certificate authority.
Certificate pinning is not a defense against a malicious local process that already controls
the user's session. Do not send OAuth tokens or private data to the static localhost server.

Release SHA-256 checksums detect corruption. They are not publisher signatures.
