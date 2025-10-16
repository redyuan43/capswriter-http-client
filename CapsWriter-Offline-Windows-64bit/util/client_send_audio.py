import asyncio
import io
import time
import uuid
import wave
from pathlib import Path
from typing import List, Optional

import numpy as np

from config import ClientConfig as Config
from util.client_backend_http import post_audio, post_audio_stream, post_optimize
from util.client_cosmic import Cosmic, console
from util.client_create_file import create_file
from util.client_finish_file import finish_file
from util.client_hot_sub import hot_sub
from util.client_rename_audio import rename_audio
from util.client_strip_punc import strip_punc
from util.client_type_result import type_result
from util.client_write_file import write_file
from util.client_write_md import write_md
from util.status_overlay import overlay


def _build_wav_bytes(chunks: List[np.ndarray]) -> bytes:
    if not chunks:
        return b""

    audio = np.concatenate(chunks, axis=0)
    if audio.ndim == 2:
        audio = audio.mean(axis=1)

    if audio.size == 0:
        return b""

    downsampled = audio[::3]  # 48 kHz -> 16 kHz
    clipped = np.clip(downsampled, -1.0, 1.0)
    pcm = (clipped * 32767).astype("<i2")

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(pcm.tobytes())
    buffer.seek(0)
    return buffer.read()


def _extract_text(result: dict) -> str:
    candidates = [
        result.get("processed_text"),
        result.get("text"),
        result.get("transcript"),
        result.get("result"),
    ]
    for item in candidates:
        if isinstance(item, str) and item.strip():
            return item
        if isinstance(item, dict):
            value = item.get("text") or item.get("processed_text")
            if isinstance(value, str) and value.strip():
                return value
    return ""


def _search_text(obj: Optional[object]) -> str:
    if isinstance(obj, str):
        return obj.strip()
    if isinstance(obj, dict):
        for key in ("processed_text", "text", "transcript", "content"):
            value = obj.get(key)
            if isinstance(value, str) and value.strip():
                return value
        for value in obj.values():
            text = _search_text(value)
            if text:
                return text
    if isinstance(obj, (list, tuple)):
        for item in obj:
            text = _search_text(item)
            if text:
                return text
    return ""


def _consume_stream_response(mode: str, audio_bytes: bytes, filename: str) -> dict:
    result = {
        "asr_text": "",
        "optimized_text": "",
        "final_text": "",
        "error": None,
    }
    def _push(message: str) -> None:
        if not message:
            return
        overlay.append_message(message)

    def _extract_stage_text(event: dict, *keys: str) -> str:
        for key in keys:
            value = event.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return ""

    for event in post_audio_stream(mode, audio_bytes, filename):
        stage = (event.get("stage") or "").lower()
        if stage == "start":
            overlay.show_status("\u5904\u7406\u4e2d...", animate=True, color="#22c55e", style="bars")
            _push(event.get("message", "\u6b63\u5728\u5904\u7406..."))
        elif stage == "asr_complete":
            text = _extract_stage_text(event, "text", "asr_text", "recognized_text")
            result["asr_text"] = text
            overlay.show_status("\u8bc6\u522b\u4e2d...", animate=True, color="#22c55e", style="bars")
            if text:
                _push(f"\u8bc6\u522b: {text}")
        elif stage == "optimizing":
            overlay.show_status("\u6b63\u5728\u4f18\u5316...", animate=True, color="#22c55e", style="bars")
            _push(event.get("message", "\u6b63\u5728\u4f18\u5316..."))
        elif stage == "optimize_complete":
            text = _extract_stage_text(event, "text", "optimized_text")
            if text:
                result["optimized_text"] = text
            overlay.show_status("\u4f18\u5316\u5b8c\u6210", animate=False, color="#22c55e")
            if result["optimized_text"]:
                _push(f"\u4f18\u5316: {result['optimized_text']}")
        elif stage == "done":
            final_text = _extract_stage_text(
                event,
                "final_text",
                "optimized_text",
                "asr_text",
                "text",
            ) or result["optimized_text"] or result["asr_text"] or ""
            result["final_text"] = final_text
            overlay.show_status("\u8bc6\u522b\u5b8c\u6210", animate=False, color="#22c55e")
            if final_text:
                _push(f"\u7ed3\u679c: {final_text}")
            break
        elif stage == "error":
            message = event.get("error") or event.get("message") or "流式接口错误"
            overlay.show_status("\u5904\u7406\u5931\u8d25", animate=False, color="#ef4444")
            _push(message)
            result["error"] = message
            break
    return result


async def send_audio():
    task_id = str(uuid.uuid4())
    time_start = 0.0
    cache: List[np.ndarray] = []
    recorded: List[np.ndarray] = []
    duration = 0.0
    file_path: Optional[Path] = None
    file_handle = None

    try:
        while task := await Cosmic.queue_in.get():
            Cosmic.queue_in.task_done()

            if task["type"] == "begin":
                time_start = task["time"]
                continue

            if task["type"] == "data":
                chunk = task["data"]
                if task["time"] - time_start < Config.threshold:
                    cache.append(chunk)
                    continue

                if Config.save_audio and not file_path:
                    file_path, file_handle = create_file(chunk.shape[1], time_start)
                    Cosmic.audio_files[task_id] = str(file_path)

                if cache:
                    data = np.concatenate(cache, axis=0)
                    cache.clear()
                else:
                    data = chunk

                recorded.append(data.copy())
                duration += len(data) / 48000

                if Config.save_audio and file_handle is not None:
                    write_file(file_handle, data)

            elif task["type"] == "finish":
                if cache:
                    data = np.concatenate(cache, axis=0)
                    recorded.append(data)
                    duration += len(data) / 48000
                    cache.clear()

                if Config.save_audio and file_handle is not None:
                    finish_file(file_handle)

                console.print(f"\u4efb\u52a1\u6807\u8bc6\uff1a{task_id}")
                console.print(f"    \u5f55\u97f3\u65f6\u957f\uff1a{duration:.2f}s")

                wav_bytes = _build_wav_bytes(recorded)
                if not wav_bytes:
                    console.print("    Audio too short, skipped.")
                    overlay.show_status("\u5f55\u97f3\u8fc7\u77ed", animate=False, color="#f97316")
                    overlay.update_transcript("")
                    overlay.hide(delay_ms=500)
                    break

                filename = Path(file_path).name if file_path else "mic.wav"

                mode = getattr(Cosmic, "api_mode", getattr(Config, "api_mode", "optimize")).lower()
                stream_result = None
                if getattr(Config, "use_stream_api", True):
                    try:
                        stream_result = await asyncio.to_thread(
                            _consume_stream_response, mode, wav_bytes, filename
                        )
                    except Exception as exc:
                        stream_result = {"exception": exc}

                if stream_result and not stream_result.get("error") and not stream_result.get("exception"):
                    raw_text = (
                        stream_result.get("final_text")
                        or stream_result.get("optimized_text")
                        or stream_result.get("asr_text")
                    )
                    if raw_text:
                        text = strip_punc(hot_sub(raw_text))
                        await type_result(text)
                        overlay.update_transcript(text)
                        overlay.show_status("\u8bc6\u522b\u5b8c\u6210", animate=False, color="#22c55e")
                        overlay.hide(delay_ms=500)

                        if Config.save_audio and file_path:
                            new_path = rename_audio(task_id, text, time_start)
                        else:
                            new_path = None

                        if Config.save_audio:
                            write_md(text, time_start, new_path)

                        console.print(f"    \u8bc6\u522b\u7ed3\u679c\uff1a[green]{text}[/]")
                        console.line()
                        break

                if stream_result:
                    if stream_result.get("error"):
                        console.print(f"[red]\u6d41\u5f0f\u63a5\u53e3\u9519\u8bef\uff1a{stream_result['error']}[/]")
                    if stream_result.get("exception"):
                        console.print(f"[yellow]\u6d41\u5f0f\u63a5\u53e3\u5f02\u5e38\uff1a{stream_result['exception']}[/]")

                overlay.show_status("\u5904\u7406\u4e2d...", animate=True, color="#22c55e", style="bars")
                try:
                    response = await asyncio.to_thread(post_audio, mode, wav_bytes, filename)
                except Exception as exc:
                    console.print(f"[red]\u53d1\u9001\u5230\u540e\u7aef\u5931\u8d25\uff1a{exc}[/]")
                    overlay.show_status("\u53d1\u9001\u5931\u8d25", animate=False, color="#ef4444")
                    overlay.update_transcript("")
                    overlay.hide(delay_ms=500)
                    break

                console.print(f"    \u540e\u7aef\u54cd\u5e94: {response}")

                preferred_keys = {
                    "transcribe": ["recognized_text", "text", "optimized_text"],
                    "optimize": ["optimized_text", "recognized_text", "text"],
                    "translate": ["translated_text", "translation", "recognized_text", "optimized_text", "text"],
                }
                text = None
                for key in preferred_keys.get(mode, []):
                    value = response.get(key)
                    if isinstance(value, str) and value.strip():
                        text = value
                        break

                if not text and isinstance(response.get("asr_result"), dict):
                    asr_result = response["asr_result"]
                    text = asr_result.get("text") or asr_result.get("raw_text")

                if not text and mode == "transcribe":
                    try:
                        optimize_mode = getattr(Config, "auto_optimize_mode", "optimize")
                        source_text = response.get("recognized_text") or response.get("text") or _search_text(response)
                        opt_resp = await asyncio.to_thread(post_optimize, source_text or "", optimize_mode)
                        text = _extract_text(opt_resp) or _search_text(opt_resp)
                    except Exception as exc:
                        console.print(f"[yellow]\u6587\u672c\u4f18\u5316\u5931\u8d25\uff1a{exc}[/]")

                if not text:
                    text = _search_text(response)

                skip_markers = {
                    "",
                    "none",
                    "no change",
                    "\u65e0\u4fee\u6539",
                    "\u672a\u4fee\u6539",
                    "\u6682\u65e0\u5185\u5bb9",
                }
                candidate = (text or "").strip()
                if not candidate or candidate.lower() in skip_markers:
                    console.print("[red]\u540e\u7aef\u672a\u8fd4\u56de\u8bc6\u522b\u6587\u672c[/]")
                    overlay.show_status("\u672a\u5f97\u5230\u8bc6\u522b\u7ed3\u679c", animate=False, color="#f97316")
                    overlay.update_transcript("")
                    overlay.hide(delay_ms=500)
                    break

                text = hot_sub(candidate)
                text = strip_punc(text)

                await type_result(text)
                overlay.update_transcript(text)
                overlay.show_status("\u8bc6\u522b\u5b8c\u6210", animate=False, color="#22c55e")
                overlay.hide(delay_ms=500)

                if Config.save_audio and file_path:
                    new_path = rename_audio(task_id, text, time_start)
                else:
                    new_path = None

                if Config.save_audio:
                    write_md(text, time_start, new_path)

                console.print(f"    \u8bc6\u522b\u7ed3\u679c\uff1a[green]{text}[/]")
                console.line()
                break
    except Exception as exc:
        console.print(f"[red]\u5904\u7406\u5f55\u97f3\u65f6\u53d1\u751f\u9519\u8bef\uff1a{exc}[/]")
        overlay.show_status("\u5904\u7406\u5931\u8d25", animate=False, color="#ef4444")
        overlay.update_transcript("")
        overlay.hide(delay_ms=500)
