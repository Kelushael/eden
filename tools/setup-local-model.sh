#!/usr/bin/env bash
set -euo pipefail

MODEL_NAME="${EDEN_MODEL_NAME:-qwen2.5-coder:7b}"

if ! command -v ollama >/dev/null 2>&1; then
  echo "Installing Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl enable --now ollama || true
fi

echo "Pulling model: ${MODEL_NAME}"
ollama pull "${MODEL_NAME}"

echo "Done. Set EDEN_MODEL_NAME=${MODEL_NAME} if you want to pin it."
