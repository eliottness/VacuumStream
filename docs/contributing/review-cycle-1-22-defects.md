# Cycles 1-22 review: defect ledger

[Contribution guidelines](../../CONTRIBUTING.md) · [Development](development.md) · [Architecture](architecture.md)

Reviewed range: `main 4710cc9..a2fe642` (22 improvement cycles).
The review used one lane per cycle, cross-cutting performance, security, and documentation lanes, and the orchestrator's manual QA on the running app.
A defect row is a review finding, not a landed change.

## Severity

- **blocker:** User-facing breakage or data loss.
- **major:** Wrong behavior on a realistic path.
- **minor:** Degraded behavior on an edge path.
- **nit:** Cosmetic or maintainability concern.

## Summary

| lane | blockers | majors | minors | nits | total |
| --- | ---: | ---: | ---: | ---: | ---: |
| cycle-01 | 0 | 0 | 3 | 0 | 3 |
| cycle-02 | 0 | 0 | 0 | 0 | 0 |
| cycle-03 | 0 | 0 | 0 | 0 | 0 |
| cycle-04 | 0 | 0 | 0 | 0 | 0 |
| cycle-05 | 0 | 0 | 1 | 0 | 1 |
| cycle-06 | 0 | 0 | 0 | 0 | 0 |
| cycle-07 | 0 | 1 | 0 | 0 | 1 |
| cycle-08 | 0 | 1 | 0 | 0 | 1 |
| cycle-09 | 0 | 0 | 2 | 0 | 2 |
| cycle-10 | 0 | 0 | 2 | 0 | 2 |
| cycle-11 | 0 | 0 | 0 | 0 | 0 |
| cycle-12 | 0 | 0 | 1 | 0 | 1 |
| cycle-13 | 0 | 0 | 2 | 0 | 2 |
| cycle-14 | 0 | 0 | 1 | 0 | 1 |
| cycle-15 | 0 | 2 | 1 | 0 | 3 |
| cycle-16 | 0 | 0 | 2 | 0 | 2 |
| cycle-17 | 0 | 0 | 2 | 0 | 2 |
| cycle-18 | 0 | 1 | 2 | 0 | 3 |
| cycle-19 | 0 | 1 | 3 | 0 | 4 |
| cycle-20 | 0 | 0 | 3 | 0 | 3 |
| cycle-21 | 0 | 0 | 1 | 0 | 1 |
| cycle-22 | 0 | 1 | 2 | 0 | 3 |
| xc-security | 0 | 1 | 1 | 0 | 2 |
| xc-performance | 0 | 0 | 6 | 0 | 6 |
| xc-docs | 0 | 1 | 0 | 0 | 1 |
| manual-qa | 0 | 2 | 2 | 0 | 4 |
| **total** | **0** | **11** | **37** | **0** | **48** |

The table holds 48 rows. Two further ids exist outside it: `D-cycle-21-1`, merged
into `D-cycle-08-1` and recorded under "Duplicates and cross-lane themes", and the two withdrawn
manual-QA findings under "Withdrawn findings".

## Per-lane verdicts

One review lane ran per cycle plus three cross-cutting lanes, and the orchestrator's manual QA is
its own lane. "Flows executed" counts only rows this session drove on the running app; the rest
are blocked on an environment limit, an account, or hardware, and each says which.

| lane | defects | flows queued | flows executed | verdict |
| --- | --- | ---: | --- | --- |
| cycle-01 | 3 (0 major, 3 minor) | 5 | 4 (3 pass, 1 partial, 0 fail) | FINDINGS - minor only |
| cycle-02 | 0 (0 major, 0 minor) | 3 | 1 (1 pass, 0 partial, 0 fail) | CLEAN |
| cycle-03 | 0 (0 major, 0 minor) | 1 | 0 (0 pass, 0 partial, 0 fail) | CLEAN |
| cycle-04 | 0 (0 major, 0 minor) | 5 | 1 (1 pass, 0 partial, 0 fail) | CLEAN |
| cycle-05 | 1 (0 major, 1 minor) | 5 | 4 (3 pass, 1 partial, 0 fail) | FINDINGS - minor only |
| cycle-06 | 0 (0 major, 0 minor) | 3 | 1 (1 pass, 0 partial, 0 fail) | CLEAN |
| cycle-07 | 1 (1 major, 0 minor) | 6 | 4 (3 pass, 0 partial, 1 fail) | FINDINGS - a flow fails |
| cycle-08 | 1 (1 major, 0 minor) | 5 | 2 (0 pass, 2 partial, 0 fail) | FINDINGS - major |
| cycle-09 | 2 (0 major, 2 minor) | 2 | 1 (1 pass, 0 partial, 0 fail) | FINDINGS - minor only |
| cycle-10 | 2 (0 major, 2 minor) | 5 | 1 (1 pass, 0 partial, 0 fail) | FINDINGS - minor only |
| cycle-11 | 0 (0 major, 0 minor) | 8 | 8 (7 pass, 1 partial, 0 fail) | CLEAN |
| cycle-12 | 1 (0 major, 1 minor) | 6 | 5 (5 pass, 0 partial, 0 fail) | FINDINGS - minor only |
| cycle-13 | 2 (0 major, 2 minor) | 2 | 1 (1 pass, 0 partial, 0 fail) | FINDINGS - minor only |
| cycle-14 | 1 (0 major, 1 minor) | 6 | 3 (1 pass, 2 partial, 0 fail) | FINDINGS - minor only |
| cycle-15 | 3 (2 major, 1 minor) | 6 | 0 (0 pass, 0 partial, 0 fail) | FINDINGS - major |
| cycle-16 | 2 (0 major, 2 minor) | 4 | 4 (4 pass, 0 partial, 0 fail) | FINDINGS - minor only |
| cycle-17 | 2 (0 major, 2 minor) | 4 | 3 (3 pass, 0 partial, 0 fail) | FINDINGS - minor only |
| cycle-18 | 3 (1 major, 2 minor) | 5 | 1 (1 pass, 0 partial, 0 fail) | FINDINGS - major |
| cycle-19 | 4 (1 major, 3 minor) | 9 | 4 (3 pass, 1 partial, 0 fail) | FINDINGS - major |
| cycle-20 | 3 (0 major, 3 minor) | 3 | 1 (1 pass, 0 partial, 0 fail) | FINDINGS - minor only |
| cycle-21 | 1 (0 major, 1 minor) | 4 | 1 (1 pass, 0 partial, 0 fail) | FINDINGS - minor only |
| cycle-22 | 3 (1 major, 2 minor) | 6 | 0 (0 pass, 0 partial, 0 fail) | FINDINGS - major |
| xc-security | 2 (1 major, 1 minor) | 2 | 1 (1 pass, 0 partial, 0 fail) | FINDINGS - major |
| xc-performance | 6 (0 major, 6 minor) | 3 | 2 (2 pass, 0 partial, 0 fail) | FINDINGS - minor only |
| xc-docs | 1 (1 major, 0 minor) | 8 | 2 (2 pass, 0 partial, 0 fail) | FINDINGS - major |
| manual-qa | 4 (2 major, 2 minor) | 0 | 0 (0 pass, 0 partial, 0 fail) | FINDINGS - major |

## Gate review history

The review itself was audited three times by an independent gate reviewer. Each round's
blockers were about the accuracy of this review, not about product fixes.

| round | verdict | blockers raised | disposition |
| --- | --- | --- | --- |
| 1 | REJECT | two manual-QA findings described intended behaviour; several flow verdicts exceeded their evidence; journeys that needed only local fixture data were skipped as auth-only | D-manual-qa-1 and D-manual-qa-4 withdrawn; disputed rows re-executed or downgraded; bookmarks and favourites seeded as JSON and the fixture journeys executed |
| 2 | REJECT | four rows still overstated (second Settings width, Save focus sampling, narrow-chat scrolling, chooser traversal), three newly executed rows missing their defining condition, and four VOD rows blocked on a prerequisite that does not exist | all re-executed with the viewport measured in-page and observers armed before the action; the past-broadcast rows ran against a real public VOD seeded as a bookmark; F-cycle-07-6 now fails honestly and is filed as D-manual-qa-5 |
| 3 | REJECT | startup-failure graph started from the wrong control, startup race not observed mid-startup, VOD paused state not actually established, browser launch target not measured | all four closed: the graph trace now matches from Back, the race is observed with the first instance still starting, the activation URL is measured off the browser command line, and the paused-state failure is filed as D-manual-qa-6 |

The third round's four items were fixed and re-verified with captured evidence; a fourth review
was not run. Anyone re-opening this review should start from that round's report,
`.omo/evidence/review-cycles-1-22-delta2-gate-review.md`, and the artifacts under
`.omo/review/qa/`.

## Defects

| id | lane | severity | location | observed | why it is wrong | suggested fix | confidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D-cycle-07-1 | cycle-07 | major | src/renderer/src/components/usePlayerChat.tsx:201 | Chat requires Tab/Shift+Tab for physical keyboards and Steam Input mappings; only native Gamepad API actions receive next/previous translation. A fresh profile therefore has no six-key keyboard route through Twitch consent. | The arrows-only guest-chat criterion and controller contract are unmet for keyboard-mapped controllers. | Translate physical/mapped arrows into bounded chat next/previous actions while interacting with chat, preserving Enter/Escape. | high |
| D-cycle-08-1 | cycle-08 | major | src/renderer/src/components/usePlayerChat.tsx:119 | Entering chat attaches `load -> endInteraction`; entering while a shown or reloaded iframe is still loading makes its first ordinary load reset tabIndex, end the session, and focus Hide chat. | Initial navigation is not an exit, so a fast arrow/Enter sequence ejects a pointerless viewer before consent. | Track initial navigation separately; retain the session through first load and tear down only on explicit or subsequent unexpected navigation. | high |
| D-cycle-15-1 | cycle-15 | major | src/renderer/src/components/PlayerView.tsx:222 | OFFLINE stops sampling but does not cancel startup activation retry or invalidate its response. A queued retry after OFFLINE then ONLINE activates, unmutes, and changes the shell to Pause without input. | Recovery is not read-only during the initial activation window and can restart or unmute playback. | Cancel/invalidate automatic activation on OFFLINE and do not restart it on ONLINE; test queued and deferred activation across outage. | high |
| D-cycle-15-3 | cycle-15 | major | src/renderer/src/components/PlayerView.tsx:276 | On paused ONLINE recovery, activating Play explicitly focuses the Twitch iframe and never returns focus to a shell control. | The instructed recovery action violates the no-player-iframe-focus contract, so shell arrow/Enter/Escape navigation no longer receives events. | Keep focus on an enabled shell control, preferably Back during activation, and test Play then shell-arrow return. | high |
| D-cycle-18-1 | cycle-18 | major | src/renderer/src/components/SearchView.tsx:172 | North/Y submission on the focused keyboard Search button sets busy and natively disables that button; neither submit control preserves focus. | Chromium can blur the focused control to body during an authenticated request, breaking stationary controller focus. | Keep submit controls focusable with `aria-disabled`, retain the busy guard, and browser-test both submit targets through a deferred request. | high |
| D-cycle-19-1 | cycle-19 | major | src/renderer/src/components/SettingsPanel.tsx:196 | Save becomes natively disabled when its focused activation sets shared busy; no handler transfers or restores focus. | Saving can leave controller focus on BODY, repeating the focus-loss class fixed on the adjacent account action. | Keep Save natively enabled with `aria-disabled`/`aria-busy` and retain the synchronous pending guard. | high |
| D-cycle-22-1 | cycle-22 | major | src/main/twitch-auth.ts:67 | A superseded, older completed begin request replaces pending authorization. Reordered newer-then-older responses make CODE0002 unusable and the next snapshot regress to CODE0001. | The remount path still accepts stale main-process authorization state, so acceptance criterion 3 fails. | Reserve an authorization generation before await and validate it before installing pending state; test reordered replies with real snapshots. | high |
| D-xc-docs-1 | xc-docs | major | docs/contributing/architecture.md:33 | The Main-process authority list omits main's ability to run script in the cross-origin Twitch player iframe. `activateEmbeddedPlayer` clicks private Twitch selectors and controls video mute/play. | Architecture and README non-bypass wording do not disclose this acknowledged DOM-clicking capability or its content-gate effect. | Document the capability, selectors, scope, and timeout with the existing ledger debt, or qualify the README claim. | high |
| D-xc-security-1 | xc-security | major | src/main/ipc.ts:95 | Catalog/auth IPC handlers propagate raw Ky errors containing bearer request headers or refresh-token request bodies; Electron logs rejected invoke errors. | Ordinary outages can copy reusable credentials from protected storage into launcher, journal, or debug logs. | Reject with a fresh allowlisted error lacking request/options/body/cause and never log the raw error; test synthetic tokens. | high |
| D-cycle-01-1 | cycle-01 | minor | src/renderer/src/components/PlayerView.tsx:423 | A focused seek button becomes natively disabled after unusable duration or OFFLINE, with no seek-control focus recovery. | Chromium can drop focus to body, violating continuous shell focus until another arrow repairs it. | Before disabling a focused jump, move and mark focus on persistent Back; add focused-jump invalidation coverage. | medium |
| D-cycle-01-2 | cycle-01 | minor | src/renderer/src/components/PlayerView.tsx:97 | Seeking cancels the renderer timeout and invalidates the result, but cannot cancel an already dispatched activation whose script awaits a frame before muting and playing. | A seek can still be followed by automatic playback/unmute despite the cancellation promise. | Propagate cancellation/session identity into activation and check it after asynchronous boundaries before media mutations. | medium |
| D-cycle-01-3 | cycle-01 | minor | src/renderer/src/components/PlayerView.test.tsx:2339 | Seek destination/boundary tests stop at mock calls with a no-op harness; cancellation manually changes timeline time independently. | An adapter that ignores every seek can pass, so successful seek-to-readout behavior and in-flight side effects are not constrained. | Add a stateful seek boundary and observed readout/focus assertions; test the real media-side-effect boundary. | high |
| D-cycle-05-1 | cycle-05 | minor | src/renderer/src/components/PlayerView.test.tsx:87 | The quality setter is a no-op spy; reported quality changes are supplied separately by mutating the fixture. | Tests can pass with no rendition change, constraining requests rather than applied quality. | Add official-embed quality selection/restoration checks using independently observed `getQuality()` results. | high |
| D-cycle-09-1 | cycle-09 | minor | src/main/twitch-schemas.test.ts:254 | The malformed-thumbnail test checks one non-empty bad URL but no malformed video field types such as `thumbnail_url: null` or `view_count: "12"`. | Regressions in video-field schemas can admit bad wire types while cycle tests pass. | Add table-driven malformed video payloads and assert real parser/preload rejection with `ZodError`. | high |
| D-cycle-09-2 | cycle-09 | minor | src/renderer/src/App.followed-channels.test.tsx:417 | Mixed-archive activation checks `constructedPlayer` with the expected ID, not the resulting PlayerView source or official-player root. | A broken route/render path can satisfy the constructor call without taking the user to the player. | Keep the ID check and assert player screen/source plus mounted `#twitch-player-root`. | medium |
| D-cycle-10-1 | cycle-10 | minor | src/renderer/src/components/VideoResumePrompt.tsx:86 | Resume prompts hard-wire all directional links to prompt-local IDs, trapping focus in the first inline `?showcase=1` prompt. | The promised arrow-usable showcase cannot reach later fixtures or CategoryShelf. | Add optional boundary-focus props and wire Showcase boundaries so Up/Down can leave inline prompts. | high |
| D-cycle-10-2 | cycle-10 | minor | src/renderer/src/components/VideoResumePrompt.test.tsx:55 | Tests cover isolated prompt loops and callbacks but never mount Showcase or assert focus can leave a prompt in page flow. | The showcase focus-trap criterion is unconstrained. | Mount Showcase, enter the first prompt, and assert controller navigation reaches a later non-prompt control. | medium |
| D-cycle-12-1 | cycle-12 | minor | src/renderer/src/components/PlayerView.test.tsx:1193 | Caption success and Hide use a no-op SDK mock and renderer request/pressed state; the harness has an empty iframe. | Tests cannot fail when the real SDK accepts commands but never visibly shows or hides captions. | Supplement shell tests with an official-player check on a confirmed captioned broadcast, observing captions appear and disappear. | high |
| D-cycle-13-1 | cycle-13 | minor | src/renderer/src/components/VideoShelf.test.tsx:180 | Replacement-artwork coverage calls `recording.focus()` only after error and replacement rendering complete. | It proves focusability after transitions, not preservation of existing controller focus through them. | Focus first, then assert the same active element and button identity after error and URL replacement without refocusing. | high |
| D-cycle-13-2 | cycle-13 | minor | src/renderer/src/App.followed-channels.test.tsx:402 | Failed-artwork activation ends by checking a fake player's `{ video: "recording" }` constructor call; the fake has no iframe or playback events. | Option forwarding does not prove usable, user-visible player activation. | Retain options coverage and add real-surface QA that opens the official embed with shell focus preserved. | high |
| D-cycle-14-1 | cycle-14 | minor | src/renderer/src/components/PlayerView.startup.test.tsx:248 | Recovery tests end at constructor and IPC counts; they never emit replacement READY, assert a recovered shell, or fail a second download. | Completed recovery and repeated-failure behavior can regress while request bookkeeping still passes. | Drive replacement READY and second failure/success, asserting controls, error state, iframe count, and shell focus. | high |
| D-cycle-15-2 | cycle-15 | minor | src/renderer/src/components/PlayerView.tsx:360 | OFFLINE disables focused playback or mute with no focus rescue; closed choosers provide no fallback and ONLINE does not restore focus. | Disabling either toolbar control can leave body focused during an outage. | Move controller-marked focus to Back before disabling these controls; exercise both buttons across OFFLINE/ONLINE. | medium |
| D-cycle-16-1 | cycle-16 | minor | src/main/favourites-store.ts:106 | `#persist` renames the new file before `chmod`; a later chmod rejection throws after new bytes have committed. | A failed write can report failure after changing bytes, violating the prior-bytes promise. | Enforce mode before rename or make post-rename chmod non-fatal so permission hardening cannot fail an already committed mutation. | high |
| D-cycle-16-2 | cycle-16 | minor | src/main/favourites-store.test.ts:268 | Failed-write coverage injects rename failure only, not chmod failure after successful rename. | The full failed-writes-preserve-bytes contract is not constrained. | Force chmod rejection after rename and assert the selected rollback or non-fatal-commit contract. | high |
| D-cycle-17-1 | cycle-17 | minor | src/renderer/src/components/ContinueWatchingShelf.tsx:59 | Retry's changing ref callback treats detachment during another shelf's fallback change as removal; a still-focused connected Retry gets `data-controller-focused` moved to `home-sign-in`. | Unrelated listing completion corrupts gamepad focus marking while the focused control survives. | Stabilize the callback, read fallback from a ref, and test both completion orders with Retry focused. | high |
| D-cycle-17-2 | cycle-17 | minor | src/renderer/src/components/StreamShelf.test.tsx:36 | The default-edge oracle compares composed output with another render of the same StreamShelf implementation. | Shared regressions in omitted-prop defaults pass, so unchanged-navigation preservation is only partially constrained. | Add independently specified edges or a controller traversal through an omitted-prop caller. | high |
| D-cycle-18-2 | cycle-18 | minor | src/renderer/src/components/SearchView.test.tsx:379 | Parameterized submission verifies an `onSearch` mock while Surface remains `busy=false` with fixed results. | It cannot constrain pending-state focus on submit buttons or Chromium disabled-control behavior. | Exercise actual pending searches from both submit controls and assert browser focus before resolve plus rendered results after. | high |
| D-cycle-18-3 | cycle-18 | minor | src/renderer/src/focus-navigation.ts:220 | A face press is considered new until dispatched; A/B can mask held X/Y through a context change, then releasing A/B dispatches that face in the new context. | Held presses can act across context changes, reopening Search after Escape. | Track physical edges while masked and consume/invalidate them before a context change can reinterpret them. | high |
| D-cycle-19-2 | cycle-19 | minor | src/renderer/src/components/SettingsPanel.tsx:186 | Client ID editing only uses native input `onChange`; Settings has no character, deletion, or clear controls. | The reachable editor cannot be changed using only arrows, Enter, and Escape. | Add a controller-operable alphanumeric editor with delete/clear actions following the Search keyboard pattern. | high |
| D-cycle-19-3 | cycle-19 | minor | src/renderer/src/components/SettingsPanel.test.tsx:318 | Client-ID persistence/auth-reset coverage ends at mocked `onSettingsChange(next, changed)` and never focuses Save or observes account UI. | Argument forwarding does not constrain persistence, parent reset, or focused-Save behavior. | Add mounted-App save cases with controlled bridge promises and store-level persistence read-back coverage. | high |
| D-cycle-19-4 | cycle-19 | minor | src/renderer/src/components/SettingsPanel.tsx:205 | Local account-request error is independent of current authentication state and clears only on another request. | After external approval or expiry, stale instructions remain beside Signed in/Sign out. | Associate errors with their producing account state/flow and stop rendering them once superseded. | high |
| D-cycle-20-1 | cycle-20 | minor | src/main/index.test.ts:230 | Repeated-launch coverage checks mocked factories and call counts, not Electron's real profile lock or a competing process/window. | It does not constrain single-owner behavior, profile protection, player continuity, or persistence across relaunch/systemd restart. | Add real Electron temp-userData competing-process coverage and retain hardware/systemd continuity QA. | high |
| D-cycle-20-2 | cycle-20 | minor | src/main/index.ts:153 | Startup failure awaits `staticServer?.close()` before `app.exit(1)` and does not handle close rejection. | Cleanup rejection can leave the failed process running with an unhandled rejection instead of exiting. | Catch cleanup failure and call `app.exit(1)` from `finally`. | high |
| D-cycle-20-3 | cycle-20 | minor | src/main/index.ts:162 | Normal shutdown starts `staticServer?.close()` with `void` and no rejection handler. | Close failures become detached unhandled rejections and make shutdown cleanup failure invisible. | Attach error-reporting rejection handling or centralize awaited shutdown cleanup; test rejection. | high |
| D-cycle-21-2 | cycle-21 | minor | src/renderer/src/components/PlayerView.test.tsx:1560 | Native-pad results are asserted as fake-WebContents-debugger `pressChatInput` calls, not by a receiving child document. | Tests stay green if Electron CDP fails to deliver Tab/Enter to a real focused child frame. | Add Electron child-frame integration coverage observing Tab traversal and Enter activation. | high |
| D-cycle-22-2 | cycle-22 | minor | src/renderer/src/App.search-shortcuts.test.tsx:250 | Overlap cases inspect `catalog.search.mock.calls`, deletion, and focus but not whether the returned channel renders or is reachable. | Correct dispatch can pass while the user-visible result is lost. | Resolve controlled responses and assert the channel control exists and is reached through real directional navigation. | high |
| D-cycle-22-3 | cycle-22 | minor | src/renderer/src/components/SettingsPanel.test.tsx:283 | Obsolete-save coverage flips a mocked currentness predicate and checks a mocked callback was not called; it never installs newer state or remounts App. | Broken App generation ownership or persisted/displayed Client-ID mismatch can pass. | Complete save through mounted App after a real newer auth/settings transition and assert surviving account and Client ID. | high |
| D-manual-qa-2 | manual-qa | minor | src/renderer/src/components/StreamShelf.tsx:178 | Every stream card renders an unconditional "Live" badge. In guest mode Home's Quick watch shelf is built from the four static entries in src/renderer/src/demo-data.ts (PREVIEW_STREAMS, viewerCount 0, no liveness data), so all four are labelled "Live" without any check. Opening the first card ("Twitch official channel") on the running app produced the player's own banner "This Twitch source is offline. You can wait or go Back to choose another broadcast." | The shelf asserts liveness the app has not verified, so a guest viewer is told an offline channel is live and only learns otherwise after opening the player. | Render the Live badge only for cards backed by a live Helix stream (or mark the static guest entries as unverified previews rather than Live). | medium |
| D-manual-qa-3 | manual-qa | major | src/renderer/src/useContinueWatching.ts:43 | Rejections from the main process are rendered verbatim into viewer-facing alerts in at least three places. Observed on the running app: "Error invoking remote method 'playback-progress:list': Error: EACCES: permission denied, open '/tmp/vs-qa-profile2/playback-progress.json'" on Home, "Error invoking remote method 'favourites:list': SyntaxError: Expected property name or '}' in JSON at position 1" in Search, and "Error invoking remote method 'chat-input:begin': Error: Chat input requires a focused window" in the player. | The viewer is shown internal IPC channel names, Node error codes and a full local filesystem path instead of the human-readable fallbacks these same modules already define. The path disclosure also lands in screenshots and bug reports of a public project. | Map main-process rejections to the existing viewer-facing strings and keep `error.message` for the console. Same pattern at `src/renderer/src/useFavourites.ts:29`, `src/renderer/src/components/usePlayerChat.tsx:145`, `src/renderer/src/useFollowedChannels.ts:75` and `src/renderer/src/useAppController.ts:23`. | high |
| D-manual-qa-5 | manual-qa | minor | src/renderer/src/screens.css:1 | In the stacked (narrow) chat layout the chat pane is taller than the space left under the player and the page does not scroll. Measured on the running app at a 960x720 viewport: player 945x300 at top 192, chat pane top 492 / bottom 942, document scrollHeight 720, scrollY stays 0. Focusing Enter chat or Reload chat and pressing ArrowDown never moves the pane into view. | The bottom 222 px of live chat is unreadable and unreachable with arrows, Enter and Escape, which the product promises as the only input. The side-by-side layout at 1280x720 and wider is unaffected. | Give the stacked layout a height budget that fits the viewport (or make the player screen scrollable and scroll the focused pane into view), so the chat pane's bottom edge stays within the window at the sizes where panes stack. | high |
| D-manual-qa-6 | manual-qa | major | src/renderer/src/components/PlayerView.tsx:269 | On a real past broadcast that does not start playing, the shell's playback state stays "playing" while the media is paused, and the transport button becomes inert. Measured on video 2877678922: the embedded video reported paused=true with currentTime frozen at 619.86 s across a 4 s sample, the toolbar button's aria-label read "Pause" (the label the component renders while it believes playback is running), the elapsed readout stayed at 0:10:19, and three consecutive activations of that button left the label unchanged. | The only controller-reachable way to start playback calls pause() because the shell thinks it is already playing, so a viewer whose recording did not autoplay cannot start it with arrows and Enter - the product's only input. The label also tells them the opposite of what the button will do. | Derive the button from the player's own reported state (re-read `player.isPaused()` when the toggle is activated and on a timer while a source is mounted), and make the toggle call play() whenever the player reports paused, whatever the local state says. | high |
| D-xc-performance-1 | xc-performance | minor | src/renderer/src/focus-navigation.ts:211 | The controller bridge polls through another `requestAnimationFrame` and `navigator.getGamepads().find(...)` for the entire mounted App, even with no pad or input. | Display-rate polling competes with embedded decoding on modest hardware and continues after player exit. | Pause while hidden or no controller is active; restart on connection/visibility with an event-driven wake-up path. | high |
| D-xc-performance-2 | xc-performance | minor | src/renderer/src/focus-navigation.ts:302 | Each Arrow key queries every focusable element, reads visibility and rectangles, then filters, maps, and sorts the candidate set. | Synchronous layout reads and sorting grow with retained controls and can add controller-navigation latency. | Prefer explicit graph moves or cache candidates/rectangles until DOM or resize changes. | high |
| D-xc-performance-3 | xc-performance | minor | src/renderer/src/components/PlayerView.tsx:178 | Every ready VOD starts one-second timeline sampling; PAUSE samples once but never clears the interval. | Paused or autoplay-blocked VODs retain recurring player API work until exit. | Start sampling on PLAY/PLAYING and clear it on PAUSE/OFFLINE/unmount while keeping immediate samples. | high |
| D-xc-performance-4 | xc-performance | minor | src/renderer/src/components/StreamShelf.tsx:26 | `formatViewers` constructs a new `Intl.NumberFormat` for every non-zero card on every StreamShelf render. | Repeated formatter construction adds avoidable main-renderer work for unchanged viewer counts. | Hoist one compact formatter or memoize labels by viewer count. | high |
| D-xc-performance-5 | xc-performance | minor | src/renderer/src/useFollowedChannels.ts:61 | Each more page rebuilds a Map and complete array from all existing and new items, retaining and rendering all prior pages with no window or virtualization. | Long pagination grows renderer memory, DOM/image work, and per-key focus work without a local bound. | Add a retained-page/window limit or virtualize and cap in-memory items while preserving cursor behavior. | high |
| D-xc-performance-6 | xc-performance | minor | src/main/playback-progress-store.ts:77 | Each progress save rereads whole JSON, rebuilds/sorts bookmarks, serializes up to 100, and performs flushed temp write/rename/chmod; seek/pause bursts queue each operation. | Explicit burst saves bypass the normal throttle and amplify serialized IPC and filesystem work. | Coalesce pending checkpoints per video, debounce ordinary samples, and flush one latest checkpoint on leave/pause. | high |
| D-xc-security-2 | xc-security | minor | src/main/https-server.ts:66 | The parser catches `URIError` but lets `new URL` TypeError escape; malformed TLS target `//[` reproduces uncaught `ERR_INVALID_URL`. | An unauthenticated local peer can trigger Electron error dialogs repeatedly. | Treat URL-construction failures as 400 and test a malformed request followed by a healthy request. | high |

## Real-surface QA confirmations

These rows were re-checked by the orchestrator against the running app (Electron build of
`a2fe642`, guest mode, CDP-synthesized controller input). Artifacts are under `.omo/review/qa/`.

| id | what the real surface showed | artifact |
| --- | --- | --- |
| D-manual-qa-1 | WITHDRAWN - see "Withdrawn findings". | `F-04-toolbar-focus-graph.log` |
| D-manual-qa-2 | CONFIRMED. All four guest Quick watch cards showed the "Live" badge; three of them (twitch, riotgames, lck) opened to the player's own "This Twitch source is offline" banner, one (eslcs) was genuinely live. | `12-player-playing.png`, `F-01-home-to-player.log` |
| D-manual-qa-3 | CONFIRMED in three separate surfaces on the running app: the chat-entry alert, the Continue Watching read-error alert (which printed the profile's absolute path) and the Search favourites read-error alert. | `88-enter-chat-error.png`, `170-continue-read-error-retry.png`, `171-favourites-error-retry.png` |
| D-manual-qa-5 | FOUND during the re-run of F-cycle-07-6 at a measured 960x720 viewport: the chat pane's bottom sits 222 px below the fold and no arrow route scrolls it into view. | `162-narrow-chat-before-scroll.png`, `163-narrow-chat-after-scroll.png` |
| D-manual-qa-6 | FOUND while re-running F-cycle-05-5 on a real past broadcast: iframe media samples (paused=true, currentTime frozen at 619.86 s) against a toolbar that says "Pause" and three no-op activations. | `F-05-5-media-state.log`, `184-vod-quality-paused.png` |
| D-manual-qa-4 | WITHDRAWN - see "Withdrawn findings". | `F-06-escape-in-chooser.log` |
| D-cycle-19-1 | NOT REPRODUCED in the one scenario reachable here: activating Save with the unchanged built-in Client ID kept focus on `settings-save` through completion (never BODY). The lane's reasoning concerns the disabled-while-busy window, which this save path did not enter; the row stays open for a save that actually goes busy. | `70-after-save.png` |
| D-cycle-05-1 and the chooser rows | The quality chooser opened with real Twitch renditions on a live source (auto, 1080p60 source, 720p60, 480p, 360p, 160p, Close) and with a "Twitch has not supplied quality options for this source." notice plus a reachable Close on an offline source. | `31-quality-chooser.png`, `110-offline-quality-chooser.png` |


## Withdrawn findings

Two observations from the hands-on QA pass were filed as defects and then withdrawn after the
gate review checked them against the code and the user guide. They are kept here so the
observation survives without asserting a defect.

| id | observation | why it is not a defect | evidence |
| --- | --- | --- | --- |
| D-manual-qa-1 (withdrawn) | While the embedded frame state is not `ready`, arrow navigation goes Back -> Quality and never focuses Play/Pause or Mute (measured on the offline `twitch` source). | Both controls carry `disabled={frameState !== "ready"}` (`src/renderer/src/components/PlayerView.tsx:360,371`) and the navigation engine excludes disabled controls, so skipping them is the intended behaviour, not a broken edge. The improvement ledger already records disabled-while-offline, enabled-on-ONLINE as the contract. Changing Back's edge would not make a disabled button usable. | `.omo/review/qa/F-04-toolbar-focus-graph.log`, `110-offline-quality-chooser.png` |
| D-manual-qa-4 (withdrawn) | One Escape with the quality or captions chooser open closes the chooser and returns to Home, ending playback. | The user guide states this for both choosers: "Close returns focus to Quality; Escape still returns Home" and "Close returns focus to Captions; Escape returns Home" (`docs/users/getting-started.md:157,166`). The queued cycle-05 and cycle-12 flows expect the same transition, so the measured behaviour matches the documented contract. A first-Escape-dismisses-the-chooser policy would be a UX change request, not a defect. | `.omo/review/qa/F-06-escape-in-chooser.log`, `F-07-escape-in-captions.log` |

## Duplicates and cross-lane themes

### Merged duplicate accounting

- **D-cycle-21-1** is merged into the retained cycle-08 chat-entry row: both report the first ordinary chat-iframe `load` ending interaction after the viewer enters before initial load, returning focus to Hide chat and preventing consent interaction.

### Recurring themes

The IDs in this index are references to rows above, not additional defect accounting rows.

- **Mock-call or isolated-test assertions instead of user-visible outcomes:** D-cycle-01-3, D-cycle-05-1, D-cycle-09-1, D-cycle-09-2, D-cycle-10-2, D-cycle-12-1, D-cycle-13-1, D-cycle-13-2, D-cycle-14-1, D-cycle-16-2, D-cycle-17-2, D-cycle-18-2, D-cycle-19-3, D-cycle-20-1, D-cycle-21-2, D-cycle-22-2, D-cycle-22-3.
- **Focus continuity, focus markers, or unreachable controller actions:** D-cycle-01-1, D-cycle-10-1, D-cycle-15-2, D-cycle-15-3, D-cycle-17-1, D-cycle-18-1, D-cycle-19-1, D-manual-qa-1.
- **Asynchronous lifecycle or stale-result handling:** D-cycle-01-2, D-cycle-08-1, D-cycle-15-1, D-cycle-19-4, D-cycle-22-1, D-cycle-21-1.
- **Chat consent/entry paths:** D-cycle-07-1, D-cycle-08-1, D-cycle-21-1.
- **Unbounded or unnecessary recurring work:** D-xc-performance-1, D-xc-performance-2, D-xc-performance-3, D-xc-performance-4, D-xc-performance-5, D-xc-performance-6.
- **Atomic persistence contract and its missing edge coverage:** D-cycle-16-1, D-cycle-16-2.
- **Undisclosed privileged behavior or sensitive error handling:** D-xc-docs-1, D-xc-security-1.

## Not defects

- Cycle 01's steady-state seek graph is sound; a missing jump `Down` override alone does not make an action unreachable.
- Cycle 05 established no production quality-selection defect; its finding is a verification limitation, not evidence that production rendition selection fails.
- Cycle 08's later native-gamepad forwarding/debugger attachment supersedes its original no-debugger scope and is not a Cycle 08 defect.
- Cycle 09's later per-card failed-thumbnail fallback is not a current cycle-09 defect.
- Cycle 12 established no concrete production defect in caption commands, reset lifecycle, or directional links; its finding is missing visible-caption evidence.
- Cycle 13 established no runtime correctness defect; both findings are verification gaps.
- Cycle 14 established no production retry-path correctness defect; its finding is missing regression coverage of completion and repeat failure.
- Cycle 07's secondary actions on ArrowDown are an established navigation convention, not a defect.
