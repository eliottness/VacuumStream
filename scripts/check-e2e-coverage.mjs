#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

const ledgerIds = (path, pattern) => [
  ...new Set(
    readFileSync(join(root, path), "utf8")
      .split("\n")
      .filter((line) => pattern.test(line) && line.split("|").length >= 10)
      .map((line) => line.split("|")[1].trim()),
  ),
]

const flowIds = ledgerIds("docs/contributing/review-cycle-1-22-frontend-flows.md", /^\|\s*F-/)
const defectIds = ledgerIds("docs/contributing/review-cycle-1-22-defects.md", /^\|\s*D-[a-z]/)

const testSources = []
const collect = (directory) => {
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules") continue
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) collect(path)
    else if (/\.(test|spec)\.(ts|tsx|mts)$/.test(entry)) testSources.push(path)
  }
}
collect(join(root, "src"))
collect(join(root, "test"))
const sourceText = testSources.map((path) => readFileSync(path, "utf8")).join("\n")

const listed = JSON.parse(
  execFileSync("node_modules/.bin/playwright", ["test", "--list", "--reporter=json"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, E2E_OUT: "test-results/e2e-list" },
    maxBuffer: 64 * 1024 * 1024,
  }),
)

const declared = new Set()
const walk = (suite) => {
  for (const spec of suite.specs ?? []) declared.add(spec.title.split(" ")[0])
  for (const child of suite.suites ?? []) walk(child)
}
for (const suite of listed.suites ?? []) walk(suite)

const excluded = new Map(
  JSON.parse(readFileSync(join(root, "test/e2e/ledger-exclusions.json"), "utf8")).rows.map(
    (row) => [row.id, row.reason],
  ),
)
const covered = (id) => declared.has(id) || sourceText.includes(id) || excluded.has(id)
const missingFlows = flowIds.filter((id) => !covered(id))
const missingDefects = defectIds.filter((id) => !covered(id))
const unknown = [...declared].filter((id) => !flowIds.includes(id) && !defectIds.includes(id))

console.log(`flow rows: ${flowIds.length}, covered: ${flowIds.length - missingFlows.length}`)
console.log(
  `defect rows: ${defectIds.length}, covered: ${defectIds.length - missingDefects.length}`,
)
console.log(
  `playwright tests declared: ${declared.size}, test sources scanned: ${testSources.length}`,
)
if (missingFlows.length > 0) console.log("flow rows with no test:", missingFlows.join(", "))
if (missingDefects.length > 0) console.log("defect rows with no test:", missingDefects.join(", "))
if (unknown.length > 0) console.log("tests with no ledger row:", unknown.join(", "))

const unaccounted = missingFlows.length + missingDefects.length + unknown.length
if (unaccounted > 0) {
  console.error(`Ledger coverage incomplete: ${unaccounted} rows unaccounted for`)
  process.exit(1)
}
console.log("Ledger coverage complete: every row has a test")
