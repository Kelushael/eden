#!/usr/bin/env python3
"""Local model backend (default: Ollama HTTP API)."""

import json
import os
import urllib.request
from typing import Optional


class LocalModelError(RuntimeError):
    pass


def _post_json(url: str, payload: dict, timeout: int = 60) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
        return json.loads(raw)
    except Exception as exc:
        raise LocalModelError(str(exc)) from exc


def generate(prompt: str, *, model: str, host: str, system: Optional[str] = None,
             temperature: float = 0.2, timeout: int = 120) -> str:
    """Generate text from a local model. Returns plain text."""
    url = host.rstrip("/") + "/api/generate"
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": temperature,
        },
    }
    if system:
        payload["system"] = system

    data = _post_json(url, payload, timeout=timeout)
    text = data.get("response", "")
    if not isinstance(text, str):
        raise LocalModelError("Unexpected response from local model")
    return text.strip()


def healthcheck(host: str) -> bool:
    """Return True if the local model service responds."""
    url = host.rstrip("/") + "/api/tags"
    try:
        _post_json(url, {}, timeout=5)
        return True
    except Exception:
        return False


def default_model() -> str:
    return os.getenv("EDEN_MODEL_NAME", "qwen2.5-coder:7b")


def default_host() -> str:
    return os.getenv("EDEN_MODEL_HOST", "http://127.0.0.1:11434")
