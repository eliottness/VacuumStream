# VacuumStream Architecture

For contributors working on process boundaries, authentication, and packaging.
See [development setup](development.md) and [release operations](../maintainers/releases.md).

## Decision

VacuumStream is a custom React TV shell around supported Twitch services. It is not a
wrapped `twitch.tv` page and does not extract media URLs.

```text
Electron main process
├── loopback-only static HTTPS server
├── pinned localhost certificate decision
├── public OAuth Device Code Flow and rotating token vault
├── Helix catalog adapter with Zod response parsing
├── narrow, sender-validated IPC handlers
└── BrowserWindow
    ├── sandbox: true
    ├── contextIsolation: true
    ├── nodeIntegration: false
    └── preload contextBridge
        └── React controller-first renderer
            └── cross-origin official Twitch player iframe
```

## Process boundaries

### Main

`src/main` owns all ambient authority:

- filesystem access for settings and encrypted tokens;
- Twitch OAuth and Helix network calls;
- opening only the active Twitch verification URL;
- fullscreen window control;
- production HTTPS serving and certificate pinning.

One application process owns each Electron `userData` directory (profile). Main acquires
Electron's single-instance lock synchronously before scheduling readiness or constructing a
window, HTTPS server, persistence owners, or IPC handlers. A losing process quits without
bootstrapping; Electron owns the lock lifetime. Store queues and token-refresh serialization
protect only their owning instances, so this process-level ownership prevents competing writers
and refreshes against the same profile.

A second launch only restores the existing window if minimized, then shows and focuses it.
Requests received before the window exists are remembered for the single startup window.
Reactivation neither reloads or navigates the renderer nor changes fullscreen mode or rebuilds
resources. Second-instance command-line arguments are untrusted and ignored.

Packaged builds ignore `ELECTRON_RENDERER_URL`. Electron fuses disable Run-as-Node,
`NODE_OPTIONS`, CLI inspection, and extra file-protocol privileges while requiring the
embedded ASAR and its integrity metadata.

Every IPC handler verifies the expected `BrowserWindow`, its main frame, and the exact
renderer origin. Inputs are parsed with bounded Zod schemas. Tokens, authorization headers,
generic URLs, generic filesystem methods, and raw `ipcRenderer` never cross the bridge.

Explicit chat interaction uses a sender-authorized begin/end capability scoped to a UUID session,
plus a removable escape notification (also sent on BrowserWindow blur). Main intercepts Escape
with `webContents.before-input-event` and calls `preventDefault()` before notifying the shell,
because a focused cross-origin Twitch frame cannot bubble that key to React. The mode listener
is removed immediately; a release-only guard consumes repeats and the matching keyUp so the
same held press cannot also navigate Home. Blur and window teardown remove all input listeners.
The renderer restores shell focus and rejects stale notifications and pending completions.

Native gamepad chat interaction adds exactly `chatInput.press(session, action)`, with actions
`next | previous | activate`. Preload and main validate the UUID, enum and exact argument count;
main also authorizes the sender window, main frame and renderer origin. A cancelable chat action
event runs after physical press/repeat detection and before shell click/shortcut dispatch, preserving
Search's face-button latches. Chat consumes unrelated shortcuts; B exits locally. Entry is never
forwarded. Physical keyboard and Steam Input keyboard events continue through Chromium normally.

This feature deliberately uses a **limited privileged CDP transport**, not DOM clicks or
`sendInputEvent`. On the first native action only, main acquires an app-owned
`webContents.debugger` attachment, refusing an already attached debugger. Main captures the current
official direct chat child at entry and rechecks window focus, focused-frame identity, membership
in this window's current frame tree, frame lifetime and unchanged official
`https://www.twitch.tv/embed/<channel>/chat?parent=localhost` URL before dispatch. The only commands
are fixed `Input.dispatchKeyEvent` down/up pairs: Tab, Shift+Tab (`modifiers: 8`), and Enter.
Pairs are submitted together in protocol order and serialized; obsolete queued actions are discarded.
No renderer-supplied key, selector, URL, JavaScript, target id or debugger command is accepted.

Exit, reload, source replacement, blur, navigation, crash and debugger loss invalidate the session
and remove its listeners. Only a feature-owned attachment is detached. A busy debugger or rejected
command ends native forwarding, reports an escapable error and restores shell focus; keyboard-only
re-entry never needs a debugger. A pair already submitted cannot be recalled, but no later queued
pair is sent after invalidation. Twitch owns its UI, focus order and consent decisions. This does
not add cookie pre-seeding, consent persistence, automatic acceptance or a separate partition.

### Preload

`src/preload/index.ts` exposes the `VacuumStreamApi` capability object. Each result is
parsed again before reaching the renderer. The generated preload is CommonJS because
Electron's sandboxed preload runtime cannot execute an ESM preload directly.

### Renderer

`src/renderer` has no Node.js access. It owns visual state, semantic actions, focus geometry,
and gamepad-to-keyboard normalization. Twitch media is a cross-origin iframe using
`parent=localhost`; the renderer never proxies, intercepts, or overlays player traffic.

## HTTPS origin

Production assets are served only from `https://localhost:<ephemeral-port>`:

- listener binds to `127.0.0.1`;
- only `GET` and `HEAD` are accepted;
- the `Host` header must match the bound authority;
- resolved paths must stay beneath the renderer root;
- no privileged HTTP API exists;
- Electron accepts only the bundled certificate, for the expected window and origin,
  when Chromium reports `ERR_CERT_AUTHORITY_INVALID`;
- navigation and new-window creation are denied outside the renderer origin.

The bundled private key is not an identity secret. The security properties come from the
ephemeral port, loopback bind, exact Host/origin checks, certificate fingerprint, static-only
server, and absence of privileged HTTP endpoints.

## OAuth and storage

VacuumStream embeds its registered public Client ID. Settings allows an optional override;
an existing saved ID takes precedence. Device Code Flow requests only `user:read:follows`.
The main process polls at Twitch's interval, validates sessions on startup and hourly, and
serializes refresh through one in-flight promise so concurrent failures cannot reuse a
one-time refresh token.

`TokenVault` prefers Electron `safeStorage` when encryption is available and the Linux backend is
not `basic_text`. Without a secure backend, it falls back to unencrypted JSON under Electron's
per-user application-data directory and emits a main-process warning. Both paths use an owner-only
temporary file, atomic rename, and an explicit `0600` final mode. A later secure session migrates
the fallback into encrypted storage.

## Packaging

Flatpak is primary for Bazzite, Steam Deck, ChimeraOS, and other immutable deployments.
The manifest uses Freedesktop 25.08, Electron2 BaseApp, and Zypak with minimal permissions.
Raw input access enables native gamepads; no home-directory access is granted.
AppImage is a fallback where Chromium user namespaces are available; sandbox failures are
never worked around with `--no-sandbox`.

Flatpak's `--device=input` exposes the sandbox to all host input devices, not only gamepads,
and fallback X11 has weaker isolation than Wayland. These are accepted HTPC compatibility
tradeoffs: Wayland remains preferred, no filesystem access is granted, and packages must be
built from reviewed source. Release assets include SHA-256 checksums, not cryptographic signatures.
The application ID is `io.github.eliottness.VacuumStream` across Electron and Flatpak metadata.

## External constraints

- Helix requires a user token in a fully local public client because no client secret can
  be bundled for anonymous app-token creation.
- Helix Device Flow authentication does not authenticate the iframe.
- Twitch controls player availability, advertising, region policy, and embed behavior.
- Maintainers must recheck Twitch's current terms before releases; see
  [Twitch integration policy](../maintainers/twitch.md). Open-source precedents are not approval.
