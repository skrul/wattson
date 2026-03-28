#!/usr/bin/env bash
#
# Check if state machine diagram PNGs are up-to-date with their config files.
# Compares the last commit date of each config file against its PNG.
# Prints stale diagrams that need regeneration.
#
# Usage: ./scripts/check-machine-diagrams.sh

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

machines=(
  "src/machines/authMachine.config.ts:docs/machines/auth-machine.png"
  "src/machines/syncMachine.config.ts:docs/machines/sync-machine.png"
  "src/machines/enrichmentMachine.config.ts:docs/machines/enrichment-machine.png"
)

stale=0

for pair in "${machines[@]}"; do
  config="${pair%%:*}"
  png="${pair##*:}"
  name=$(basename "$config" .config.ts)

  if [ ! -f "$png" ]; then
    echo "MISSING  $png  (export from Stately editor using $config)"
    stale=1
    continue
  fi

  config_ts=$(git log -1 --format=%ct -- "$config" 2>/dev/null)
  png_ts=$(git log -1 --format=%ct -- "$png" 2>/dev/null)

  if [ -z "$png_ts" ]; then
    echo "STALE    $png  (not yet committed)"
    stale=1
    continue
  fi

  if [ -z "$config_ts" ] || [ "$config_ts" -gt "$png_ts" ]; then
    echo "STALE    $png  (config updated $(git log -1 --format=%cr -- "$config"))"
    stale=1
  else
    echo "OK       $png"
  fi
done

exit $stale
