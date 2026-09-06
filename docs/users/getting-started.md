# Install and start watching

[Project overview](../../README.md) · [Troubleshooting](troubleshooting.md)

## Choose a download

Use the [Releases page](https://github.com/eliottness/VacuumStream/releases). The supported
build architecture is Linux **x86_64** (also called AMD64). Choose Flatpak for immutable
gaming systems, or AppImage for a standalone executable. VacuumStream is not on Flathub.
If no release exists, [build from source](../contributing/development.md).

Download both assets and `SHA256SUMS` from the same release to verify them:

```bash
sha256sum --check SHA256SUMS
```

If you downloaded only one asset, `sha256sum --check --ignore-missing SHA256SUMS` verifies
the downloaded file. A checksum failure means you should not run that download.
Checksums detect corruption, not impersonation; download only from the project's releases.

The examples below use `0.1.0`; substitute the version you downloaded.

### Flatpak

Requires Flatpak 1.16 or newer for gamepad device permissions. In Desktop Mode:

```bash
flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
flatpak install --user ./VacuumStream-0.1.0-x86_64.flatpak
flatpak run io.github.eliottness.VacuumStream
```

The bundle references Flathub for runtime dependencies; this does not make it a Flathub release.
Install a newer bundle the same way to update. There is no automatic GitHub-release updater.

Early local builds used a different application ID. They are separate installations and profiles;
the public build does not migrate their settings or tokens. Sign in again rather than copying tokens.

### AppImage

```bash
chmod +x VacuumStream-0.1.0-x86_64.AppImage
./VacuumStream-0.1.0-x86_64.AppImage
```

If FUSE is unavailable:

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./VacuumStream-0.1.0-x86_64.AppImage
```

Linux must permit Chromium's sandbox. Do not work around startup failures using `--no-sandbox`;
prefer Flatpak if your distribution blocks unprivileged user namespaces.

## First run

Start in guest mode: choose a Quick watch channel, or open Search and enter an exact Twitch
channel login, such as `twitch`. Guest mode does not provide general catalog search.

For personalized discovery:

1. Open **Connect Twitch** or **Settings**.
2. Leave the built-in Client ID unchanged. There is no developer registration step.
3. Choose **Sign in on another device**.
4. Open the Twitch activation address displayed by the app and enter its code.
5. Approve access on Twitch and return to VacuumStream.

Following shows followed channels that are live. If none are live, an empty list is normal.
Sign-in also enables live catalog, category, channel, and VOD discovery.

Device authorization authenticates discovery, **not the embedded player**. Twitch may show
advertisements and its own offline, regional, or error screens. Browser cookies are not imported.
Without an available secure keyring, sign-in is session-only and you must reconnect after closing.

## Controls

| Input | Action |
| --- | --- |
| Arrow keys | Move focus between controls and cards |
| Enter | Activate the focused action or submit Search |
| Escape | Return to Home from a secondary screen |
| ArrowDown in a text field | Leave text editing for navigation |

Left/Right edit text while a field is focused. Search text uses normal keyboard input.
On the player screen, focus the separate play/pause or mute button and press Enter.
Optional shortcuts: `/` opens Search, `F10` opens Settings.

Native gamepads map D-pad/left stick to arrows, A to Enter, and B to Escape. If the controller
is not detected, use the same mapping in Steam Input.

## Steam Deck and Bazzite Gaming Mode

Install in Desktop Mode. Add VacuumStream from the application list as a non-Steam game.
If adding it manually, use `/usr/bin/flatpak` as the executable and this launch argument:

```text
run io.github.eliottness.VacuumStream
```

Return to Gaming Mode. Use the Steam Input mapping above if needed. VacuumStream starts
fullscreen when both `SteamOS=1` and `SteamGamepadUI=1` are supplied by the session.
These are target environments; report hardware-specific results with your OS version and bindings.
