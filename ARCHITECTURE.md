# VacuumStream Architecture

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

Packaged builds ignore `ELECTRON_RENDERER_URL`. Electron fuses disable Run-as-Node,
`NODE_OPTIONS`, CLI inspection, and extra file-protocol privileges while requiring the
embedded ASAR and its integrity metadata.

Every IPC handler verifies the expected `BrowserWindow`, its main frame, and the exact
renderer origin. Inputs are parsed with bounded Zod schemas. Tokens, authorization headers,
generic URLs, generic filesystem methods, and raw `ipcRenderer` never cross the bridge.

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

The user provides a public Client ID. Device Code Flow requests only `user:read:follows`.
The main process polls at Twitch's interval, validates sessions on startup and hourly, and
serializes refresh through one in-flight promise so concurrent failures cannot reuse a
one-time refresh token.

`TokenVault` persists only when `safeStorage.isEncryptionAvailable()` is true and the Linux
backend is not `basic_text`. Encrypted writes use a temporary file and atomic rename. Without
a secure backend, the token remains in process memory and disappears on exit.

## Packaging

Flatpak is primary for Bazzite, Steam Deck, ChimeraOS, and other immutable deployments.
The manifest uses Freedesktop 24.08, Electron2 BaseApp, and Zypak with minimal permissions.
Raw input access enables native gamepads; no home-directory access is granted.
AppImage is a fallback where Chromium user namespaces are available; sandbox failures are
never worked around with `--no-sandbox`.

Flatpak's `--device=input` exposes the sandbox to all host input devices, not only gamepads,
and fallback X11 has weaker isolation than Wayland. These are accepted HTPC compatibility
tradeoffs: Wayland remains preferred, no filesystem access is granted, and packages must be
built from reviewed source. Public artifacts require signed checksums or repository signing.

## External constraints

- Helix requires a user token in a fully local public client because no client secret can
  be bundled for anonymous app-token creation.
- Helix Device Flow authentication does not authenticate the iframe.
- Twitch controls player availability, advertising, region policy, and embed behavior.
- Twitch does not document an advance approval process for ordinary standalone applications.
  Distribution requires a uniquely registered app and continuing compliance. The embed terms
  prohibit website experiences that merely replicate Twitch without substantial additional value;
  the six-key HTPC interface is VacuumStream's differentiating functionality. Mandatory Twitch
  review applies to Twitch Extensions, not this externally distributed desktop application.
