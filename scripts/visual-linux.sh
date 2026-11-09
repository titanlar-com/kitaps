#!/bin/sh
# Compares the screenshots, or records them with "update", on the Linux image CI uses.
# Screenshots are only comparable on one image. On this Mac the container runtime is Colima.
set -eu
IMAGE=mcr.microsoft.com/playwright:v1.63.0-noble
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
[ -S "$HOME/.colima/default/docker.sock" ] && export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
SCRIPT=test:visual
[ "${1:-}" = update ] && SCRIPT=test:visual:update
mkdir -p "$ROOT/tests/visual/baselines" "$ROOT/test-results/visual-linux"
docker run --rm --cpus=2 -e CI=1 \
  -v "$ROOT":/host:ro \
  -v "$ROOT/tests/visual/baselines":/baselines \
  -v "$ROOT/test-results/visual-linux":/report \
  "$IMAGE" sh -c "
    set -e
    mkdir /work && cd /host
    tar --exclude=./node_modules --exclude=./dist --exclude=./dist-visual --exclude=./test-results --exclude=./.git --exclude=./tests/visual/baselines -cf - . | tar -xf - -C /work
    cd /work && npm ci --no-audit --no-fund >/dev/null 2>&1
    mkdir -p tests/visual && ln -s /baselines tests/visual/baselines
    status=0
    npm run $SCRIPT || status=\$?
    cp -R test-results/visual/. /report/ 2>/dev/null || true
    exit \$status
  "
