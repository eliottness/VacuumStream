#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${1:-}" == "--help" && "$#" == 1 ]]; then
  printf 'Usage: bash scripts/build-release.sh\nBuild Linux x86_64 AppImage, Flatpak, and SHA256SUMS in dist/release.\n'
  exit 0
fi
if [[ "$#" != 0 ]]; then
  printf 'Usage: bash scripts/build-release.sh\n' >&2
  exit 2
fi

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd -- "${ROOT_DIR}"

for command_name in bun flatpak flatpak-builder sha256sum; do
  command -v "${command_name}" >/dev/null || {
    printf 'Missing required command: %s\n' "${command_name}" >&2
    exit 1
  }
done

VERSION="$(bun -p 'require("./package.json").version')"
if [[ -n "${RELEASE_TAG:-}" && "${RELEASE_TAG}" != "v${VERSION}" ]]; then
  printf 'Release tag must match package.json: expected v%s, got %s\n' "${VERSION}" "${RELEASE_TAG}" >&2
  exit 1
fi

bun run package:appimage
bash scripts/build-flatpak.sh --skip-pack
mkdir -p dist/release
APPIMAGE="VacuumStream-${VERSION}-x86_64.AppImage"
FLATPAK="VacuumStream-${VERSION}-x86_64.flatpak"
cp -- "dist/${APPIMAGE}" "dist/${FLATPAK}" dist/release/
(
  cd dist/release
  sha256sum "${APPIMAGE}" "${FLATPAK}" > SHA256SUMS
  sha256sum --check SHA256SUMS
)
printf 'Release assets ready in %s/dist/release\n' "${ROOT_DIR}"
