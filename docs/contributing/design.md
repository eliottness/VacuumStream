# VacuumStream Design System

This is the interaction and visual contract for contributors, not a claim of complete
accessibility certification. See [development and manual checks](development.md).

## 1. Atmosphere & Identity

VacuumStream is a calm, dark broadcast wall designed to be read from a sofa. Live imagery carries the energy while the chrome stays quiet. Its signature is **signal focus**: the selected item lifts, gains a bright double focus frame, and reveals useful metadata without causing surrounding shelves to jump. The interface serves two primary personas: a Steam Deck user navigating with built-in controls and an HTPC viewer using a gamepad from three metres away. Mouse, keyboard, touch, reduced-motion, low-vision, and color-vision needs remain first-class constraints.

## 2. Color

The app is dark-only because playback is the dominant task and abrupt theme changes are distracting in a dim room.

| Role | Token | Value | Usage |
| --- | --- | --- | --- |
| Surface / canvas | `--color-canvas` | `#0e0e10` | App background |
| Surface / rail | `--color-rail` | `#18181b` | Navigation and fixed chrome |
| Surface / raised | `--color-raised` | `#26262c` | Dialogs, selected metadata |
| Surface / hover | `--color-hover` | `#323239` | Hovered controls |
| Text / primary | `--color-text` | `#f7f7f8` | Headings and key labels |
| Text / secondary | `--color-text-muted` | `#adadb8` | Metadata and hints |
| Text / disabled | `--color-text-disabled` | `#adadb8` | Disabled states; shape and surface also indicate disabled status |
| Text / on accent | `--color-on-accent` | `#ffffff` | Small text on purple and live-red fills |
| Accent / primary | `--color-accent` | `#9147ff` | Primary actions and active nav |
| Accent / strong | `--color-accent-strong` | `#bf94ff` | Focus frame and selected state |
| Accent / pressed | `--color-accent-pressed` | `#772ce8` | Active state |
| Live | `--color-live` | `#eb0400` | Live status only |
| Success | `--color-success` | `#00b37e` | Completed device authorization |
| Warning | `--color-warning` | `#ffb31a` | Recoverable service warnings |
| Error | `--color-error` | `#ff6b6b` | Errors and destructive action |
| Scrim | `--color-scrim` | `rgba(0, 0, 0, 0.72)` | Player and dialog overlays |

Rules:

- Purple is the only interaction accent; red is reserved for live state.
- Focus never relies on color alone: it combines a two-layer frame, lift, and metadata change.
- All body text targets WCAG 2.2 AAA where practical and never falls below AA.

## 3. Typography

Primary: **Atkinson Hyperlegible Next**, self-hosted, with `system-ui` fallback. Its differentiated letterforms support distance reading and low vision. No secondary family is needed.

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

- **Structure**: brand, primary routes, flexible spacer, settings/account.
- **States**: default, hover, active, focus, disabled.
- **Accessibility**: real links/buttons, visible label and icon, `aria-current`.
- **Motion**: focus lift only; labels never slide or collapse while focused.

### ActionButton

- **Variants**: primary, secondary, quiet, danger, icon.
- **States**: default, hover, active, focus, and disabled.
- **Accessibility**: minimum 48 px target on handheld and 56 px on TV; loading name remains stable.
- **Motion**: 120 ms press scale and 180 ms focus lift.

### StreamShelf

- **Structure**: heading/action cluster plus horizontal `StreamCard` reel.
- **States**: loading skeletons, populated, empty, error with retry.
- **Accessibility**: arrow keys move within and between shelves; no additional navigation key is required.
- **Layout**: reel owns horizontal overflow; no nested vertical scroll.

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

- **Structure**: official interactive Twitch player, local Back, play/pause, mute, Quality, VOD, live-only Show/Hide chat, Enter chat and Reload chat, and fullscreen controls, loading/error surface; VOD-only transport row with elapsed/total time and ±30-second/±5-minute jumps.
- **States**: local loading, ready, paused, muted, offline, and script/player load error; jumps disabled until ready with a finite positive duration.
- **Accessibility**: all playback actions use Arrow keys and Enter; Down from Back enters the jumps, Left/Right chooses, and Up returns to Back. Seeking retains focus and cancels autoplay retries without changing play/pause or mute.
- **Playback**: VOD jumps use the official Player API and clamp to recording bounds; live controls remain unchanged. Time refreshes on READY, PLAYING, SEEK, and once per second while a ready VOD is mounted.
- **Quality**: live and VOD Quality opens an inline chooser of official API options, refreshed on READY, PLAYING, and opening. Arrows and Enter request an exact quality ID; Close returns focus to Quality, while Escape still returns Home. Empty/offline states retain Back and Close. Requested mode is distinct from the player-reported effective resolution, including Auto; `data-requested-quality` and `data-player-quality` on the Quality button expose those values without claiming setter confirmation.
- **Chat**: live chat, without a VacuumStream controller composer or VOD chat replay. A feature-local hook owns separate visibility, iframe reload, and interaction state, reset on every source change. Hidden chat has no iframe. The documented `https://www.twitch.tv/embed/${encodeURIComponent(channelLogin)}/chat?parent=localhost` URL uses only the live source's login, with no tokens or additional parameters. Reload replaces only the chat iframe; chat actions never recreate or control the player. Twitch owns connection/error presentation; iframe `load` is not a connected signal.
- **Chat navigation**: Left/Right follows the rendered toolbar in both directions: Past broadcasts, Show/Hide chat, Enter chat, Reload chat, Fullscreen. Hidden chat omits Enter and Reload. Secondary actions remain on Down: Show/Hide to Enter, then Reload; Up returns to the toggle. All chat controls stay usable before READY and offline. The titled iframe normally has `tabIndex={-1}` and no controller focus marker; showing, hiding or reloading never focuses it.
- **Chat interaction**: only Enter chat arms the main-process Escape capability, sets `tabIndex={0}`, and focuses the frame, without forwarding the activating key. The viewer is interacting with Twitch's own interface, including its cookie/advertising consent dialog. A persistent hint outside both embeds explains Tab/Shift+Tab to move, Enter to activate, and Escape to return to Hide chat. Physical keyboard and Steam Input keyboard mappings work; native gamepad input into the frame is not yet supported. Escape exits this mode before it can reach Twitch; repeats and the matching release are consumed, while a later distinct Escape still returns Home. Hide, Reload, source replacement (including a returning source), BrowserWindow blur, leaving playback and unmount invalidate the session, remove its listeners, reset the frame to `tabIndex={-1}`, and recover shell focus. A mode-ending Escape retains only a release guard until that press ends. Late acknowledgements or notifications cannot revive a session.
- **Layout**: a player-stage grid holds the unobscured video frame and optional sibling chat pane. Video remains at least 400 by 300 px and expands to available space; when side-by-side cannot fit, the panes stack and the player view scrolls. Local toolbar, transport, quality chooser, chat controls and the interaction hint remain outside both embeds. Chat is enlarged with a transform on its outer frame and compensating width/height, following the root scale for couch readability without injecting cross-origin CSS or cropping Twitch's UI.

### Primitive Showcase

The development-only `?showcase=1` surface renders action default/focus/disabled states, populated/loading/error/empty shelves, media fallback handling, and category cards at 375, 768, 1280, 1920, and 3840 px before product screens are accepted.

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
