#!/usr/bin/env bash
# Generate in-context Kokoro voice samples for the shortlisted narrators.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
VENV="$HERE/.venv"
ENGINE="$HERE/engines/engine_kokoro.py"
TEXT="$HERE/sample_text.txt"
OUT_DIR="$HERE/samples"
mkdir -p "$OUT_DIR"

VOICES=( af_heart af_bella af_nicole bf_emma am_michael )
for v in "${VOICES[@]}"; do
  echo "=== synthing $v ==="
  "$VENV/bin/python" "$ENGINE" --text "$(cat "$TEXT")" --voice "$v" --out "$OUT_DIR/${v}.mp3" 2>&1 | grep -v -i "warning\|unauthenticated\|Defaulting repo\|spacy" || true
done
echo "=== done ==="
ls -la "$OUT_DIR"