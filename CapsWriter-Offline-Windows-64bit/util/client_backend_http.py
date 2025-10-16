import json
import uuid
import urllib.error
import urllib.request
from typing import Iterator

from config import ClientConfig as Config


def _base_url() -> str:
    url = getattr(Config, "backend_url", "").strip()
    if not url:
        raise RuntimeError("未配置后端地址，请在 config.py 中设置 ClientConfig.backend_url")
    return url.rstrip("/")


def _encode_multipart(fields, files):
    boundary = f"----CapsWriter{uuid.uuid4().hex}"
    boundary_bytes = boundary.encode("utf-8")
    body = []

    for name, value in fields.items():
        if value is None:
            continue
        body.extend([
            b"--" + boundary_bytes,
            f'Content-Disposition: form-data; name="{name}"'.encode("utf-8"),
            b"",
            value.encode("utf-8") if isinstance(value, str) else value,
        ])

    for name, (filename, content, mimetype) in files.items():
        body.extend([
            b"--" + boundary_bytes,
            f'Content-Disposition: form-data; name="{name}"; filename="{filename}"'.encode("utf-8"),
            f"Content-Type: {mimetype}".encode("utf-8"),
            b"",
            content,
        ])

    body.extend([b"--" + boundary_bytes + b"--", b""])
    data = b"\r\n".join(body)
    headers = {
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Content-Length": str(len(data)),
    }
    return data, headers


def _request(url, data, headers=None, method="POST"):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    timeout = getattr(Config, "http_timeout", 60)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            charset = resp.headers.get_content_charset() or "utf-8"
            raw = resp.read().decode(charset)
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {e.code}: {detail}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"请求后端失败: {e.reason}") from e


def _resolve_endpoint(mode: str) -> str:
    mode = (mode or getattr(Config, "api_mode", "optimize")).lower()
    if mode == "translate":
        return "/api/asr/transcribe-and-translate"
    if mode == "optimize":
        return "/api/asr/transcribe-and-optimize"
    return "/api/asr/transcribe"


def post_audio(mode: str, audio_bytes: bytes, filename: str = "audio.wav") -> dict:
    endpoint = _resolve_endpoint(mode)
    url = _base_url() + endpoint

    fields = {}
    if endpoint == "/api/asr/transcribe":
        fields.update({
            "use_vad": "true",
            "use_punc": "true",
            "hotword": "",
        })

    data, headers = _encode_multipart(fields, {
        "audio": (filename, audio_bytes, "audio/wav"),
    })
    return _request(url, data, headers=headers)


def post_optimize(text: str, mode: str = "optimize") -> dict:
    url = _base_url() + "/api/llm/optimize"
    payload = json.dumps({
        "text": text,
        "mode": mode,
        "custom_prompt": None,
    }).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Content-Length": str(len(payload)),
    }
    return _request(url, payload, headers=headers)


def post_audio_stream(mode: str, audio_bytes: bytes, filename: str = "audio.wav") -> Iterator[dict]:
    url = _base_url() + "/api/asr/transcribe-and-optimize-stream"
    mode_key = (mode or getattr(Config, "api_mode", "optimize")).lower()
    optimize_mode = {
        "translate": "translate",
        "transcribe": "none",
    }.get(mode_key, "optimize")
    fields = {
        "use_vad": "true",
        "use_punc": "true",
        "hotword": "",
        "optimize_mode": optimize_mode,
    }
    data, headers = _encode_multipart(fields, {
        "audio": (filename, audio_bytes, "audio/wav"),
    })
    headers["Accept"] = "text/event-stream"

    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    timeout = getattr(Config, "http_timeout", 60)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            charset = resp.headers.get_content_charset() or "utf-8"
            for raw_line in resp:
                if not raw_line:
                    continue
                line = raw_line.decode(charset, errors="ignore").strip()
                if not line or not line.startswith("data:"):
                    continue
                data_str = line[5:].strip()
                if not data_str:
                    continue
                try:
                    yield json.loads(data_str)
                except json.JSONDecodeError:
                    continue
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {e.code}: {detail}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"请求后端失败: {e.reason}") from e
