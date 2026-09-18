# Troubleshooting

[Installation and controls](getting-started.md) · [Report a bug](https://github.com/eliottness/VacuumStream/issues/new/choose)

## Device sign-in fails

Check your connection and system clock. Keep the built-in public Client ID unless testing a
different registered application. If a device code expires, start sign-in again; do not reuse
an expired code. Never share device codes, access tokens, or Client Secrets in an issue.

## Logs mention an OAuth token file fallback

Unlock or configure your desktop's Secret Service/KWallet keyring to use encrypted storage.
Without one, VacuumStream keeps sign-in across restarts in an unencrypted `oauth-token.json` file
inside its per-user application-data directory. The file is restricted with mode `0600`, while
Flatpak installations add sandbox isolation around that directory. Other processes running as the
same user may still read it. Never copy or share it.

## Player is offline, shows ads, or reports an error

Try the channel on Twitch in a browser to distinguish channel availability from application
problems. Sign-in in VacuumStream does not authenticate the embedded player. Subscription
status or browser login does not guarantee an ad-free embedded-player session.
Include the visible player error and a public channel URL when reporting a bug, not account data.

## Search or Following looks empty

Guests must search an exact channel login, not a display name or game. Sign in for catalog
discovery. Following lists only followed channels that are currently live.

## AppImage does not launch

Check the executable bit and FUSE instructions in the [user guide](getting-started.md).
If Chromium's sandbox is blocked, use Flatpak rather than disabling the sandbox. For compositor
problems, try `--ozone-platform=x11` and report whether it changes the result.

## Flatpak or controller problems

Check `flatpak --version` (1.16+ required), update the runtime with `flatpak update --user`,
and verify the controller is recognized by the operating system. Steam Input's keyboard mapping
can avoid differences in native gamepad visibility. Do not grant broad filesystem permissions
or disable sandboxing to fix input problems.

When reporting a bug, include the release/commit, install method, distribution, display server,
hardware, input method, and exact steps. Sanitize any logs first.
