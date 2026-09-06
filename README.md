# VacuumStream

VacuumStream is a controller-first Twitch application for Linux TVs, handhelds,
Steam Deck, Bazzite, and similar HTPC deployments. It borrows VacuumTube's useful
shape, but not its YouTube-specific interception: a secure Electron shell owns the
TV interface while Twitch's official embedded player owns playback.

## Features

- Ten-foot interface with large targets and spatial D-pad navigation
- Native Gamepad API support plus Steam Input-compatible keyboard controls
- Guest quick-watch and exact-channel search without Twitch credentials
- Twitch Device Code sign-in for live, followed, category, channel, and VOD discovery
- Official Twitch live and VOD player, unobscured and isolated from privileged code
- Encrypted OAuth persistence when Linux Secret Service or KWallet is available
- Session-only OAuth fallback when Electron reports the insecure `basic_text` backend
- Automatic fullscreen startup in Steam Gaming Mode
- Wayland with X11 fallback, GPU access, AppImage, and Flatpak packaging

## Important Twitch constraints

VacuumStream deliberately does not use Twitch's private GraphQL, usher, or HLS token
interfaces. Playback stays in the approved Twitch iframe.

Unlike YouTube, Twitch does not publish a Leanback-style ten-foot web client that a
desktop shell can reuse. VacuumTube can wrap YouTube's first-party Leanback interface;
VacuumStream instead composes Twitch's documented TV building blocks: Helix discovery,
Device Code Flow designed for set-top boxes and game consoles, and the official player.

- Device sign-in authenticates Helix discovery. It does **not** sign the iframe into
  Twitch or share cookies with a browser.
- The embedded player can show ads and Twitch's own offline or error surfaces.
- Twitch's published terms do not require advance approval to distribute an ordinary
  registered standalone application. VacuumStream must continuously comply with the
  [Developer Services Agreement](https://legal.twitch.com/legal/developer-agreement),
  including the official-player, advertisement, branding, privacy, and rate-limit rules.
  Twitch Extensions are a separate product with a mandatory review lifecycle.

## Run from source

Requirements: Bun 1.3+, Node-compatible Linux, and a graphical session.

```bash
bun install --frozen-lockfile
bun run dev
```

Production checks:

```bash
bun run verify
```

The production renderer is served from a loopback-only, pinned HTTPS origin because
Twitch embeds require HTTPS and a `parent` hostname. Development uses electron-vite's
development server; use a packaged build when validating playback origin behavior.

## Connect Twitch

Guest playback works without setup. Personalized browsing uses VacuumStream's embedded public
Twitch Client ID. Twitch explicitly permits Client IDs in public source, and projects including
Twire, Chatty, and Streamlink Twitch GUI use the same distribution model.

Developers can replace the embedded ID from **Settings** when testing another Twitch application:

1. Open the [Twitch Developer Console](https://dev.twitch.tv/console/apps).
2. Register an application. Twitch requires a verified account and two-factor authentication.
3. Select **Public** as the client type. A harmless localhost redirect URL is sufficient
   for registration because VacuumStream uses Device Code Flow rather than redirects.
4. Copy the Client ID. Never copy or distribute a Client Secret.
5. In VacuumStream, open **Settings**, paste the Client ID, save, and choose
   **Sign in on another device**.
6. Open the displayed Twitch activation page and enter the device code.

VacuumStream requests only `user:read:follows`. Access tokens are validated at startup
and at least hourly; public-client refresh tokens are rotated atomically.

## Controller map

| Input | Action |
| --- | --- |
| Four Arrow keys | Move spatial focus; Left/Right edit text inside an input |
| Enter | Activate, submit Search, play/pause, mute/unmute, or open the selected item |
| Escape | Return to Home from any secondary screen |

Every non-text task is reachable with those six keys. Search text, and initial Client ID
setup, use normal text entry; ArrowDown exits an input into spatial navigation. Optional
`/` and `F10` shortcuts open Search and Settings. Directional holds repeat after 500 ms
and then every 100 ms. If a controller is not visible through the browser Gamepad API,
map D-pad/left stick to arrows, A to Enter, and B to Escape in Steam Input.

## AppImage

Build:

```bash
bun run package:appimage
```

Run:

```bash
./dist/VacuumStream-0.1.0.AppImage
```

If the distribution does not provide FUSE:

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./dist/VacuumStream-0.1.0.AppImage
```

AppImage is the fallback for conventional distributions. On immutable gaming systems,
prefer Flatpak so runtime, portals, codecs, and desktop integration remain managed.

## Flatpak for Bazzite and Steam Deck

Build with a local Flatpak toolchain:

```bash
./scripts/build-flatpak.sh
```

Install the generated bundle:

```bash
flatpak install --user ./dist/VacuumStream-0.1.0.flatpak
flatpak run io.github.vacuumstream.vacuumstream
```

The manifest grants only network, IPC, Wayland/X11 fallback, PulseAudio, DRI, raw input
devices for native gamepads, and Secret Service/KWallet access for encrypted tokens. It does
not grant home-directory access. Electron remains sandboxed
through Zypak; do not add `--no-sandbox`.

### Add to Steam Gaming Mode

1. Install VacuumStream in Desktop Mode.
2. Add a non-Steam game with this launch target:

   ```text
   flatpak run io.github.vacuumstream.vacuumstream
   ```

3. Return to Gaming Mode and launch it from the library.
4. If native gamepad events are unavailable, select a Steam Input template where
   D-pad/left stick emit arrow keys, A emits Enter, B emits Escape, X emits `/`, and
   Menu emits F10.

VacuumStream detects `SteamOS=1` and `SteamGamepadUI=1` and opens fullscreen. Current
Electron chooses Wayland or fallback X11; `--ozone-platform=x11` remains a support-time
escape hatch for compositor-specific issues.

## Architecture and security

See [ARCHITECTURE.md](ARCHITECTURE.md) for process boundaries, HTTPS certificate pinning,
token rotation, and Flatpak packaging rationale. See [DESIGN.md](DESIGN.md) for the
controller, responsive, visual, and accessibility contract.

## Development status

The implementation and local Linux artifacts are functional. Before a public Flathub
submission, replace the manifest's local `dist/linux-unpacked` source with a versioned,
checksummed source build. Flathub's Node source generator does not support Bun locks, so
that submission must add a synchronized pnpm/npm lock for `flatpak-node-generator` or a
fully checksummed generated-sources manifest. Also add project screenshots and a real homepage.
Publish signed checksums or signed repository metadata for every public artifact.

Comparable distributed open-source clients include
[Twire](https://github.com/twireapp/Twire),
[S0undTV](https://github.com/S0und/S0undTV),
[SmartTwitchTV](https://github.com/fgl27/SmartTwitchTV), and
[Streamlink Twitch GUI](https://github.com/streamlink/streamlink-twitch-gui). None documents a
general Twitch pre-distribution approval step; many use unofficial GraphQL/Usher playback,
whereas VacuumStream deliberately stays on Helix, Device Code Flow, and Twitch's official player.

## License

MIT. Twitch is a trademark of Twitch Interactive, Inc. VacuumStream is not affiliated
with or endorsed by Twitch.
