#!/bin/zsh
set -eu
EDITOR_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
EDITOR_URL="http://127.0.0.1:5173/experiments/letters/"
if curl -fsS --max-time 2 "${EDITOR_URL}play.html" >/dev/null 2>&1; then
  open "$EDITOR_URL"
  exit 0
fi
VENV_PYTHON="$EDITOR_DIR/.editor-venv/bin/python3"
if [[ ! -x "$VENV_PYTHON" ]]; then
  python3 -m venv "$EDITOR_DIR/.editor-venv"
fi
if ! "$VENV_PYTHON" -c 'import PIL' >/dev/null 2>&1; then
  "$VENV_PYTHON" -m pip install -r "$EDITOR_DIR/requirements-editor.txt"
fi
(sleep 2; open "$EDITOR_URL") &
exec "$VENV_PYTHON" "$EDITOR_DIR/serve.py" --port 5173
