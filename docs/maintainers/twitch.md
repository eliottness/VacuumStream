# Twitch integration policy

Maintainer notes, reviewed 2026-09-06. This is an implementation policy, not legal advice or
a statement of Twitch approval. Recheck the current official terms before distribution.

VacuumStream uses documented Helix APIs, public-client Device Code Flow, and Twitch's official
embedded player. It does not extract HLS URLs or use private GraphQL/Usher playback endpoints.
Keep the player unobscured, preserve advertising and branding, observe rate limits, and validate
OAuth tokens as required by Twitch.

- [Developer Services Agreement](https://legal.twitch.com/legal/developer-agreement/)
- [Embedding Twitch](https://dev.twitch.tv/docs/embed/)
- [Register an application](https://dev.twitch.tv/docs/authentication/register-app/)
- [OAuth flows](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/)
- [Token validation](https://dev.twitch.tv/docs/authentication/validate-tokens/)

Twitch's documented registration process does not describe a general advance distribution
approval gate for standalone desktop applications. Twitch Extensions have a separate review
lifecycle. Registration does not waive compliance, and open-source client precedents do not
establish permission. The six-key HTPC interface provides functionality beyond replicating a website.

The project-owned Client ID is public and may be distributed. Client Secrets and user tokens
must never ship. Forks intended for independent distribution should register their own public
application and update their ownership metadata instead of presenting themselves as this project.

Device authorization and player login are distinct: discovery access does not authenticate the
iframe or import browser cookies. Do not promise subscriber benefits or ad-free playback.
