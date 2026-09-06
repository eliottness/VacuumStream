#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
BUILD_DIR="${ROOT_DIR}/.flatpak-build"
REPOSITORY_DIR="${ROOT_DIR}/.flatpak-repository"
MANIFEST="${ROOT_DIR}/flatpak/io.github.eliottness.VacuumStream.yml"

if [[ "${1:-}" == "--help" && "$#" == 1 ]]; then
  printf 'Usage: bash scripts/build-flatpak.sh [--skip-pack]\nBuild an x86_64 Flatpak; --skip-pack reuses dist/linux-unpacked.\n'
  exit 0
fi
if [[ "$#" -gt 1 || ( "$#" == 1 && "$1" != "--skip-pack" ) ]]; then
  printf 'Usage: bash scripts/build-flatpak.sh [--skip-pack]\n' >&2
  exit 2
fi

for command_name in bun flatpak flatpak-builder; do
  command -v "${command_name}" >/dev/null || {
    printf 'Missing required command: %s\n' "${command_name}" >&2
    exit 1
  }
done

cd -- "${ROOT_DIR}"
VERSION="$(bun -p 'require("./package.json").version')"
BUNDLE="${ROOT_DIR}/dist/VacuumStream-${VERSION}-x86_64.flatpak"
if [[ "${1:-}" != "--skip-pack" ]]; then
  bun run pack
fi
if [[ ! -f dist/linux-unpacked/resources/app.asar ]]; then
  printf 'Missing packaged application; run bun run pack first.\n' >&2
  exit 1
fi
flatpak-builder \
  --force-clean \
  --disable-rofiles-fuse \
  --arch=x86_64 \
  --install-deps-from=flathub \
  --repo="${REPOSITORY_DIR}" \
  --user \
  "${BUILD_DIR}" \
  "${MANIFEST}"
flatpak build-bundle --arch=x86_64 \
  --runtime-repo=https://flathub.org/repo/flathub.flatpakrepo \
  "${REPOSITORY_DIR}" "${BUNDLE}" io.github.eliottness.VacuumStream
printf 'Built %s\n' "${BUNDLE}"
