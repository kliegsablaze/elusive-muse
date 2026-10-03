#!/usr/bin/env bash
# Builds elusive-muse.so for aarch64 (Ableton Move) and packages
# dist/elusive-muse-module.tar.gz.
#
# Set CROSS_PREFIX to override the toolchain prefix (defaults to
# aarch64-linux-gnu-, matching scripts/Dockerfile). CROSS_PREFIX= (empty)
# builds natively on an aarch64 host.
set -euo pipefail

cd "$(dirname "$0")/.."

CROSS_PREFIX="${CROSS_PREFIX-aarch64-linux-gnu-}"

if ! command -v "${CROSS_PREFIX}gcc" >/dev/null 2>&1; then
    echo "Error: missing compiler '${CROSS_PREFIX}gcc'" >&2
    echo "Run inside scripts/Dockerfile's container, or set CROSS_PREFIX=" \
         "for a native build." >&2
    exit 1
fi

echo "=== Building elusive-muse (target: ${CROSS_PREFIX:-native}) ==="

rm -rf dist
mkdir -p dist/elusive-muse

"${CROSS_PREFIX}gcc" -g -O2 -shared -fPIC -std=c11 -D_DEFAULT_SOURCE \
    src/dsp/muse.c \
    -o dist/elusive-muse/elusive-muse.so \
    -Isrc/dsp \
    -lm

cp src/module.json dist/elusive-muse/module.json
cp src/help.json   dist/elusive-muse/help.json
# The page: fonts and cards travel inside it. A missing canvas.js is SILENT
# on the device (the host logs it and leaves the band empty), so check here.
[ -s src/canvas.js ] || { echo "src/canvas.js missing: run scripts/gen_canvas.py" >&2; exit 1; }
cp src/canvas.js   dist/elusive-muse/canvas.js
# canvas.js carries Tamzen's glyphs as data. Its licence asks for nothing,
# but the notice travels with the font all the same.
cp fonts/tamzen/LICENSE dist/elusive-muse/LICENSE-tamzen.txt

cd dist
tar -czvf elusive-muse-module.tar.gz elusive-muse/
cd ..

echo ""
echo "Tarball: dist/elusive-muse-module.tar.gz"
