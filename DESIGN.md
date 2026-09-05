# VacuumStream Design System

## 0. Research Log

- Embedded references: shortlisted PlayStation, Spotify, and Twitch's own product UI; picked the operational `taste-skill` discipline with the PlayStation big-screen reference because its 4K scaling and focus amplification suit a controller-first media browser.
- Lazyweb: two searches, three screens viewed (Twitch, DLive, CNN Watch); kept the persistent rail, horizontal shelves, partially visible next tile, 16:9 live cards, and prominent selected-item metadata. Desktop-sized text and invisible focus states were rejected.
- VacuumTube: studied commit `0365dead79d295294855f3dcc2f71702c0f8c427`; retained semantic input normalization, 500 ms hold delay, 100 ms repeat cadence, fullscreen Game Mode launch, and local settings ownership.
- Imagen drafts: skipped because no image-generation tool is available. Live Twitch thumbnails are the product's visual material, so fabricated imagery would also be misleading.

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

- **Structure**: official interactive Twitch player, local Back, play/pause, mute, VOD, and fullscreen controls, loading/error surface.
- **States**: local loading, ready, paused, muted, offline, and script/player load error.
- **Accessibility**: all playback actions use Arrow keys and Enter; local controls remain separate from Twitch's unobscured player.
- **Layout**: 16:9 frame, minimum 400 by 300 px, expands to available viewport.

### Primitive Showcase

The development-only `?showcase=1` surface renders action default/focus/disabled states, populated/loading/error/empty shelves, media fallback handling, and category cards at 375, 768, 1280, 1920, and 3840 px before product screens are accepted.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
| --- | --- | --- | --- |
| Press | 120 ms | `ease-out` | Button acknowledgement |
| Focus | 180 ms | `cubic-bezier(0.16, 1, 0.3, 1)` | Card lift and frame |
| Panel | 240 ms | `cubic-bezier(0.16, 1, 0.3, 1)` | Dialog entry/exit |

Movement uses only `transform` and `opacity`. Short color and shadow transitions communicate focus/press state, and skeleton background-position communicates loading. Focus movement scrolls the destination into view with `nearest` alignment. `prefers-reduced-motion: reduce` removes smooth scrolling, transforms, and skeleton animation. The complete HTPC contract is four Arrow keys for movement, Enter for activation, and Escape for Back; text entry is the only exception. Gamepad normalization maps D-pad/left-stick, A, and B to those six keys. Holding a direction repeats after 500 ms at 100 ms intervals.

## 7. Depth & Surface

Use a mixed strategy with tonal surfaces at rest and a shadow only for active hierarchy:

- Rail and dialogs separate through tonal shifts.
- Cards have no container background; artwork provides the surface.
- Focus uses an inner canvas-colored gap plus an outer accent-strong frame.
- Selected cards use `0 0.75rem 2rem rgba(0, 0, 0, 0.42)`.
- Dialogs use `0 1.5rem 4rem rgba(0, 0, 0, 0.5)`.
- No glow, backdrop blur, gradient text, or decorative glass.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- WCAG target: 2.2 AA minimum, AAA text contrast where practical.
- Every task is operable with keyboard, standard gamepad, Steam Input keyboard mapping, touch, and pointer.
- Every non-text task is operable with only four Arrow keys, Enter, and Escape.
- Focus is always visible and never clipped by shelf overflow.
- Targets are at least 48 by 48 CSS pixels and expand on TV layouts.
- Navigation semantics remain stable across routes; controller Back never exits unexpectedly.
- Screen-reader labels avoid duplicated thumbnail/title announcements.
- Loading, empty, offline, expired-session, and API-error states provide a next action.
- No timed interaction is required except Twitch's 30-minute device code, whose remaining time is announced without visual urgency.

### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
| --- | --- | --- | --- |
| Twitch iframe internals cannot be restyled or fully inspected | Player | Official embed is the supported playback surface | Reassess only if Twitch ships a native desktop SDK |
| Real hardware gamepad labels vary by Steam Input layout | Input hints | Browser Gamepad API does not expose Steam's displayed binding names | Add Steam Input API integration if a supported desktop contract appears |
| Dedicated whole-shell offline screen | App shell | Contextual API errors retain guest playback and avoid trapping the viewer | Add before public distribution if user testing shows the notice is insufficient |
