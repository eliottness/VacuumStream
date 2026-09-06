# Development

[Contribution guidelines](../../CONTRIBUTING.md) · [Architecture](architecture.md) · [Design](design.md)

## Requirements and setup

- Linux x86_64 and a graphical session for Electron.
- Node.js 24 LTS (at least 24.20.0) and Bun **1.4.2**, matching `engines` and
  `packageManager`. CI also tests Node.js 26 Current.
- Git and the desktop libraries required by Electron on your distribution.

```bash
git clone https://github.com/eliottness/VacuumStream.git
cd VacuumStream
bun install --frozen-lockfile
bun run dev
```

Fork the repository first if you plan to submit a pull request. Do not disable Electron's sandbox.
The built-in public Client ID is enough for normal sign-in; never put a Client Secret into this app.

## Checks

```bash
bun run verify
```

This runs Biome, strict TypeScript checking, Vitest, and the production build. Tests are colocated
with source files. Use `bun run test -- src/main/settings-store.test.ts` for a targeted test.
Run `bun run lint:fix` only on changes you intend to format.

CI also uses ShellCheck, actionlint, AppStream validation, desktop-file validation, and `bun run pack`.
Keep scripts and release metadata in sync when changing packaging. GitHub Actions dependencies
are SHA-pinned; Dependabot proposes action updates.

The current build pairs electron-vite 5 with Vite 8. Both are the latest stable releases,
but electron-vite's declared peer range still lists only Vite 5–7. Verification and AppImage
packaging pass with this pairing on Node 24 and 26; no peer-dependency override is applied.
Recheck upstream compatibility when upgrading either build tool.

## Manual checks

Drive the affected flow with arrows, Enter, and Escape, including empty/error states. Test pointer
input too. For UI changes, inspect 375, 768, 1280, 1920, and 3840-pixel widths and reduced motion.
The development-only `?showcase=1` route provides component states without a live Twitch account.

`bun run dev` uses electron-vite's development server. To test production HTTPS origin and
certificate behavior, use a packaged build:

```bash
bun run pack
./dist/linux-unpacked/vacuumstream
```

OAuth tests do not prove real Twitch authorization or physical controller compatibility. Record
what you actually exercised and what requires an account, network, or target hardware.

## Build artifacts

```bash
bun run package:appimage
bun run package:flatpak
```

Flatpak builds require `flatpak`, `flatpak-builder`, the Flathub remote, Freedesktop Platform/SDK
25.08, and Electron2 BaseApp 25.08. Configure the user remote before building:

```bash
flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
```

The build script installs missing dependencies from this remote. Generated files live in `dist/`
and ignored `.flatpak-*` directories. For combined assets and checksums, see the
[release guide](../maintainers/releases.md). Build scripts never publish by themselves.

## Optional: use your own Twitch application

This is for forks or integration testing, not end-user setup.

1. Register an app in the [Twitch Developer Console](https://dev.twitch.tv/console/apps).
2. Choose **Public** as the client type and supply `https://localhost/` as the required redirect URL.
   Device Code Flow does not use that redirect or require a callback server.
3. Copy the public Client ID into Settings and save. Never generate or ship a Client Secret.
4. Start **Sign in on another device** and complete the displayed Twitch activation flow.

Changing Client IDs changes the application identity used for authorization. Existing saved IDs
override the compiled default; to return to the project ID, copy it from
[`settings-store.ts`](../../src/main/settings-store.ts) and save it in Settings.
