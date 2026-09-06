#!/bin/sh
set -eu

exec zypak-wrapper /app/vacuumstream/vacuumstream --class=io.github.eliottness.VacuumStream "$@"
