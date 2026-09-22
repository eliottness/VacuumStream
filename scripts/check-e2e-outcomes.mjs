#!/usr/bin/env node
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const reportPath = process.argv[2] ?? "test-results/e2e/report.json"

const ledgerRows = readFileSync(
  join(root, "docs/contributing/review-cycle-1-22-frontend-flows.md"),
  "utf8",
)
  .split("\n")
  .filter((line) => /^\|\s*F-/.test(line) && line.split("|").length >= 10)
  .map((line) => line.split("|").map((cell) => cell.trim()))
  .map(([, id, , , , , scope, verdict]) => ({ id, scope, verdict: verdict.split(" ")[0] }))

const expectation = ({ scope, verdict }) => {
  if (scope !== "LOCAL-GUEST") return "skipped"
  if (verdict === "PASS") return "passed"
  if (verdict === "PARTIAL" || verdict === "FAIL") return "expected-failure"
  return "skipped"
}

const report = JSON.parse(readFileSync(join(root, reportPath), "utf8"))
const results = new Map()
const walk = (suite) => {
  for (const spec of suite.specs ?? []) {
    const id = spec.title.split(" ")[0]
    const test = spec.tests[0]
    const status = test?.results?.[0]?.status ?? "missing"
    const observed =
      status === "skipped"
        ? "skipped"
        : test.expectedStatus === "failed" && status === "failed"
          ? "expected-failure"
          : status
    results.set(id, { observed, ok: spec.ok })
  }
  for (const child of suite.suites ?? []) walk(child)
}
for (const suite of report.suites ?? []) walk(suite)

const mismatches = []
const missing = []
for (const row of ledgerRows) {
  const result = results.get(row.id)
  if (result === undefined) {
    missing.push(row.id)
    continue
  }
  const want = expectation(row)
  if (result.observed !== want) {
    mismatches.push(
      `${row.id}: ledger ${row.scope}/${row.verdict} expects ${want}, run reported ${result.observed}`,
    )
  }
}

console.log(`ledger rows: ${ledgerRows.length}, in this run: ${results.size}`)
for (const line of mismatches) console.log("MISMATCH", line)
if (missing.length > 0) console.log("not run:", missing.join(", "))
if (mismatches.length > 0) {
  console.error(`${mismatches.length} rows do not match their ledger colour`)
  process.exit(1)
}
console.log("every executed row matches its ledger colour")
