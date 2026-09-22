#!/bin/sh
set -eu

# Chromium's GPU sandbox cannot initialise inside Flatpak's own sandbox, and Steam Big Picture
# launches this app on X11, where that failure is fatal rather than a fallback to software.
exec zypak-wrapper /app/vacuumstream/vacuumstream \
  --class=io.github.eliottness.VacuumStream \
  --disable-gpu-sandbox \
  "$@"
