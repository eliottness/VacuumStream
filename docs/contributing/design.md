# VacuumStream Design System

This is the interaction and visual contract for contributors, not a claim of complete
accessibility certification. See [development and manual checks](development.md).

## 1. Atmosphere & Identity

VacuumStream is a calm, dark broadcast wall designed to be read from a sofa. Live imagery carries the energy while the chrome stays quiet. Its signature is **signal focus**: the selected item lifts, gains a bright double focus frame, and reveals useful metadata without causing surrounding shelves to jump. The interface serves two primary personas: a Steam Deck user navigating with built-in controls and an HTPC viewer using a gamepad from three metres away. Mouse, keyboard, touch, reduced-motion, low-vision, and color-vision needs remain first-class constraints.

## 2. Color

The app is dark-only because playback is the dominant task and abrupt theme changes are distracting in a dim room.

Every value lives in `src/renderer/src/tokens.css`. Nothing in the app declares a raw colour.

| Role | Token | Value | Usage |
| --- | --- | --- | --- |
| Surface / canvas | `--color-canvas` | `#0e0e10` | App background |
| Surface / rail | `--color-rail` | `#18181b` | Navigation and fixed chrome |
| Surface / surface | `--color-surface` | `#1f1f23` | Resting controls and local cards |
| Surface / raised | `--color-raised` | `#26262c` | Dialogs, selected metadata |
| Surface / hover | `--color-hover` | `#2f2f35` | Hovered controls |
| Surface / rule | `--color-rule` | `#3a3a3d` | Hairline borders and section rules |
| Surface / edge light | `--color-edge-light` | `rgba(255, 255, 255, 0.07)` | Inset top highlight on large panels |
| Text / primary | `--color-text` | `#efeff1` | Headings and key labels |
| Text / secondary | `--color-text-muted` | `#adadb8` | Metadata and hints |
| Text / tertiary | `--color-text-dim` | `#848494` | Canvas and rail only; fails AA on raised |
| Text / disabled | `--color-text-disabled` | `#adadb8` | Disabled states; shape and surface also indicate disabled status |
| Text / on accent | `--color-on-accent` | `#ffffff` | Small text on purple and live-red fills |
| Accent / primary | `--color-accent` | `#9147ff` | Primary action fills and the active-route marker |
| Accent / hover | `--color-accent-hover` | `#a970ff` | Primary hover fill, paired with canvas ink |
| Accent / strong | `--color-accent-strong` | `#bf94ff` | Focus frame, purple text, active icons |
| Accent / pressed | `--color-accent-pressed` | `#772ce8` | Active state |
| Live | `--color-live` | `#eb0400` | Live status only |
| Success | `--color-success` | `#00db7f` | Completed device authorization |
| Warning | `--color-warning` | `#ffb31a` | Recoverable service warnings |
| Error | `--color-error` | `#ff6b6b` | Errors and destructive action |
| Scrim | `--color-scrim` | `rgba(0, 0, 0, 0.72)` | Player and dialog overlays |

Rules:

- Purple is the only interaction accent; red is reserved for live state.
- `--color-accent` is a fill, never small text: it reaches only 4.18:1 on canvas. Purple text uses
  `--color-accent-strong` at 8.17:1. Purple fills carry white ink at 4.62:1, and the lighter hover
  fill flips to canvas ink at 5.92:1.
- Focus never relies on color alone: it combines a two-layer frame, lift, and metadata change.
  The frame is `--focus-frame` and appears instantly; only the lift is animated.
- All body text targets WCAG 2.2 AAA where practical and never falls below AA.

## 3. Typography

Body: **Atkinson Hyperlegible Next** (`--font-body`), self-hosted, with `system-ui` fallback. Its differentiated letterforms support distance reading and low vision, so it carries every label, control, and paragraph.

Display: **Archivo Variable** (`--font-display`), self-hosted, set at `font-stretch: 110%` with `-0.005em` tracking. Wide grotesk signage holds its shape at three metres better than a condensed face. It is scoped to headings, the rail wordmark, the device code, and the transport clock — never to body copy. All display type is roman; italic headings are not used.

| Level | Size | Weight | Line height | Usage |
| --- | --- | --- | --- | --- |
| Display | `clamp(2.25rem, 3vw, 4rem)` | 500 | 1.05 | Sign-in and empty-state headline |
| H1 | `clamp(1.75rem, 2.2vw, 3rem)` | 500 | 1.12 | Screen title |
| H2 | `clamp(1.375rem, 1.6vw, 2rem)` | 600 | 1.2 | Shelf title |
| H3 | `clamp(1.125rem, 1.2vw, 1.5rem)` | 600 | 1.25 | Selected card and dialog title |
| Body / large | `1.25rem` | 400 | 1.5 | Dialog copy and TV guidance |
| Body | `1rem` | 400 | 1.45 | Stream metadata |
| Label | `0.875rem` | 600 | 1.3 | Tags and compact controls |

At 1920 px and above, UI labels must remain at least 18 physical pixels. The root scale increases at 2560, 3456, and 3840 px, reaching 200% at 4K so controls and metadata remain readable at TV distance. Important labels are never uppercase and stream titles truncate to two lines.

## 4. Spacing & Layout

All intent spacing uses a 4 px base.

| Token | Value | Usage |
| --- | --- | --- |
| `--space-1` | `0.25rem` | Tight inline separation |
| `--space-2` | `0.5rem` | Badge and icon spacing |
| `--space-3` | `0.75rem` | Compact control padding |
| `--space-4` | `1rem` | Card metadata gap |
| `--space-5` | `1.25rem` | Keyboard and control-cluster offset |
| `--space-6` | `1.5rem` | Shelf gap |
| `--space-8` | `2rem` | Main gutter |
| `--space-12` | `3rem` | Shelf separation |
| `--space-16` | `4rem` | Large-screen outer gutter |

The `AppShell` is a fixed-sidenav shell bounded to `100dvb`; the main content pane is the sole vertical scroll owner. Each `StreamShelf` is a keyboard-accessible horizontal reel with snap points. The next card remains partially visible as a directional cue. Main content uses 24 px gutters on handhelds, 40 px at 1280 px, 64 px at 1920 px, and a 2160 px maximum canvas. At less than 720 px, the rail becomes a compact top bar and shelves show 1.4 cards. At 4K, a shelf shows no more than six cards so targets remain readable.

## 5. Components

### AppShell

- **Structure**: skip link, fixed navigation rail, scrollable main region, status layer.
- **States**: guest, authenticating, signed-in, and contextual service-error notice.
- **Accessibility**: landmarks, stable focus order, route title announcement.
- **Layout**: fixed-sidenav shell; only `main` owns vertical scroll.

### NavigationRail

- **Structure**: brand, primary routes, flexible spacer, settings/account. A hairline separates the
  rail from the content pane.
- **States**: default, hover, active, focus, disabled. The active route is marked by an accent bar on
  the leading edge plus a lit icon, not a filled block; on the compact top bar the bar moves to the
  bottom edge.
- **Accessibility**: real links/buttons, visible label and icon, `aria-current`.
- **Motion**: focus lift only; labels never slide or collapse while focused.

### Home shelf focus composition

`home-focus.ts` is the pure Home-specific boundary model, evaluated only on App's Home route.
It takes guest/authenticated mode and the items/status of Continue Watching and favourites.
App renders its navigation entry, sign-in Down link, each local shelf's upper/lower and removal
fallback links, and the live entry's Up link from that one snapshot. No shelf edits a sibling's
DOM attributes. Standalone fixtures, including Showcase, declare their own boundary links.

- Entry precedence is Continue Watching, favourites, then Refresh (authenticated) or Connect
  Twitch (guest). A populated shelf enters at its first item even during loading or error; an
  empty error enters at Retry, while empty ready/loading shelves are skipped.
- Down leaves Continue Watching for the first favourite (or its empty-error Retry), then the
  live entry: Refresh for authenticated viewers, the first preview stream for guests.
- Up from the live entry returns to favourites, then Continue Watching, preferring an error's
  Retry over the last Remove/Forget action. With neither local shelf available, it returns to
  the Home rail when authenticated or Connect Twitch when guest. Up from favourites returns
  to Continue Watching's Retry/last Forget action, otherwise the Home rail.
- These edges are intentionally asymmetric: entering the first item does not imply returning
  to that same item. Retained items stay in the graph during refresh, and independently
  completed requests recompute the entire boundary snapshot without effect ordering.
- Removal fallback prefers the other local shelf's entry, then Refresh/Connect Twitch. The
  model only computes destinations: focused-card tracking, next/previous survivor rescue,
  Retry disappearance recovery, controller-focus marking, and scroll feedback remain owned
  by the shelves. A completion must not steal focus the viewer has already moved elsewhere.
- `StreamShelf.entryUpperFocusId` overrides only Refresh's Up link, or the first card's Up
  link when there is no Refresh. Omitting it preserves other callers' existing defaults and
  all internal live-shelf links.

### ActionButton

- **Shape**: `--radius-control` on every control. Cards use `--radius-card`, panels `--radius-panel`,
  badges `--radius-badge`. Secondary controls rest on `--color-surface` behind a `--color-rule`
  hairline; hover raises the surface and lights the border with `--color-accent-strong`.
- **Variants**: primary, secondary, quiet, danger, icon.
- **States**: default, hover, active, focus, and disabled.
- **Accessibility**: minimum 48 px target on handheld and 56 px on TV; loading name remains stable.
- **Motion**: 120 ms press scale and 180 ms focus lift.

### StreamShelf

- **Structure**: heading/action cluster plus horizontal `StreamCard` reel.
- **States**: loading skeletons, populated, empty, error with retry.
- **Accessibility**: arrow keys move within and between shelves; no additional navigation key is required.
- **Layout**: reel owns horizontal overflow; no nested vertical scroll.

### ContinueWatchingShelf

- **Structure**: Home-only text-first horizontal row above the live shelf, showing at most the ten newest local bookmarks. Cards show the saved title and elapsed/total time, with a separate Forget progress action. No thumbnails, Helix requests, or availability lookups are involved; legacy entries use `Recording <videoId>`.
- **States**: populated, legacy entry, loading, read error with retry, and removal error with retry. An empty successful list renders no shelf; loading/read-error feedback remains outside the absent row, and existing Home controls stay reachable. Live discovery and authentication do not gate loading.
- **Playback**: selection uses the existing video source and Resume / Start over / Back prompt before player construction. Legacy bookmarks use broadcaster sentinel `"0"`; their Past broadcasts shortcut is disabled and bypassed by the toolbar focus graph, never resolved through a fabricated lookup. Completion is only the player's ENDED event, not a percentage watched.
- **Persistence**: positions are local to this installation and shared across Twitch accounts, including signed-out viewing. Forget progress deletes the saved position. The renderer's shared per-video queue orders writes, removals and resume lookups; listing waits for already-queued renderer work before invoking IPC, separately from main-store serialization. Home-entry and removal generations reject obsolete list results so they cannot resurrect deleted entries.
- **Accessibility**: explicit directional links connect navigation, entry buttons, Forget actions, and live controls in both directions. A successful removal rescues focus to the next surviving entry (or the previous one at the end), then an existing Home control if the row disappears. A failed removal retains the card and its focusable retry action. Loading does not trap focus or trigger authorization.
- **Layout**: the existing horizontal reel owns overflow, with padded focus frames, two-line titles and tabular elapsed/total times. Text and actions remain readable at 1280x720 and 1920x1080; no nested vertical scrolling or playback overlays.

### StreamCard

- **Structure**: 16:9 thumbnail frame, live/viewer overlays, avatar, two-line title, channel/category metadata.
- **States**: default, hover, selected/focus, and image error.
- **Accessibility**: one descriptive accessible name; status is text, not color-only.
- **Motion**: selected card lifts 0.25rem without resizing the layout; reduced motion uses the frame only.

### CategoryCard

- **Structure**: 3:4 artwork and category title. Helix top-games data does not expose a live channel count.
- **States**: default, hover, selected/focus, image error.
- **Accessibility**: identical directional behavior to stream cards.

### Dialog

- **Variants**: device sign-in, settings, confirmation, error.
- **States**: opening, active, submitting, success, error.
- **Accessibility**: focus trap, labelled title/description, Escape or controller B closes when safe.
- **Motion**: scrim fade and 0.98-to-1 transform; instant under reduced motion.

### PlayerStage

- **Structure**: official interactive Twitch player, local Back, play/pause, mute, Quality, Captions, VOD, live-only Show/Hide chat, Enter chat and Reload chat, and fullscreen controls, loading/error surface; VOD-only transport row with elapsed/total time and ±30-second/±5-minute jumps.
- **States**: local loading, ready, paused, muted, offline, and a distinct SDK/player initialization error; jumps disabled until ready with a finite positive duration. OFFLINE never offers an SDK retry or automatically reconstructs the player.
- **Live availability**: initialization and channel availability are separate facts. OFFLINE disables playback, mute and caption commands and clears quality options, but retains initialization knowledge. READY alone cannot clear an observed live outage. The documented `Twitch.Player.ONLINE` event clears offline guidance; before READY it leaves commands disabled and reads no player state. After initialization it restores the shell by reading `getMuted()`, `isPaused()`, `getQualities()` and `getQuality()`, without replaying READY, restarting activation or issuing playback, mute, quality or caption requests. ONLINE means the channel is available, not that video is moving; the viewer may wait or go Back, with no promise of automatic media recovery. Repeated outages and duplicate ONLINE events retain the player, player-root node and visible chat iframe, never focusing either frame. Obsolete callbacks after replacement or unmount cannot restore state or move focus. VOD sampling and resume remain unchanged.
- **Startup recovery**: initialization failure exposes Retry loading player beside Back in the shell toolbar, with a stable `player-retry` focus ID. Right from Back reaches Retry, Left returns, Right continues to Quality (whose Left returns to Retry), and Up/Down return to Back. Activation moves visible focus to Back before removing Retry and restarts only the current source's initialization effect; pending activations cannot overlap. The resolved VOD resume/start-over decision and selected `time` survive retry without another lookup or prompt. Startup/offline messages occupy a content-sized shell row outside the player stage, never covering Twitch. SDK loading is single-flight: rejection removes the failed script and listeners and releases only that attempt's cache slot; success remains reusable. No automatic reload loop is added. Late resolutions/rejections after leaving or source replacement cannot construct a stale player, restore an error, or steal focus; pre-READY failures save no progress.
- **Accessibility**: all playback actions use Arrow keys and Enter; Down from Back enters the jumps, Left/Right chooses, and Up or Down returns to Back. Each row loops: Right from the last toolbar control reaches Back and Left from Back reaches Fullscreen, and the jump row wraps between its first and last jump. Seeking retains focus and cancels autoplay retries without changing play/pause or mute.
- **Playback**: VOD jumps use the official Player API and clamp to recording bounds; live controls remain unchanged. Time refreshes on READY, PLAYING, SEEK, and once per second while a ready VOD is mounted.
- **Resume**: a feature-local hook looks up a VOD bookmark before constructing any player. The real `VideoResumePrompt` presents Resume from H:MM:SS, Start over, and Back, with initial visible focus, stable focus IDs and explicit links in all four directions. Pending lookup retains Back; a rejected lookup exposes Play without resume and Back. Resume supplies only Twitch's documented `time` option (3900 seconds becomes `1h5m0s`), never a corrective seek or second player. Start over removes the bookmark and omits `time`; live sources perform no progress operations and never receive `time`.
- **Progress**: the existing one-second sampler checkpoints changed, observed positions at most every 15 seconds, plus pause, confirmed seek and normal departure. READY/loading zero and unconfirmed resume-startup samples cannot replace a bookmark. A viewer-requested seek is saved only after the official SEEK event reports its destination. ENDED removes the bookmark, cancels queued samples and orders removal after any in-flight write; a near-end position alone never clears a growing archive. Every callback remains bound to its source and active player generation, and a returning lookup waits for earlier writes/removal. Failed writes/removals remain visible in the transport row outside the embed without blocking playback or claiming success. Positions are local to this installation and shared across Twitch account changes, not Twitch-synced or account-scoped.
- **Quality**: live and VOD Quality opens an inline chooser of official API options, refreshed on READY, live ONLINE after initialization, PLAYING, and opening. PLAYING still refreshes qualities that were empty at ONLINE. Arrows and Enter request an exact quality ID; Left/Right cycles the options and Close, wrapping at both ends, Down from Close returns to Quality, and Close returns focus to Quality, while Escape still returns Home. Empty/offline states retain Back and Close. Requested mode is distinct from the player-reported effective resolution, including Auto; `data-requested-quality` and `data-player-quality` on the Quality button expose those values without claiming setter confirmation.
- **Captions**: a feature-local hook owns an inline live/VOD chooser, its optional requested setting and its error. Captions come from the broadcaster's own stream; Twitch renders and styles them. Show calls only the documented zero-argument `enableCaptions()` and Hide only `disableCaptions()`, recording `data-requested-captions` (`show` or `hide`) only after the call returns without throwing. There is no availability getter: neither the UI nor silence from a source reports availability or confirms rendering. Mount, READY, opening, closing and source replacement never call either method; Twitch's default stays untouched until an explicit viewer request. Active-player lifecycle cleanup resets visibility, request and error; obsolete callbacks cannot restore them. Caption actions preserve the player instance, playback state and bookmarks.
- **Caption navigation**: Left/Right connects Quality, Captions and Past broadcasts in both directions. For legacy recordings with unknown broadcaster sentinel `"0"`, Captions and Fullscreen link directly around the disabled archive shortcut. Down from the open Captions control reaches Show (or Close before READY/offline); explicit links reach Show, Hide and Close, Up returns to Captions, and the chooser loops: Left from Show reaches Close, Right from Close returns to Show, and Down from Close returns to Captions. Before READY and offline, with Show/Hide disabled, Close keeps its Left escape to Captions instead of wrapping. Show/Hide are disabled until ready; disabling the focused command recovers focus to Close. The chooser, errors and Close stay outside the embed and remain escapable; Close restores Captions focus, and Escape still returns Home. Setter failures do not record a successful request and allow retry.
- **Chat**: live chat, without a VacuumStream controller composer or VOD chat replay. A feature-local hook owns separate visibility, iframe reload, and interaction state, reset on every source change. Hidden chat has no iframe. The documented `https://www.twitch.tv/embed/${encodeURIComponent(channelLogin)}/chat?parent=localhost` URL uses only the live source's login, with no tokens or additional parameters. Reload replaces only the chat iframe; chat actions never recreate or control the player. Twitch owns connection/error presentation; iframe `load` is not a connected signal.
- **Chat navigation**: Left/Right follows the rendered toolbar in both directions: Past broadcasts, Show/Hide chat, Enter chat, Reload chat, Fullscreen. Hidden chat omits Enter and Reload. Secondary actions remain on Down: Show/Hide to Enter, then Reload, then back to the toggle; Up returns to the toggle. All chat controls stay usable before READY and offline. The titled iframe normally has `tabIndex={-1}` and no controller focus marker; showing, hiding or reloading never focuses it.
- **Chat interaction**: only Enter chat arms the main-process Escape capability, sets `tabIndex={0}`, and focuses the frame, without forwarding the activating key. The viewer is interacting with Twitch's own interface, including its cookie/advertising consent dialog. A persistent hint outside both embeds explains Tab/Shift+Tab to move, Enter to activate, and Escape to return to Hide chat. Physical keyboard and Steam Input keyboard mappings work; native gamepad input into the frame is not yet supported. Escape exits this mode before it can reach Twitch; repeats and the matching release are consumed, while a later distinct Escape still returns Home. Hide, Reload, source replacement (including a returning source), BrowserWindow blur, leaving playback and unmount invalidate the session, remove its listeners, reset the frame to `tabIndex={-1}`, and recover shell focus. A mode-ending Escape retains only a release guard until that press ends. Late acknowledgements or notifications cannot revive a session.
- **Layout**: a player-stage grid holds the unobscured video frame and optional sibling chat pane. Video remains at least 400 by 300 px and expands to available space; when side-by-side cannot fit, the panes stack and the player view scrolls. Local toolbar, transport, quality and caption choosers, chat controls and the interaction hint remain outside both embeds. Each visible inline panel has its own content-sized grid row; simultaneous panels scroll rather than clipping controls or shrinking the video below its minimum. Chat is enlarged with a transform on its outer frame and compensating width/height, following the root scale for couch readability without injecting cross-origin CSS or cropping Twitch's UI.

### Search

- **Native gamepad editing**: while focus is within Search's form or on-screen keyboard, the
  west face button (physical button 2) deletes one trailing Unicode code point, and the north
  face button (physical button 3) submits the trimmed query. Both use the same deletion and
  guarded submit functions as the visible buttons. Empty-query and busy submissions are
  consumed no-ops, not global navigation. Neither shortcut moves focus or opens a result.
- **Press identity**: latch the physical face buttons through edge detection until release,
  even if focus, route or input priority changes. Resolve context only for a new press;
  holding the button that opened Search cannot then edit or submit it. These actions never
  repeat. D-pad/left-stick repeats retain the 500 ms delay and 100 ms interval.
- **Boundary**: dispatch a cancelable, bubbling renderer-local semantic event from the focused
  element. Only the form and keyboard consume it. An unconsumed event falls back to the
  existing `/` key dispatch, including on navigation, results and favourite actions. No IPC,
  cross-frame forwarding or keyboard remapping is involved. The entry hint explicitly names
  native gamepad shortcuts; physical keyboards and Steam Input keyboard mappings are unchanged.
- **Retry focus**: before favourites Retry removes itself, move focus to the persistent Search
  input if a search is pending, otherwise to the enabled form Search button. A disabled submit
  button is never a recovery target; request completion must not steal focus.

### Primitive Showcase

The development-only `?showcase=1` surface renders action default/focus/disabled states, populated/loading/error/empty shelves, media fallback handling, the real Continue Watching shelf in populated/legacy-entry/loading/read-error/removal-error fixtures, the real resume prompt in bookmarked/loading/read-error states, and category cards at 375, 768, 1280, 1920, and 3840 px before product screens are accepted.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
| --- | --- | --- | --- |
| Press | 120 ms | `ease-out` | Button acknowledgement |
| Focus | 180 ms | `cubic-bezier(0.16, 1, 0.3, 1)` | Card lift and frame |
| Panel | 240 ms | `cubic-bezier(0.16, 1, 0.3, 1)` | Dialog entry/exit |

Movement uses only `transform` and `opacity`. Short color and shadow transitions communicate focus/press state, and skeleton background-position communicates loading. Focus movement scrolls the destination into view with `nearest` alignment. `prefers-reduced-motion: reduce` removes smooth scrolling, transforms, and skeleton animation. The shell HTPC contract is four Arrow keys for movement, Enter for activation, and Escape for Back. Text entry and explicit interaction with Twitch's own chat UI are exceptions; chat uses Tab/Shift+Tab, Enter and Escape with physical or Steam-Input-mapped keyboard events. Gamepad normalization maps D-pad/left-stick, A, and B to those six keys. Holding a direction repeats after 500 ms at 100 ms intervals.

## 7. Depth & Surface

Use a mixed strategy with tonal surfaces at rest and a shadow only for active hierarchy:

- Rail and dialogs separate through tonal shifts.
- Cards have no container background; artwork provides the surface.
- Focus uses an inner canvas-colored gap plus an outer accent-strong frame.
- Selected cards use `0 0.75rem 2rem rgba(0, 0, 0, 0.42)`.
- Dialogs use `0 1.5rem 4rem rgba(0, 0, 0, 0.5)`.
- No glow, backdrop blur, gradient text, or decorative glass.

## 8. Accessibility Constraints

### Constraints

- WCAG target: 2.2 AA minimum, AAA text contrast where practical.
- Every shell task is operable with keyboard, standard gamepad, Steam Input keyboard mapping, touch, and pointer; Twitch chat interaction currently requires keyboard events.
- Every non-text shell task is operable with only four Arrow keys, Enter, and Escape; Twitch's own chat controls use Tab/Shift+Tab.
- Focus is always visible and never clipped by shelf overflow.
- Targets are at least 48 by 48 CSS pixels and expand on TV layouts.
- Navigation semantics remain stable across routes; controller Back never exits unexpectedly.
- Screen-reader labels avoid duplicated thumbnail/title announcements.
- Loading, empty, offline, expired-session, and API-error states provide a next action.
- Twitch device codes expire at the time returned by the service; do not assume a fixed lifetime.

### Platform limitations

| Item | Location | Why accepted | Owner / Exit |
| --- | --- | --- | --- |
| Twitch iframe internals cannot be restyled or fully inspected | Player | Official embed is the supported playback surface | Reassess only if Twitch ships a native desktop SDK |
| Real hardware gamepad labels vary by Steam Input layout | Input hints | Browser Gamepad API does not expose Steam's displayed binding names | Add Steam Input API integration if a supported desktop contract appears |
| Dedicated whole-shell offline screen | App shell | Contextual API errors keep navigation available | Reassess with offline usability feedback |
