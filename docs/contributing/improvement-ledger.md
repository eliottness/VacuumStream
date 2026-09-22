# Improvement ledger

[Contribution guidelines](../../CONTRIBUTING.md) · [Development](development.md) · [Architecture](architecture.md)

A running record of the improvements VacuumStream takes on, one per cycle, in the order they
were selected. Each cycle picks a single highest-value item, implements it with tests, and
verifies it before the next cycle starts. The ledger exists so that the reasoning behind a
change survives the change: why this, why now, and how it was proven.

## How a cycle runs

1. **Scout.** A reviewer surveys three things and proposes exactly one item: the current
   codebase, the official Twitch platform surface (Helix, Device Code Flow, EventSub, chat,
   the embedded player API), and what people actually ask of a Twitch client on a TV,
   an HTPC, or a Steam Deck.
2. **Record.** The selected item is appended to the [cycle log](#cycle-log) below with its
   rationale and acceptance criteria before any code changes.
3. **Implement.** The change lands with colocated tests, keeping the four-arrow, Enter,
   Escape navigation contract and the process boundaries described in the architecture guide.
4. **Verify.** `bun run verify` must pass, plus observable evidence from the affected surface.
   Hardware checks happen on a Bazzite HTPC when the change can only be proven there.
5. **Commit.** One atomic commit per verified unit, then the next cycle begins.

## Scout brief

A scout report is only accepted when it contains all of the following.

| Section | Requirement |
| --- | --- |
| Name | Short imperative title, at most eight words |
| Type | `feature`, `fix`, or `refactor` |
| Why now | User evidence, platform evidence, and codebase evidence, with sources |
| Current behavior | What the code does today, cited by file and line |
| Target behavior | What a viewer on a sofa with a gamepad should experience instead |
| Affected files | Exact paths, marked new or modified |
| Implementation sketch | Ordered steps naming the Twitch endpoints and parameters involved |
| Acceptance criteria | Three to six observable criteria, each with the way it is observed |
| Risks and non-goals | What the change deliberately does not do |
| Runners-up | Rejected candidates kept for later cycles |

Proposals that bypass the official player, advertisements, or Twitch's own availability rules
are out of scope and are rejected without review.

## Cycle log

| Cycle | Item | Type | Status |
| --- | --- | --- | --- |
| 1 | [Add controller-native VOD seeking](#cycle-1--add-controller-native-vod-seeking) | feature | Landed |
| 2 | [Make category cards open matching live streams](#cycle-2--make-category-cards-open-matching-live-streams) | fix | Landed |
| 3 | [Correct VOD thumbnail dimensions](#cycle-3--correct-vod-thumbnail-dimensions) | fix | Landed |
| 4 | [Refresh and paginate Home and Following](#cycle-4--refresh-and-paginate-home-and-following) | fix | Landed |
| 5 | [Add controller-native playback quality selection](#cycle-5--add-controller-native-playback-quality-selection) | feature | Landed |
| 6 | [Browse followed channels even when offline](#cycle-6--browse-followed-channels-even-when-offline) | feature | Landed |
| 7 | [Add optional live chat beside playback](#cycle-7--add-optional-live-chat-beside-playback) | feature | Landed; its failing criterion closed by cycle 8 |
| 8 | [Make chat consent reachable without a pointer](#cycle-8--make-chat-consent-reachable-without-a-pointer) | fix | Landed |
| 9 | [Keep archives usable without thumbnails](#cycle-9--keep-archives-usable-without-thumbnails) | fix | Landed |
| 10 | [Remember and resume past broadcasts](#cycle-10--remember-and-resume-past-broadcasts) | feature | Landed |
| 11 | [Add a local Continue Watching shelf](#cycle-11--add-a-local-continue-watching-shelf) | feature | Landed |
| 12 | [Add controller-native closed caption controls](#cycle-12--add-controller-native-closed-caption-controls) | feature | In progress |

### Cycle 1 — Add controller-native VOD seeking

Past broadcasts are reachable but not navigable. The player toolbar offers Back, play/pause,
mute, Past broadcasts, and fullscreen; it shows no playback position and offers no way to move
through a recording, so a viewer holding only a gamepad cannot skip an intermission or rewind a
missed play. Twitch's official Player JavaScript API already provides `seek()`, `getCurrentTime()`,
`getDuration()`, and a `SEEK` event for VODs, so this closes a core viewing gap with a renderer-side
change: no new endpoint, OAuth scope, dependency, or private playback API.

Target: while watching a past broadcast, an elapsed/total readout plus **Back 5 minutes**,
**Back 30 seconds**, **Forward 30 seconds**, and **Forward 5 minutes**, all reachable with arrows
or a D-pad and activated with Enter or A, without focus falling into the Twitch iframe. Live
playback keeps its existing controls and gains no misleading seek buttons.

Acceptance criteria:

1. Seek controls exist only for VOD sources and stay disabled until Twitch reports a usable
   duration.
2. From 600 s in a 3,600 s recording the four actions request 300, 570, 630, and 900 s, and jumps
   clamp to the recording's bounds instead of requesting negative or past-the-end positions.
3. Arrows and D-pad reach every transport control from the player's entry focus and return to the
   toolbar; activation does not move focus into the embed.
4. The readout follows player-reported progress, handles recordings over an hour, and stops
   sampling when the VOD is left or replaced; seeking never triggers play, unmute, or a second
   player instance.
5. On the target hardware a real past broadcast seeks forward and backward with visible video and
   readout changes, with controls clear of Twitch's video at HTPC viewport sizes.
6. `bun run verify` passes with the existing autoplay and focus coverage intact.

Not in scope: live DVR seeking, persistent resume, playback speed, quality selection, chat, and
anything that touches advertisements or Twitch's access rules.

Runners-up recorded for later cycles: refresh live/followed discovery with working pagination;
readable live chat; video-quality selection.

Landed in `10e273b`. Verified with `bun run verify` (68 tests) and on a Bazzite HTPC, where a real
3 h 52 m past broadcast moved from 0:00:15 to 0:05:49 and back to 0:05:27 using arrow keys alone.

### Cycle 2 — Make category cards open matching live streams

"Browse by game" does not browse by game. A category card keeps the category's ID in its focus
target but discards it on activation, navigating to Search and running a channel-name query
instead. Twitch's Search Channels endpoint matches broadcaster login names, so choosing Fortnite
finds channels named after the game rather than live Fortnite streams; Get Streams is the endpoint
that filters by `game_id`. Every part needed already exists — the streams request path, the
response parser, broadcaster-profile enrichment, the stream cards, and the official-player opening
action — so this is wiring plus a category screen, with no new OAuth scope and no player changes.

Target: activating a category opens a page titled with that category showing its live streams,
navigable with arrows alone, with a Load more action that keeps the category filter and cursor,
and loading, empty and error states that stay escapable. A guest gets a sign-in route instead of
an unrelated channel search.

Acceptance criteria:

1. Selecting category `33214` issues `GET /helix/streams` with `game_id=33214` and `first=20`,
   never `search/channels` and never a `gameId` wire parameter; unfiltered Home requests are
   unchanged.
2. A second page reuses the same filter with the returned cursor, renders one card per stream ID
   even when pages overlap, and stops offering Load more once the cursor is exhausted.
3. Responses arriving after Back, after a newer category selection, or after logout never replace
   the active screen or its request state.
4. Loading, empty, failed, retried and guest paths are each understandable and escapable with a
   controller, and a guest triggers no catalog request.
5. On the target hardware two categories open and browse with arrows only, a second page loads,
   and a stream starts in the official player with unclipped controls.
6. `bun run verify` passes in one run with the autoplay, focus, authentication and cycle-1 VOD
   seeking suites intact.

Not in scope: category-name search, favorites, language filters, offline followed channels, a
general discovery refresh, and any player change.

Also observed during cycle 1 hardware testing and kept for a later cycle: the first past-broadcast
card rendered with a blank thumbnail, consistent with `src/main/twitch-schemas.ts` substituting
640x360 where Helix documents 320x180 for video thumbnails.

Landed in `ac3c6e6`. Hardware testing then exposed a latent parser defect that only pagination
could reach: Twitch reports `tags: null` for some channels, and `z.array(z.string()).default([])`
covers a missing field but not a null one, so the second page of a category failed validation with
`expected array, received null`. Every fixture in the suite supplied tags, so nothing caught it.
Fixed separately in `b4c75c6` with a shared nullish-tolerant tag schema for both the stream and
channel parsers. The failure did confirm the error path: rendered cards stayed on screen, the
message was readable, and Retry remained reachable.

### Cycle 3 \u2014 Correct VOD thumbnail dimensions

Twitch's Get Videos endpoint returns `thumbnail_url` containing `%{width}` and `%{height}` and
documents 320x180 as the substitution; the videos parser substituted 640x360. The live-stream
(640x360) and category box-art (384x512) mappings are separate and correct.

This was motivated by the blank past-broadcast card seen in cycle 1, but that link is unproven:
Twitch's own documentation-example image answers at both sizes, so a wrong size does not by itself
explain a missing preview. The change is justified as documented-contract compliance, and the
hardware check records what previews actually do rather than assuming a fix.

Acceptance criteria:

1. A `%{width}x%{height}` template resolves to exactly `320x180` with no leftover placeholder and
   unchanged metadata and cursor; the assertion fails against the previous implementation.
2. An already-resolved thumbnail URL passes through untouched and an empty videos page parses,
   both validated through the real `PageSchema(VideoCardSchema)` that preload uses.
3. Live thumbnails still resolve to 640x360 and category box art to 384x512.
4. On the target hardware, past broadcasts render visible previews, and a card still opens in the
   official player with the cycle-1 seek controls.
5. `bun run verify` passes in one run.

Not in scope: fallback artwork, retries, cache-busting, tolerating empty thumbnail fields, and the
presentation `width`/`height` attributes on the recording cards, which are deliberately unrelated
to the requested image size.

Landed in `dfab93b`. Hardware testing showed past-broadcast previews rendering across the grid,
and a card activating into the official player with the cycle-1 seek controls intact. One card is
still blank on each channel checked: always the newest, still-in-progress archive. Across three
channels that pattern held, which points at Twitch not having generated the artwork yet, but the
original cycle-1 blank card was on a channel that was not revisited, so its recovery is unverified
and is not claimed. This change stands on documented-contract compliance alone.

Two defects were observed and deliberately left for later cycles: a channel with no archives
renders an entirely empty Past broadcasts screen with no empty-state message, and the videos
parser accepts an empty thumbnail string that the shared contract then rejects as a URL.

### Cycle 4 — Refresh and paginate Home and Following

The two primary live shelves cannot be trusted to answer "who is live now". They load exactly once
per authentication change, inside a single `Promise.all` that also fetches categories, so any one
failure prevents its successful siblings from being installed. They request twenty streams and
throw the cursor away, so nothing beyond the first page is reachable, and there is no refresh
action anywhere — returning from playback shows the same snapshot. Cycle 2 already built the
pattern this needs: per-request generations, cursor forwarding, deduplication by stream ID, and
focus-preserving controls.

Target: entering Home or Following loads a fresh page, a Refresh action stays reachable while
browsing, and Load more appends further streams while a cursor exists. Refreshing replaces the
listing, paging appends unique streams, and populated cards stay usable during requests and
recoverable failures.

Acceptance criteria:

1. Route entry and Refresh each fetch a first page with no `after`, replacing rather than
   accumulating, without restarting authentication.
2. Load more forwards the exact cursor, renders one card per stream ID across overlapping pages,
   and disappears once the cursor is exhausted; Following keeps its `user_id` parameter.
3. Initial, refresh and pagination failures are independently recoverable, Retry repeats the
   operation that failed, and a sibling request's failure no longer discards successful results.
4. Obsolete responses settling after navigation, refresh, logout or an account change install no
   stale cards, cursors or errors; guests issue no authenticated request; repeated activation
   cannot duplicate an in-flight operation.
5. On the target hardware, arrows alone refresh, load a second page and recover from a failure,
   with visible focus retained when the exhausted Load more control disappears.
6. `bun run verify` passes in one run with existing suites intact.

Not in scope: timer-based or background refresh, EventSub notifications, an offline channel
directory, category or search pagination, and any player change.

Landed in `90f0aff`. Rather than copying the category machinery, both shelves and the category
screen now share a `useStreamCatalog` hook holding items, cursor, status, error, the operation
that failed, a generation counter and a pending-operation ref. Refresh may supersede an in-flight
page load while re-activating the same operation is ignored. Verified with `bun run verify`
(151 tests) and on the HTPC, where one arrow from the navigation reaches Refresh and Load more
appends a page without losing focus.

### Cycle 5 — Add controller-native playback quality selection

The shell owns the player instance and its controls but never asks Twitch what resolutions are
available. On an HTPC that matters twice over: a weak GPU or a thin connection needs a lower
rendition, and the viewer has no way to ask for one without a mouse. Twitch documents
`getQualities()`, `getQuality()` and `setQuality()` on the player it already embeds, so this needs
no second playback path and no new permission.

Target: a Quality action in the player toolbar opens a compact chooser listing exactly the
qualities Twitch reports, including Auto or Source when offered. Arrows reach it, Enter selects,
Close returns focus to Quality, and the embed is never covered.

Two traps this must respect. Qualities can be empty at READY and only arrive once playback starts,
so the list is read again on PLAYING and when the chooser opens. And `getQuality()` reports the
effective resolution even under Auto, so the viewer's requested mode is tracked separately rather
than inferred from it.

Acceptance criteria:

1. Only player-returned qualities appear, labels normalize for both documented shapes, and an
   empty list at READY becomes usable once PLAYING supplies options.
2. Quality, every option and Close are reachable with arrows; Enter selects the intended ID once
   and focus never enters the iframe.
3. Selecting calls `setQuality` with the exact returned ID and constructs no second player, seeks,
   or changes play/pause/mute intent.
4. Empty options, source replacement, offline and late callbacks are all handled; a previous
   channel's options never appear on a replacement player and Back stays reachable.
5. On the target hardware a real stream's quality is lowered and returned to Auto or Source, with
   the change confirmed through `getQuality()` rather than the shell label alone.
6. `bun run verify` passes in one run with existing suites intact.

Not in scope: a persisted quality preference, audio-only mode, codec selection, and any reuse or
extension of the private-DOM autoplay injection.

Landed in `fa034a8`, with the logic in a `usePlayerQuality` hook beside the player rather than
inside it. Hardware testing read the renderer over the remote debugging port instead of trusting
the on-screen label: `data-player-quality`, which carries `getQuality()`'s return, moved from
`auto` to `480p30` and back to `auto` as the viewer selected and reverted, while
`data-requested-quality` tracked the choice separately. The live payload confirmed the
group/name shape: `chunked` renders as "1080p60 (source)", `480p30` as "480p".

### Cycle 6 — Browse followed channels even when offline

Following only ever shows who is live. A viewer's favourite broadcaster disappears from the app
the moment they stop streaming, so catching up on their recordings means remembering the exact
channel name, typing it into search, opening a player, and only then reaching Past broadcasts.
`GET /helix/channels/followed` returns the whole follow list under the scope the app already
requests, so the directory needs no new authorization.

Target: Following gains an All channels mode listing every followed broadcaster with an avatar
and a Live or Offline snapshot. Each entry offers Open channel and Past broadcasts, so a viewer
reaches an offline broadcaster's recordings directly. Refresh and Load more work as they do
elsewhere, and every state is escapable with arrows alone.

Status is a snapshot, not a subscription, so Open channel stays available even on an offline
entry — a broadcaster may have gone live since the request. Enrichment is batched: one follows
request, one `GET /streams` with repeated `user_id`, one `GET /users` for avatars per page, never
a request per channel. A failed status lookup surfaces a recoverable error rather than quietly
declaring everyone offline.

Acceptance criteria:

1. `channels/followed` is called with the authenticated user's ID, `first=20` and the exact
   returned cursor; malformed input and unauthorized senders are rejected; cards pass the same
   page schema preload uses.
2. Mixed live and offline follows all stay listed, statuses match the batched streams response,
   and a populated page costs exactly one follows, one streams and one users request.
3. Refresh replaces, pagination deduplicates by broadcaster ID, retry repeats the failed
   operation, guests request nothing, and no stale result installs after a mode change,
   navigation, logout or account change.
4. Activating Past broadcasts on an offline broadcaster requests that exact user ID and builds no
   player until a recording is chosen; empty and failed archives are both explained and escapable.
5. On the target hardware the whole journey runs on arrows alone, with visible focus at
   pagination exhaustion and in empty states.
6. `bun run verify` passes in one run with existing suites intact.

Not in scope: follow management, sorting, background polling, notifications, clips, resume
history, archive pagination, and any player change.

This cycle also closes the recorded empty-archive defect, since an empty Past broadcasts screen
becomes the natural terminal state of browsing an offline channel.

Landed in `fd78626` (Helix directory, batching and trust boundary) and `e09171e` (the All
channels view, archive states and focus recovery), split so the main-process capability could be
reviewed on its own. `useAppController.ts` shrank by roughly 127 lines as the directory moved
into `useFollowedChannels.ts`, which also answers the module-size note recorded below. Verified
with `bun run verify` at 238 tests. The signed-in hardware pass is outstanding: see the note in
the table below about the HTPC session.

### Cycle 7 — Add optional live chat beside playback

Watching Twitch on a sofa without chat is watching half the stream, and the player screen has no
chat surface at all. Twitch documents a chat embed that takes a channel name and a `parent`, both
of which the app already holds, and the renderer's CSP already allows the origin — so this needs
no new permission, endpoint or dependency. Native EventSub chat would drag in a new scope,
subscription management and reconnection handling; the embed delivers reading chat now and leaves
that larger build for later if it is ever justified.

Target: a Show chat control beside the other player actions. Chat opens next to the video rather
than over it, playback continues untouched, and Hide restores the full-width player. A Reload
action replaces only the chat pane when it goes unresponsive, without restarting playback. Chat
starts hidden and is mounted only while shown, so viewers who never open it pay nothing.

The pane is Twitch's own UI in a cross-origin frame, which sets two honest limits. Parent styles
cannot reach inside it, so couch readability is achieved by scaling the whole frame rather than
injecting CSS or cropping Twitch's interface. And an iframe `load` event is not proof that
messages are flowing, so the shell never claims a connection it cannot observe.

Acceptance criteria:

1. The iframe URL carries the selected login and `parent=localhost`, with no token parameters and
   no new authentication or catalog calls; a VOD source shows no chat control.
2. Show, Hide and Reload are arrow-reachable in loading and offline states, focus stays on shell
   controls, and Escape still returns Home.
3. Showing, hiding and reloading chat keep the same player instance and player-root node and
   trigger no play, pause, mute, seek, quality or activation call.
4. Hidden chat renders no iframe, a channel change cannot retain the previous pane, leaving
   playback removes it, and a late iframe event cannot reopen a discarded pane.
5. On the target hardware, in guest mode, a live channel opened by exact name shows readable chat
   beside an unobstructed video, reloads, and hides — arrows only, video never below 400x300.
6. `bun run verify` passes in one run with existing suites intact.

Not in scope: composing messages, scrolling chat history with the controller, third-party emotes,
VOD chat replay, and any change to the autoplay mechanism.

**Hardware testing failed this cycle's real-surface criterion, and the gap is recorded rather than
glossed over.** The pane renders Twitch's cookie and advertising consent dialog instead of chat,
and it survives a reload. That dialog lives inside the cross-origin iframe, which this feature
deliberately keeps out of controller navigation, so a gamepad-only viewer on a fresh profile can
show, reload and hide chat but can never dismiss the gate and never sees a message. Everything
else held: the video measured 768x640 beside a 512x640 pane at 1280x720, well above Twitch's
400x300 minimum, and hiding restored the full-width player. The next cycle should decide how a
controller-only viewer consents — or whether an embed can serve this purpose at all.

One thing first recorded here as an inconsistency turned out not to be one. With chat open,
ArrowRight from Hide chat reaches Fullscreen while Reload sits on the down axis. That matches the
quality chooser, where the toggle keeps its horizontal neighbours and the panel's actions live
below it, and the existing tests assert that arrangement deliberately. Changing it broke eight of
them; the arrangement is the convention, not a defect.

Landed in `970d67c`, with the logic in a `usePlayerChat` hook so the player component barely grew.
The pane resets during render when the source changes, so a returning channel cannot revive its
old frame, and Reload simply re-keys the iframe. Readability is a transform on the frame's
wrapper with compensating dimensions, which scales Twitch's own UI without touching the
cross-origin document. Verified with `bun run verify` at 253 tests.

### Cycle 8 — Make chat consent reachable without a pointer

Cycle 7's chat pane is blocked by Twitch's consent dialog, which a viewer with no mouse cannot
dismiss. Two experiments settled how to fix it. Real OS key events **do** reach the focused
cross-origin frame: with the iframe focused, Tab walked a visible ring through Accept, Customize
and Reject, and Enter on Reject dismissed the gate and revealed real chat. But Electron's
`webContents.sendInputEvent` does **not** reach an out-of-process iframe — it moved focus to the
next shell button instead — so synthesised gamepad input cannot be forwarded that way. The only
measured path for synthesised input is a main-process debugger attachment driving
`Input.dispatchKeyEvent`.

This cycle deliberately takes the smaller half. It adds an explicit **Enter chat** mode that hands
focus to the frame and a guaranteed way back out, which makes consent operable with a physical
keyboard and with Steam Input controller-to-keyboard mapping — the path this project's own user
guide already documents for undetected controllers. Attaching Chromium's debugger in production
solely to forward D-pad presses is a real architectural cost and is not paid on the strength of
one blocked dialog; it is recorded below for a later cycle.

The delicate part is the way out. Twitch owns the focus ring once the frame has it, so Escape is
intercepted in the main process before the frame sees it, and one held Escape must leave chat
without also navigating Home.

Acceptance criteria:

1. Entry is explicit: focus stays in the shell until Enter chat is activated, and showing,
   reloading or hiding chat never focuses the frame on its own. VODs offer no chat interaction.
2. Escape always returns to a shell control, is intercepted before Twitch receives it, exits once
   per held press, and a later press still navigates Home.
3. Hide, Reload, source replacement, blur, leaving playback and unmount all end the mode, remove
   the listener, restore `tabIndex=-1` and land focus on an existing control.
4. Entering, using and leaving chat mode cause no player construction, activation, play, pause,
   mute, seek or quality call; the toolbar walks Hide → Enter → Reload → Fullscreen in both
   directions.
5. On the target hardware, signed out, the real consent gate is dismissed without a pointer and
   chat appears; the report states which input path was used.
6. `bun run verify` passes with no new scope, no debugger attachment, and `window-controls.ts`
   untouched.

Not in scope: native Gamepad API forwarding into the frame, native EventSub chat, message
composition, and any change to the autoplay mechanism.

Landed in `cc1b1f5`. On a fresh HTPC profile, signed out and using keys only, Show chat then
Enter chat put focus in the frame, Tab reached Twitch's Reject control, Enter dismissed the gate,
real chat appeared, and Escape returned to Hide chat without navigating Home. The interception
keeps two listeners: one prevents Escape reaching Twitch and notifies the renderer, a second
drains the rest of that held press so a single press cannot also trigger Home. The in-app hint
states that native gamepad input into chat is not supported yet, rather than implying it is.

### Cycle 9 — Keep archives usable without thumbnails

The videos parser keeps an empty `thumbnail_url` as an empty string, and the shared card contract
requires a URL. Preload validates the whole page, so a single artwork-less recording throws away
every other recording on it and the viewer sees an archive error instead of their broadcasts. A
read-only probe reproduced exactly that: two records in, one empty thumbnail, `Invalid URL` at
`items[1].thumbnailUrl`, and the valid sibling never survived validation.

This was recorded as a deferred item for several cycles because it was synthetic. Cycle 6 changed
the calculus by making archives a primary route — the way you catch up on an offline favourite —
so a page-wide failure now costs a whole viewing path rather than one card.

Target: a recording with no artwork keeps its title, broadcaster, duration, focus target and
activation, showing a neutral placeholder, and opens in the official player like any other. The
tolerance is deliberately narrow: only an exactly empty string becomes absent artwork, and only
the video card's contract changes. Malformed non-empty URLs are still rejected, and nothing is
ever given a fabricated URL.

Acceptance criteria:

1. A mixed page of templated, resolved and empty thumbnails keeps every id, field, order position
   and the cursor through the real page schema; only the empty one becomes absent.
2. Non-empty malformed URLs and bad wire types are still rejected, and live 640x360 and category
   384x512 artwork are untouched.
3. A card without artwork is reachable and activatable with a controller, and never renders an
   image with an empty source.
4. Activating the thumbnail-less card reaches the official player with that recording's exact ID,
   with no archive alert and no premature player construction.
5. Showcase at 1280x720 and 1920x1080 shows equal artwork geometry and no broken-image glyph.
6. `bun run verify` passes in one run.

Not in scope: retries or cache-busting for URLs that merely fail to load, archive pagination,
resume history, and cycle 3's sizing decision.

Landed in `c25f71c`. The new page-level test was confirmed failing first, with the same ZodError
the probe produced. Inspecting the result on the signed-out Showcase route surfaced a neighbour:
the artwork-less card renders cleanly, but the normal card beside it shows a broken-image glyph
because the fixture URL does not resolve — `VideoShelf` has no `onError` fallback for a thumbnail
that fails to load, unlike `StreamShelf`. Different defect, recorded below rather than folded in.

### Cycle 10 — Remember and resume past broadcasts

Losing your place in a four-hour broadcast means navigating back and seeking by hand every time.
The player already samples a recording's timeline every second; it simply throws the number away
when you leave. Twitch's interactive player documents a VOD-only `time` constructor option, so a
saved position can be handed back to the official player without a new endpoint, permission or
any seeking of our own.

Where the bookmarks live matters. Production serves the renderer from an ephemeral port, so
origin-scoped browser storage cannot be relied on across launches; persistence goes in the main
process under `userData`, alongside the existing atomic-write pattern but separate from settings
and tokens.

Two honesties are built into the design. Positions are local to this installation and shared by
anyone using the profile, including across Twitch account changes — the documentation says so
rather than implying per-account history. And a bookmark records OBSERVED playback: startup
zeros and unconfirmed resume samples must never overwrite a real position, and completion is
taken from the documented `ENDED` event rather than guessed from nearing the duration, because an
in-progress archive keeps growing.

Target: reopening a part-watched recording offers Resume from its timestamp, Start over, and
Back, reachable with arrows alone, with nothing playing behind the choice.

Acceptance criteria:

1. Positions survive a fresh store, overlapping writes stay valid, the collection is bounded, and
   IPC rejects malformed payloads and unauthorized senders.
2. Reopening offers the choice, constructs no player before selection, and Resume yields exactly
   one constructor call carrying the right video ID and `time`.
3. Start over clears the bookmark, Back plays nothing, `ENDED` removes it and cleanup cannot
   bring it back.
4. Late lookups, startup zeros and queued saves cannot corrupt progress; live sources get no
   `time` option and perform no progress operations.
5. Read and write failures stay visible without blocking playback.
6. The `?showcase=1` surface works with arrows on the target hardware and `bun run verify` passes.

Not in scope: watch-history synchronization, cross-device progress, a Continue Watching shelf,
resuming automatically at boot, and archive pagination.

Landed in `a92c027` (store, IPC, preload) and `668820d` (prompt, checkpointing), split so the
persistence boundary could be reviewed on its own. The store's tests aim at the ways a bookmark
store destroys data rather than at the happy path: overlapping saves serialized, removal that
cannot be resurrected, eviction of the least recently updated rather than the first inserted, and
malformed files surfacing instead of silently wiping. `__proto__` is rejected as a video ID.

The renderer honours both traps the design called out. A `ready` sample never becomes a save, so
resuming cannot destroy the position it just used, and completion is taken only from `ENDED`,
with queued saves cancelled so they cannot undo the removal. Checkpoints are throttled to fifteen
seconds and roll back when a write fails. On the signed-out Showcase the prompt reads "Resume
from 1:05:00" and states that positions stay on this installation and are shared across Twitch
accounts — the caveat lives in the interface, not only in the documentation.

### Cycle 11 — Add a local Continue Watching shelf

Cycle 10 remembers where you stopped, but you still have to rediscover the recording through its
channel's archive to get back to it — and that route needs an account. The bookmarks already sit
in a local store; Home simply cannot enumerate them, because the capability exposes only get,
save and remove.

Target: a Continue Watching row above the live shelf, newest first, at most ten entries, showing
a title and saved elapsed/total time. It works signed out, opens cycle 10's existing prompt, and
offers Forget progress that deletes the bookmark rather than merely hiding the card.

Three decisions worth recording. Bookmarks gain optional bounded display metadata behind a
version-2 envelope that must read existing version-1 files without losing an entry or shifting a
position. Older bookmarks have no recoverable title, so they show as "Recording <id>" and stay
resumable rather than being hidden or enriched by a background Helix call. And the shelf must
reflect a departure checkpoint that is still queued in the renderer, because renderer ordering
and the main store's own serialization are two separate queues — main-process ordering alone
would not guarantee a fresh Home read sees it.

Acceptance criteria:

1. Listing is bounded, deterministically ordered, and version-1 files survive unchanged; IPC
   rejects extra arguments, unauthorized frames and malformed metadata or results.
2. Guest Home shows exactly the newest ten of twelve seeded bookmarks, including a legacy entry,
   with no catalog request or authorization flow.
3. Selecting an entry constructs no player before a choice; Resume gives one player with the
   right ID and time; Back none; Start over clears the bookmark; legacy entries need no
   broadcaster lookup.
4. A queued departure save or completion removal is reflected once settled, and obsolete listing
   responses cannot reinstall removed entries.
5. Forget progress, read errors and removal errors are all recoverable with a controller, and
   focus lands on a surviving control when the last entry disappears.
6. The shelf reads well at 1280x720 and 1920x1080 signed out, and `bun run verify` passes.

Not in scope: Twitch history synchronization, thumbnails, a full history browser, availability
lookups, and autoplay at boot.

Landed in `40d7e38` (listing, metadata, version-2 envelope) and `c62a092` (the shelf itself).
The two-queue hazard is handled structurally rather than by timing: `playback-progress.ts` holds
a per-video promise chain and the listing awaits all pending renderer mutations with
`Promise.allSettled` before invoking IPC, while deliberately not serializing mutations behind
reads — an obsolete listing must never block Forget progress. On the signed-out Showcase the
shelf shows "A quiet evening building a world together" at 1:05:00 / 3:00:00 beside a legacy
"Recording 123456789", each with Forget progress, under the caption "Saved on this installation"
so the locality caveat is visible rather than buried in documentation.

### Cycle 12 — Add controller-native closed caption controls

A viewer who needs captions currently cannot reach them: the shell owns the player but exposes
no caption control, and Twitch's own controls are inside a frame this app deliberately keeps out
of controller navigation. Twitch documents `enableCaptions()` and `disableCaptions()`, and the
currently served SDK really does contain both — the scout checked the shipped file rather than
trusting the documentation alone.

Target: a Captions control between Quality and Past broadcasts opening an inline chooser with
Show captions, Hide captions and Close, reachable with arrows and leaving focus in the shell.

The honest constraint shapes the design. The API has commands but **no availability getter**, so
the chooser reports what the viewer asked for, never whether captions exist or are actually
rendering, and Twitch's default is left alone until the viewer acts. Silence from a source means
nothing and must not be read as "no captions".

Acceptance criteria:

1. Show calls `enableCaptions()` once and Hide calls `disableCaptions()` once; opening and
   closing call neither; neither runs before READY or while offline.
2. Arrows reach Captions and both commands from either side, focus stays in the shell and
   returns on Close, including the legacy-recording route around the disabled archive shortcut.
3. No player reconstruction and no play, pause, mute, seek, quality or activation call follows
   from using captions.
4. A failed command shows an escapable error without recording success, and source replacement
   clears requests and errors beyond the reach of obsolete callbacks.
5. On the target hardware, real captions appear and disappear on a public captioned stream — a
   changed label is not evidence. If no captioned public stream can be found at the time, that
   is recorded as unverified rather than faked.
6. `bun run verify` passes in one run.

Not in scope: transcription or translation, a persisted caption preference, a custom subtitle
overlay, and the private-DOM autoplay debt, which this cycle explicitly does not close.

## Observed but not yet scheduled

Defects and debts found during cycle work or review, recorded here instead of being folded into
an unrelated change. Each is a candidate for a future cycle.

| Observation | Where | How it was found |
| --- | --- | --- |
| A channel with no archives renders an empty Past broadcasts screen: heading and Back only, no empty-state message | `src/renderer/src/components/VideoShelf.tsx` | Hardware testing, cycle 3 |
| ~~The videos parser accepts an empty `thumbnail_url` string that the shared contract then rejects as a URL~~ — closed in cycle 9 | `src/main/twitch-schemas.ts`, `src/shared/contracts.ts` | Scout probe, cycle 4; fixed cycle 9 |
| A recording whose thumbnail URL fails to LOAD shows a broken-image glyph: `VideoShelf` has no `onError` fallback, unlike `StreamShelf` which hides the image | `src/renderer/src/components/VideoShelf.tsx` | Cycle 9 Showcase inspection; observed |
| Autoplay activation injects JavaScript that clicks private Twitch DOM selectors and calls `video.play()`, so the client is not free of iframe DOM playback control despite the stated policy | `src/main/window-controls.ts` | Gate review; predates the recorded cycles |
| Two inherited tests do not constrain what they claim: one pins the absence of loading prose rather than obstruction, the other omits required fields so it would pass without the constraint it names | `PlayerView.test.tsx`, `twitch-schemas.test.ts` | Gate review |
| ~~Search and past-broadcast handlers guard obsolete successes but not obsolete failures~~ — no longer true: both catch blocks now check request and authentication epochs | `src/renderer/src/useAppController.ts` | Gate review; re-checked and closed during cycle 6 scouting |
| ~~A channel with no archives renders an empty Past broadcasts screen~~ — closed in cycle 6 with a status element and reachable Back | `src/renderer/src/components/VideoShelf.tsx` | Hardware testing, cycle 3; fixed cycle 6 |
| Cursor exhaustion on a live shelf and an induced shelf request failure cannot be staged against real Twitch data, so both remain test-only rather than hardware-verified | `src/renderer/src/components/StreamShelf.tsx` | Cycle 4 hardware QA; recorded as a verification limit, not a defect |
| Chat's consent gate is unreachable without pointer input — being addressed in cycle 8 for keyboard and Steam Input paths | `src/renderer/src/components/usePlayerChat.tsx` | Cycle 7 hardware QA; observed, blocks the feature's purpose |
| Native Gamepad API input cannot reach the chat frame: the bridge dispatches DOM events, which never cross into a cross-origin document, and `webContents.sendInputEvent` does not reach an out-of-process iframe. The only measured path is a main-process debugger attachment driving `Input.dispatchKeyEvent`, which is privileged and conflicts with DevTools | `src/renderer/src/focus-navigation.ts`, `src/main/` | Cycle 8 scouting; deferred as an architectural decision, not an oversight |
| ~~With chat open, ArrowRight from Hide chat skips Reload~~ — withdrawn: secondary panel actions live on the down axis by convention, matching the quality chooser, and the tests assert it | `src/renderer/src/components/usePlayerChat.tsx` | Cycle 7 hardware QA; re-assessed and withdrawn |
| The HTPC test account is signed out after an in-app Client ID change during QA; Device Code Flow needs the user, so authenticated hardware checks are paused | n/a | Cycle 6 hardware QA |
| `PlayerView.tsx` and `useAppController.ts` have grown past 300 lines each, mixing playback lifecycle with rendering and catalog with navigation | both files | Gate review; maintenance note, not a defect |
