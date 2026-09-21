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
| — | Ledger opened; no cycle recorded yet | — | — |
