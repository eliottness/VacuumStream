# End-to-end tests

[Contribution guidelines](../../CONTRIBUTING.md) · [Development](development.md) · [Architecture](architecture.md)

The unit suite (`bun run test`) exercises modules in isolation. The end-to-end suite drives the
real desktop app: Playwright launches the built Electron binary, sends real key events, and reads
the live DOM. Every test corresponds to one row of the cycles 1-22 review ledgers, and the ledger
decides whether that test is expected to pass or expected to fail.

## Running

```sh
bun run build          # the suite launches out/main/index.js through package.json "main"
bun run test:e2e       # all rows that can run on this machine
bun run test:e2e:coverage  # every ledger row has a test, and every test has a ledger row
```

A desktop session is required (`DISPLAY` must point at an X server; WSLg's `:0` works). On a
headless machine, wrap the command: `xvfb-run -a bun run test:e2e`.

Environment gates:

| variable | effect |
| --- | --- |
| `E2E_TWITCH_AUTH=1` | run the rows the ledger classes NEEDS-AUTH (a signed-in account must already be stored in the profile the test seeds) |
| `E2E_GAMEPAD=1` | run the rows the ledger classes NEEDS-HARDWARE (a physical gamepad or the HTPC) |
| `E2E_RUN_BLOCKED=1` | run the LOCAL-GUEST rows the ledger marks BLOCKED by an environment limit |
| `E2E_WORKERS=n` | change the worker count (default 2; each worker owns one Electron process) |

Skipped rows always print their gate, so a skip is visible rather than silent.

## Writing a test

```ts
import { expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"

test.describe("cycle-11 continue watching", () => {
  test.use({ seed: { bookmarks: [{ duration: 3600, position: 120, updatedAt: 1, videoId: "1" }] } })

  flowTest("F-cycle-11-2", async ({ controller, window }) => {
    await controller.press("ArrowRight")
    await controller.press("Enter")
    await controller.shot("F-cycle-11-2-resume-prompt")
    expect(await window.locator("#twitch-player-root iframe").count()).toBe(0)
  })
})
```

`flowTest(id, body)` and `defectTest(id, body)` read the row out of the ledger markdown, use its
title, annotate the test with the recorded verdict and the expected colour, and apply the gates
above. The body only performs the journey and asserts the row's observable.

Fixtures (`test/e2e/support/fixtures.ts`):

- `test.use({ seed })` writes `favourites.json`, `playback-progress.json`, `settings.json`, or any
  `rawFiles` entry into a throwaway profile before the app starts. Malformed content is how the
  error paths are reached.
- `test.use({ windowSize })` resizes the real `BrowserWindow` with `setContentSize`, so layout
  assertions describe a window the user could actually have. The default is 1920x1080.
- `controller` is the only input surface: `press`, `trace` (a focus id after every key),
  `travelTo`, `waitForFocus`, `focusId`, and `shot` (a screenshot attached to the report).
  There is no pointer helper on purpose - this product is controller-only.
- The app, the window, and the profile are torn down after every test.

## The colour contract

The ledgers are the source of truth, so a test's expected colour is derived, never hand-written:

| ledger state | test |
| --- | --- |
| flow row PASS | plain test, must stay green |
| flow row PARTIAL or FAIL | `test.fail()` - it asserts the row's FULL observable, which the app does not meet yet |
| flow row BLOCKED | skipped behind `E2E_RUN_BLOCKED`, printing the environment limit |
| NEEDS-AUTH / NEEDS-HARDWARE | skipped behind its gate |
| open defect row | `test.fail()` - it asserts the fixed behaviour |

An expected-red test that starts passing FAILS the run with "Expected to fail, but passed". That
is the point: the day a defect is fixed, its test turns the suite red until the ledger row and the
`test.fail()` come off together. Never silence a red test - either fix the row it names or record
why the observable changed.
