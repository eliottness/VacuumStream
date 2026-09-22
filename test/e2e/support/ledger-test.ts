import type { TestInfo } from "@playwright/test"
import { type E2EFixtures, test } from "./fixtures"
import { type DefectRow, defectRow, type FlowRow, flowRow, isDefectFixed } from "./ledger"

const { E2E_GAMEPAD, E2E_RUN_BLOCKED, E2E_TWITCH_AUTH } = process.env

export type LedgerTestArgs = Pick<E2EFixtures, "app" | "controller" | "profileDirectory" | "window">

type LedgerTestBody = (args: LedgerTestArgs, testInfo: TestInfo) => Promise<void> | void

const gateFor = (row: FlowRow): { readonly enabled: boolean; readonly reason: string } => {
  if (row.scope === "NEEDS-AUTH") {
    return {
      enabled: E2E_TWITCH_AUTH === "1",
      reason: `${row.id} needs a signed-in Twitch account; set E2E_TWITCH_AUTH=1 to run it`,
    }
  }
  if (row.scope === "NEEDS-HARDWARE") {
    return {
      enabled: E2E_GAMEPAD === "1",
      reason: `${row.id} needs a physical gamepad or the HTPC; set E2E_GAMEPAD=1 to run it`,
    }
  }
  if (row.verdict === "BLOCKED") {
    return {
      enabled: E2E_RUN_BLOCKED === "1",
      reason: `${row.id} is blocked by an environment limit: ${row.observed.slice(0, 160)}`,
    }
  }
  return { enabled: true, reason: "" }
}

export const flowTest = (id: string, body: LedgerTestBody): void => {
  const row = flowRow(id)
  const gate = gateFor(row)
  // A gated row is declared with test.skip so its reason is reported without launching the app.
  const declare = gate.enabled ? test : test.skip
  declare(`${id} ${row.title}`, async ({ app, controller, profileDirectory, window }, testInfo) => {
    testInfo.annotations.push(
      { description: row.verdict, type: "ledger-verdict" },
      { description: row.expected, type: "expected-colour" },
      { description: row.observable, type: "observable" },
      { description: gate.reason, type: "gate" },
    )
    if (row.expected === "red") {
      test.fail(
        true,
        `${id} asserts the full ledger observable, which the app does not meet yet (${row.verdict})`,
      )
    }
    await body({ app, controller, profileDirectory, window }, testInfo)
  })
}

export const defectTest = (id: string, body: LedgerTestBody): void => {
  const row = defectRow(id)
  test(`${id} ${row.reason}`, async ({ app, controller, profileDirectory, window }, testInfo) => {
    const fixed = isDefectFixed(id)
    testInfo.annotations.push(
      { description: row.severity, type: "defect-severity" },
      { description: row.location, type: "defect-location" },
      { description: fixed ? "green" : "red", type: "expected-colour" },
    )
    test.fail(!fixed, `${id} asserts the fixed behaviour of an open defect (${row.location})`)
    await body({ app, controller, profileDirectory, window }, testInfo)
  })
}

export type { DefectRow, FlowRow }
