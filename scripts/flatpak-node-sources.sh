#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
NODE_SDK_EXTENSION="node24"

if [[ "$#" -gt 0 ]]; then
  printf 'Usage: bash scripts/flatpak-node-sources.sh\nRegenerate flatpak/package-lock.json and flatpak/generated-sources.json for offline Flathub builds.\n'
  [[ "${1}" == "--help" ]] && exit 0
  exit 2
fi

for command_name in npm flatpak-node-generator; do
  command -v "${command_name}" >/dev/null || {
    printf 'Missing required command: %s\n' "${command_name}" >&2
    printf 'flatpak-node-generator lives in https://github.com/flatpak/flatpak-builder-tools (node).\n' >&2
    exit 1
  }
done

WORK_DIR="$(mktemp -d)"
trap 'rm -rf -- "${WORK_DIR}"' EXIT

# The end-to-end test runner downloads three browsers that an offline build never uses, so the
# lockfile and the Flatpak sources are generated from package.json without it.
node -e '
  const fs = require("fs")
  const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
  delete pkg.devDependencies["@playwright/test"]
  fs.writeFileSync(process.argv[2], JSON.stringify(pkg, null, 2) + "\n")
' "${ROOT_DIR}/package.json" "${WORK_DIR}/package.json"

cd -- "${WORK_DIR}"
# electron-vite 5 declares a peer range that predates vite 8, which Bun installs regardless.
npm install --package-lock-only --ignore-scripts --legacy-peer-deps
flatpak-node-generator \
  --electron-node-headers \
  --node-sdk-extension "${NODE_SDK_EXTENSION}" \
  npm package-lock.json \
  -o generated-sources.json

install -Dm644 package-lock.json "${ROOT_DIR}/flatpak/package-lock.json"
install -Dm644 generated-sources.json "${ROOT_DIR}/flatpak/generated-sources.json"
printf 'Wrote flatpak/package-lock.json and flatpak/generated-sources.json\n'
