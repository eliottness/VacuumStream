#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
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

const listed = JSON.parse(
  execFileSync("node_modules/.bin/playwright", ["test", "--list", "--reporter=json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }),
)

const declared = new Set()
const walk = (suite) => {
  for (const spec of suite.specs ?? []) {
    const id = spec.title.split(" ")[0]
    declared.add(id)
  }
  for (const child of suite.suites ?? []) walk(child)
}
for (const suite of listed.suites ?? []) walk(suite)

const missingFlows = flowIds.filter((id) => !declared.has(id))
const missingDefects = defectIds.filter((id) => !declared.has(id))
const unknown = [...declared].filter((id) => !flowIds.includes(id) && !defectIds.includes(id))

console.log(`flow rows: ${flowIds.length}, declared: ${flowIds.length - missingFlows.length}`)
console.log(
  `defect rows: ${defectIds.length}, declared: ${defectIds.length - missingDefects.length}`,
)
if (missingFlows.length > 0) console.log("missing flow tests:", missingFlows.join(", "))
if (missingDefects.length > 0) console.log("missing defect tests:", missingDefects.join(", "))
if (unknown.length > 0) console.log("tests with no ledger row:", unknown.join(", "))

const failures = missingFlows.length + missingDefects.length + unknown.length
if (failures > 0) {
  console.error(`E2E coverage incomplete: ${failures} ledger rows unaccounted for`)
  process.exit(1)
}
console.log("E2E coverage complete: every ledger row has a test")
