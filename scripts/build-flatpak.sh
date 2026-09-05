#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
BUILD_DIR="${ROOT_DIR}/.flatpak-build"
REPOSITORY_DIR="${ROOT_DIR}/.flatpak-repository"
MANIFEST="${ROOT_DIR}/flatpak/io.github.vacuumstream.vacuumstream.yml"
BUNDLE="${ROOT_DIR}/dist/VacuumStream-0.1.0.flatpak"

for command_name in bun flatpak flatpak-builder; do
  command -v "${command_name}" >/dev/null || {
    printf 'Missing required command: %s\n' "${command_name}" >&2
    exit 1
  }
done

cd -- "${ROOT_DIR}"
bun install --frozen-lockfile
bun run package:appimage
flatpak-builder \
  --force-clean \
  --install-deps-from=flathub \
  --repo="${REPOSITORY_DIR}" \
  --user \
  "${BUILD_DIR}" \
  "${MANIFEST}"
flatpak build-bundle "${REPOSITORY_DIR}" "${BUNDLE}" io.github.vacuumstream.vacuumstream
printf 'Built %s\n' "${BUNDLE}"
