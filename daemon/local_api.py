#!/usr/bin/env python3
"""
EDEN Local Model API - OpenAI-compatible API for local GGUF models
Serves models from the bucket with custom model IDs
UNLIMITED TOKENS - only limited by your RAM!
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uvicorn
import time
import uuid

app = FastAPI(title="EDEN Model API", version="1.0.0")

# Import model bucket
try:
    from model_bucket import get_bucket
    bucket = get_bucket()
except ImportError:
    bucket = None

# ============ MODELS ============

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    max_tokens: Optional[int] = 2048
    temperature: Optional[float] = 0.7
    stream: Optional[bool] = False

class CompletionRequest(BaseModel):
    model: str
    prompt: str
    max_tokens: Optional[int] = 2048
    temperature: Optional[float] = 0.7

class ModelInfo(BaseModel):
    id: str
    object: str = "model"
    created: int
    owned_by: str = "eden-local"

# ============ ENDPOINTS ============

@app.get("/")
def root():
    return {
        "name": "EDEN Local Model API",
        "version": "1.0.0",
        "description": "OpenAI-compatible API for local GGUF models",
        "endpoints": ["/v1/models", "/v1/chat/completions", "/v1/completions"]
    }

@app.get("/v1/models")
def list_models():
    """List all available models in the bucket"""
    if not bucket:
        return {"object": "list", "data": []}

    models = bucket.list_models()
    return {
        "object": "list",
        "data": [
            {
                "id": m.model_id,
                "object": "model",
                "created": int(time.time()),
                "owned_by": "eden-local",
                "capabilities": m.capabilities,
                "context_length": m.context_length,
                "loaded": m.loaded
            }
            for m in models
        ]
    }

@app.get("/v1/models/{model_id}")
def get_model(model_id: str):
    """Get specific model info"""
    if not bucket:
        raise HTTPException(404, "Model bucket not available")

    model = bucket.get_model(model_id)
    if not model:
        raise HTTPException(404, f"Model not found: {model_id}")

    return {
        "id": model.model_id,
        "object": "model",
        "created": int(time.time()),
        "owned_by": "eden-local",
        "capabilities": model.capabilities,
        "context_length": model.context_length,
        "loaded": model.loaded
    }

@app.post("/v1/models/{model_id}/load")
def load_model(model_id: str):
    """Load a model into memory"""
    if not bucket:
        raise HTTPException(500, "Model bucket not available")

    success = bucket.load_model(model_id)
    if not success:
        raise HTTPException(500, f"Failed to load model: {model_id}")

    return {"success": True, "model_id": model_id, "status": "loaded"}

@app.post("/v1/chat/completions")
def chat_completion(request: ChatRequest):
    """Chat completion - OpenAI compatible"""
    if not bucket:
        raise HTTPException(500, "Model bucket not available")

    # Ensure model is loaded
    if bucket.loaded_model_id != request.model:
        if not bucket.load_model(request.model):
            raise HTTPException(500, f"Failed to load model: {request.model}")

    # Convert messages to list of dicts
    messages = [{"role": m.role, "content": m.content} for m in request.messages]

    # Generate response
    response_text = bucket.chat(messages, max_tokens=request.max_tokens)

    return {
        "id": f"chatcmpl-{uuid.uuid4().hex[:8]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": request.model,
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": response_text
                },
                "finish_reason": "stop"
            }
        ],
        "usage": {
            "prompt_tokens": -1,  # Local = unlimited!
            "completion_tokens": -1,
            "total_tokens": -1
        }
    }

@app.post("/v1/completions")
def completion(request: CompletionRequest):
    """Text completion - OpenAI compatible"""
    if not bucket:
        raise HTTPException(500, "Model bucket not available")

    # Ensure model is loaded
    if bucket.loaded_model_id != request.model:
        if not bucket.load_model(request.model):
            raise HTTPException(500, f"Failed to load model: {request.model}")

    # Generate response
    response_text = bucket.generate(
        request.prompt,
        max_tokens=request.max_tokens,
        temperature=request.temperature
    )

    return {
        "id": f"cmpl-{uuid.uuid4().hex[:8]}",
        "object": "text_completion",
        "created": int(time.time()),
        "model": request.model,
        "choices": [
            {
                "text": response_text,
                "index": 0,
                "finish_reason": "stop"
            }
        ],
        "usage": {
            "prompt_tokens": -1,
            "completion_tokens": -1,
            "total_tokens": -1
        }
    }

@app.post("/v1/bucket/add")
def add_model_to_bucket(path: str):
    """Add a GGUF model to the bucket"""
    if not bucket:
        raise HTTPException(500, "Model bucket not available")

    try:
        info = bucket.add_model(path)
        return {
            "success": True,
            "model_id": info.model_id,
            "filename": info.filename,
            "capabilities": info.capabilities
        }
    except Exception as e:
        raise HTTPException(500, str(e))

@app.post("/v1/bucket/scan")
def scan_models():
    """Scan models directory and add new models"""
    if not bucket:
        raise HTTPException(500, "Model bucket not available")

    added = bucket.scan_directory()
    return {
        "success": True,
        "added": [
            {"model_id": m.model_id, "filename": m.filename}
            for m in added
        ]
    }

def start_api(host: str = "0.0.0.0", port: int = 8080):
    """Start the API server"""
    uvicorn.run(app, host=host, port=port)

if __name__ == "__main__":
    print("=" * 50)
    print("EDEN Local Model API")
    print("OpenAI-compatible • Unlimited Tokens • 100% Local")
    print("=" * 50)
    start_api()
