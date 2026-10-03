#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

bin="build/tests/test_muse"
mkdir -p "$(dirname "$bin")"

cc -std=c11 -D_DEFAULT_SOURCE -DMUSE_TEST -Wall -Wextra -Werror \
  -Isrc/dsp \
  tests/test_muse.c \
  src/dsp/muse.c \
  -lm \
  -o "$bin"

"$bin"

# The shipped canvas.js is generated; a stale one is the old page with the
# new source sitting beside it, which nothing on the device would show.
python3 scripts/gen_canvas.py --check

# The page and the help need node. A missing node is a loud failure, not a
# silent skip.
if ! command -v node >/dev/null 2>&1; then
  echo "FAIL: node is not on PATH (tests/page.test.mjs, tests/help_lint.mjs)" >&2
  exit 1
fi
"$bin" --dump > build/tests/dsp_contract.txt
node tests/page.test.mjs build/tests/dsp_contract.txt
node tests/help_lint.mjs
