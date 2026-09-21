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
| 3 | [Correct VOD thumbnail dimensions](#cycle-3--correct-vod-thumbnail-dimensions) | fix | In progress |

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
