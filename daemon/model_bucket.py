#!/usr/bin/env python3
"""
EDEN Model Bucket - Local GGUF Model Management
Creates custom API endpoints and model IDs for loaded models
"""

import os
import json
import hashlib
from pathlib import Path
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, asdict
import logging

logger = logging.getLogger("model_bucket")

MODELS_DIR = Path.home() / "EDEN" / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)
REGISTRY_FILE = MODELS_DIR / "registry.json"

@dataclass
class ModelInfo:
    model_id: str
    filename: str
    path: str
    size_bytes: int
    capabilities: List[str]
    context_length: int
    loaded: bool = False

class ModelBucket:
    """Manage local GGUF models with custom IDs"""

    def __init__(self):
        self.registry: Dict[str, ModelInfo] = {}
        self.loaded_model = None
        self.loaded_model_id = None
        self.llm = None
        self._load_registry()

    def _load_registry(self):
        if REGISTRY_FILE.exists():
            with open(REGISTRY_FILE) as f:
                data = json.load(f)
                for mid, info in data.items():
                    self.registry[mid] = ModelInfo(**info)

    def _save_registry(self):
        with open(REGISTRY_FILE, 'w') as f:
            json.dump({k: asdict(v) for k, v in self.registry.items()}, f, indent=2)

    def _generate_model_id(self, filename: str) -> str:
        """Generate unique model ID from filename"""
        # Extract model name from filename
        name = filename.replace('.gguf', '').replace('-', '_').lower()
        # Create short hash
        hash_part = hashlib.sha256(filename.encode()).hexdigest()[:6]
        return f"eden_{name}_{hash_part}"

    def _detect_capabilities(self, filename: str) -> List[str]:
        """Detect model capabilities from filename"""
        caps = ["chat", "completion"]
        fname_lower = filename.lower()

        if "code" in fname_lower or "coder" in fname_lower:
            caps.append("code")
        if "instruct" in fname_lower:
            caps.append("instruction")
        if "vision" in fname_lower or "llava" in fname_lower:
            caps.append("vision")
        if "embed" in fname_lower:
            caps.append("embedding")

        return caps

    def _detect_context_length(self, filename: str) -> int:
        """Estimate context length from filename"""
        fname_lower = filename.lower()
        if "32k" in fname_lower:
            return 32768
        if "16k" in fname_lower:
            return 16384
        if "8k" in fname_lower:
            return 8192
        if "128k" in fname_lower:
            return 131072
        return 4096  # Default

    def add_model(self, filepath: str) -> ModelInfo:
        """Add a GGUF model to the bucket"""
        path = Path(filepath)
        if not path.exists():
            raise FileNotFoundError(f"Model not found: {filepath}")

        filename = path.name
        model_id = self._generate_model_id(filename)

        # Copy to models dir if not already there
        target_path = MODELS_DIR / filename
        if path != target_path and not target_path.exists():
            import shutil
            shutil.copy2(path, target_path)

        info = ModelInfo(
            model_id=model_id,
            filename=filename,
            path=str(target_path),
            size_bytes=target_path.stat().st_size,
            capabilities=self._detect_capabilities(filename),
            context_length=self._detect_context_length(filename),
            loaded=False
        )

        self.registry[model_id] = info
        self._save_registry()
        logger.info(f"Added model: {model_id}")
        return info

    def list_models(self) -> List[ModelInfo]:
        """List all registered models"""
        return list(self.registry.values())

    def get_model(self, model_id: str) -> Optional[ModelInfo]:
        """Get model info by ID"""
        return self.registry.get(model_id)

    def load_model(self, model_id: str) -> bool:
        """Load a model into memory"""
        info = self.registry.get(model_id)
        if not info:
            logger.error(f"Model not found: {model_id}")
            return False

        try:
            from llama_cpp import Llama

            # Unload previous model
            if self.llm:
                del self.llm
                self.llm = None

            logger.info(f"Loading model: {model_id}")
            self.llm = Llama(
                model_path=info.path,
                n_ctx=min(info.context_length, 4096),  # Limit for memory
                n_threads=4,
                verbose=False
            )

            self.loaded_model_id = model_id
            info.loaded = True
            self._save_registry()
            logger.info(f"Model loaded: {model_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            return False

    def generate(self, prompt: str, max_tokens: int = 256, temperature: float = 0.7) -> str:
        """Generate text using loaded model"""
        if not self.llm:
            return "[ERROR: No model loaded]"

        try:
            response = self.llm(
                prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                stop=["</s>", "Human:", "User:", "\n\n\n"]
            )
            return response['choices'][0]['text'].strip()
        except Exception as e:
            return f"[ERROR: {e}]"

    def chat(self, messages: List[Dict], max_tokens: int = 256) -> str:
        """Chat completion using loaded model"""
        if not self.llm:
            return "[ERROR: No model loaded]"

        # Format messages into prompt
        prompt = ""
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role == "system":
                prompt += f"System: {content}\n\n"
            elif role == "user":
                prompt += f"Human: {content}\n\n"
            elif role == "assistant":
                prompt += f"Assistant: {content}\n\n"

        prompt += "Assistant:"

        return self.generate(prompt, max_tokens)

    def scan_directory(self, directory: str = None) -> List[ModelInfo]:
        """Scan directory for GGUF files and add them"""
        scan_dir = Path(directory) if directory else MODELS_DIR
        added = []

        for gguf_file in scan_dir.glob("*.gguf"):
            if gguf_file.name not in [m.filename for m in self.registry.values()]:
                info = self.add_model(str(gguf_file))
                added.append(info)

        return added


# Singleton instance
_bucket = None

def get_bucket() -> ModelBucket:
    global _bucket
    if _bucket is None:
        _bucket = ModelBucket()
    return _bucket
