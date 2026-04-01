#!/usr/bin/env bash
# Build and run the Linux E2E test container.
#
# Usage:
#   ./scripts/e2e-linux.sh build    # Build the Docker image (includes Tauri app build)
#   ./scripts/e2e-linux.sh test     # Run all E2E tests
#   ./scripts/e2e-linux.sh shell    # Drop into an interactive shell for debugging
#   ./scripts/e2e-linux.sh test-one <spec>  # Run a single spec file
#
# Inside the shell you can manually run:
#   Xvfb :99 -screen 0 1280x1024x24 &
#   cd /app/test-server
#   xvfb-run npx wdio run wdio.conf.js
#   # or run a single spec:
#   xvfb-run npx wdio run wdio.conf.js --spec test/specs/sync.e2e.js

set -euo pipefail

IMAGE_NAME="wattson-e2e-linux"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cmd="${1:-help}"

case "$cmd" in
  build)
    echo "Building Docker image (this will take a while the first time)..."
    docker build -f "$PROJECT_DIR/Dockerfile.e2e" -t "$IMAGE_NAME" "$PROJECT_DIR"
    echo "Done! Image: $IMAGE_NAME"
    ;;

  test)
    echo "Running all E2E tests..."
    docker run --rm -it "$IMAGE_NAME" bash -c '
      Xvfb :99 -screen 0 1280x1024x24 &
      sleep 1
      cd /app/test-server
      DISPLAY=:99 npx wdio run wdio.conf.js
    '
    ;;

  test-one)
    spec="${2:?Usage: e2e-linux.sh test-one <spec-file>}"
    echo "Running spec: $spec"
    docker run --rm -it "$IMAGE_NAME" bash -c "
      Xvfb :99 -screen 0 1280x1024x24 &
      sleep 1
      cd /app/test-server
      DISPLAY=:99 npx wdio run wdio.conf.js --spec test/specs/$spec
    "
    ;;

  shell)
    echo "Starting interactive shell..."
    echo "  Xvfb is NOT started — run: Xvfb :99 -screen 0 1280x1024x24 &"
    echo "  Then: cd /app/test-server && DISPLAY=:99 xvfb-run npx wdio run wdio.conf.js"
    docker run --rm -it "$IMAGE_NAME" bash
    ;;

  help|*)
    echo "Usage: $0 {build|test|test-one <spec>|shell}"
    ;;
esac
