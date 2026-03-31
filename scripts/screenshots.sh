#!/usr/bin/env bash
# Capture app screenshots using the E2E screenshot test.
# Builds the app with real data, launches it, and prompts you to
# set up each screen before capturing.
#
# Screenshots are saved to screenshots/ in the project root.

set -euo pipefail

cd "$(dirname "$0")/../test-server"
npx wdio run wdio.screenshots.conf.js
