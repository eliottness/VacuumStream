import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")

const FLOW_LEDGER = join(REPOSITORY_ROOT, "docs/contributing/review-cycle-1-22-frontend-flows.md")
const DEFECT_LEDGER = join(REPOSITORY_ROOT, "docs/contributing/review-cycle-1-22-defects.md")

export type FlowScope = "LOCAL-GUEST" | "NEEDS-AUTH" | "NEEDS-HARDWARE"
export type FlowVerdict = "PASS" | "PARTIAL" | "FAIL" | "BLOCKED" | "OUT-OF-SCOPE"
export type ExpectedColour = "green" | "red" | "skipped"

export type FlowRow = {
  readonly expected: ExpectedColour
  readonly id: string
  readonly lane: string
  readonly observable: string
  readonly observed: string
  readonly scope: FlowScope
  readonly steps: string
  readonly title: string
  readonly verdict: FlowVerdict
}

export type DefectRow = {
  readonly confidence: string
  readonly id: string
  readonly lane: string
  readonly location: string
  readonly observed: string
  readonly reason: string
  readonly severity: "blocker" | "major" | "minor" | "nit"
  readonly suggestedFix: string
}

const cells = (line: string): readonly string[] =>
  line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim())

const readRows = (path: string, idPattern: RegExp): readonly (readonly string[])[] =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => idPattern.test(line))
    .map(cells)

const asScope = (value: string): FlowScope => {
  if (value === "LOCAL-GUEST" || value === "NEEDS-AUTH" || value === "NEEDS-HARDWARE") return value
  throw new Error(`Unknown flow scope in the ledger: ${value}`)
}

const asVerdict = (value: string): FlowVerdict => {
  const head = value.split(" ")[0] ?? ""
  if (head === "PASS" || head === "PARTIAL" || head === "FAIL" || head === "BLOCKED") return head
  if (value.startsWith("out of scope")) return "OUT-OF-SCOPE"
  throw new Error(`Unknown flow verdict in the ledger: ${value}`)
}

const asSeverity = (value: string): DefectRow["severity"] => {
  if (value === "blocker" || value === "major" || value === "minor" || value === "nit") return value
  throw new Error(`Unknown defect severity in the ledger: ${value}`)
}

// A row whose recorded verdict is PASS must stay green; every verdict that fell short of its own
// observable is a known product defect, so its test asserts the full observable and is expected red.
const colourFor = (scope: FlowScope, verdict: FlowVerdict): ExpectedColour => {
  if (scope !== "LOCAL-GUEST") return "skipped"
  if (verdict === "PASS") return "green"
  if (verdict === "PARTIAL" || verdict === "FAIL") return "red"
  return "skipped"
}

export const flowRows: readonly FlowRow[] = readRows(FLOW_LEDGER, /^\|\s*F-/).map((row) => {
  const [id, lane, title, steps, observable, scope, verdict, , observed] = row
  if (
    id === undefined ||
    lane === undefined ||
    title === undefined ||
    steps === undefined ||
    observable === undefined ||
    scope === undefined ||
    verdict === undefined ||
    observed === undefined
  ) {
    throw new Error(`Malformed flow ledger row: ${row.join(" | ")}`)
  }
  const parsedScope = asScope(scope)
  const parsedVerdict = asVerdict(verdict)
  return {
    expected: colourFor(parsedScope, parsedVerdict),
    id,
    lane,
    observable,
    observed,
    scope: parsedScope,
    steps,
    title,
    verdict: parsedVerdict,
  }
})

export const defectRows: readonly DefectRow[] = readRows(DEFECT_LEDGER, /^\|\s*D-[a-z]/)
  .filter((row) => row.length >= 8)
  .map((row) => {
    const [id, lane, severity, location, observed, reason, suggestedFix, confidence] = row
    if (
      id === undefined ||
      lane === undefined ||
      severity === undefined ||
      location === undefined ||
      observed === undefined ||
      reason === undefined ||
      suggestedFix === undefined ||
      confidence === undefined
    ) {
      throw new Error(`Malformed defect ledger row: ${row.join(" | ")}`)
    }
    return {
      confidence,
      id,
      lane,
      location,
      observed,
      reason,
      severity: asSeverity(severity),
      suggestedFix,
    }
  })

export const flowRow = (id: string): FlowRow => {
  const row = flowRows.find((candidate) => candidate.id === id)
  if (row === undefined) throw new Error(`No flow ledger row with id ${id}`)
  return row
}

export const defectRow = (id: string): DefectRow => {
  const row = defectRows.find((candidate) => candidate.id === id)
  if (row === undefined) throw new Error(`No defect ledger row with id ${id}`)
  return row
}
