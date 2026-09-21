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
| 1 | [Add controller-native VOD seeking](#cycle-1--add-controller-native-vod-seeking) | feature | In progress |

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
fix category cards to request `GET /streams?game_id=…` instead of a channel-name search; readable
live chat; video-quality selection.
