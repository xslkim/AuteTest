"""
VoxCPM2 FastAPI wrapper (PRD §6.2.1 / §6.2.3).
Env: VOXCPM_MODEL_DIR — local model directory with config.json and weights.
Optional: VOXCPM_DEVICE (default auto), VOXCPM_OPTIMIZE (0/1, default 0).
"""

from __future__ import annotations

import atexit
import base64
import hashlib
import io
import os
import tempfile
import uuid
from pathlib import Path
from threading import Lock
from typing import Any

import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

_MODEL_DIR_RAW = os.environ.get("VOXCPM_MODEL_DIR", "").strip()
_MODEL: Any = None
_MODEL_LOCK = Lock()
_VOICES: dict[str, Path] = {}
_VOICES_LOCK = Lock()


def _config_json_hash(model_dir: Path) -> str:
    cfg = model_dir / "config.json"
    if not cfg.is_file():
        return ""
    return hashlib.sha256(cfg.read_bytes()).hexdigest()


def _voice_cleanup() -> None:
    with _VOICES_LOCK:
        for path in _VOICES.values():
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass
        _VOICES.clear()


atexit.register(_voice_cleanup)


def _get_model() -> Any:
    global _MODEL
    with _MODEL_LOCK:
        if _MODEL is None:
            if not _MODEL_DIR_RAW:
                raise RuntimeError("VOXCPM_MODEL_DIR is not set")
            local = Path(_MODEL_DIR_RAW)
            if not local.is_dir():
                raise RuntimeError(f"VOXCPM_MODEL_DIR is not a directory: {local}")
            from voxcpm import VoxCPM

            optimize = os.environ.get("VOXCPM_OPTIMIZE", "").lower() in (
                "1",
                "true",
                "yes",
            )
            _MODEL = VoxCPM.from_pretrained(
                str(local),
                local_files_only=True,
                load_denoiser=True,
                optimize=optimize,
            )
        return _MODEL


app = FastAPI(title="autovideo voxcpm2-api", version="1.0.0")


class VoicesRequest(BaseModel):
    wav_base64: str = Field(..., min_length=1)


class VoicesResponse(BaseModel):
    voice_id: str


class SpeechRequest(BaseModel):
    text: str = Field(..., min_length=1)
    voice_id: str = Field(..., min_length=1)
    cfg_value: float = 2.0
    inference_timesteps: int = 10
    denoise: bool = False
    retry_badcase: bool = True


@app.get("/health")
def health() -> dict[str, str]:
    model_dir = Path(_MODEL_DIR_RAW) if _MODEL_DIR_RAW else None
    version = _config_json_hash(model_dir) if model_dir else ""
    return {"status": "ok", "model_version": version or "unknown"}


@app.post("/v1/voices", response_model=VoicesResponse)
def register_voice(body: VoicesRequest) -> VoicesResponse:
    try:
        raw = base64.b64decode(body.wav_base64, validate=True)
    except Exception as exc:  # noqa: BLE001 — return 400 for bad base64
        raise HTTPException(status_code=400, detail=f"invalid wav_base64: {exc}") from exc
    if not raw:
        raise HTTPException(status_code=400, detail="wav_base64 decodes to empty")

    suffix = ".wav"
    fd, path_str = tempfile.mkstemp(prefix="voxcpm-voice-", suffix=suffix)
    path = Path(path_str)
    try:
        os.close(fd)
        path.write_bytes(raw)
    except OSError as exc:
        path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"failed to write temp wav: {exc}") from exc

    voice_id = f"v_{uuid.uuid4().hex}"
    with _VOICES_LOCK:
        _VOICES[voice_id] = path
    return VoicesResponse(voice_id=voice_id)


@app.post("/v1/speech")
def synthesize(body: SpeechRequest) -> Response:
    with _VOICES_LOCK:
        ref_path = _VOICES.get(body.voice_id)
    if ref_path is None or not ref_path.is_file():
        raise HTTPException(status_code=404, detail="unknown or expired voice_id")

    try:
        model = _get_model()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    try:
        wav = model.generate(
            text=body.text,
            reference_wav_path=str(ref_path),
            cfg_value=body.cfg_value,
            inference_timesteps=body.inference_timesteps,
            denoise=body.denoise,
            retry_badcase=body.retry_badcase,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"generate failed: {exc}") from exc

    if not isinstance(wav, np.ndarray):
        wav = np.asarray(wav)
    wav = np.asarray(wav, dtype=np.float32).reshape(-1)

    sr = int(getattr(model.tts_model, "sample_rate", 48000))
    buf = io.BytesIO()
    sf.write(buf, wav, sr, format="WAV", subtype="PCM_16")
    return Response(content=buf.getvalue(), media_type="audio/wav")


if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host=host, port=port, log_level="info")
