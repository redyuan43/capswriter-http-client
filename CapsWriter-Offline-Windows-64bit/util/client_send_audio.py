import asyncio
import io
import time
import uuid
import wave
from pathlib import Path
from typing import List

import numpy as np

from config import ClientConfig as Config
from util.client_cosmic import Cosmic, console
from util.client_backend_http import post_audio, post_optimize
from util.client_create_file import create_file
from util.client_write_file import write_file
from util.client_finish_file import finish_file
from util.client_type_result import type_result
from util.client_hot_sub import hot_sub
from util.client_strip_punc import strip_punc
from util.client_rename_audio import rename_audio
from util.client_write_md import write_md


def _build_wav_bytes(chunks: List[np.ndarray]) -> bytes:
    if not chunks:
        return b""

    audio = np.concatenate(chunks, axis=0)
    if audio.ndim == 2:
        audio = audio.mean(axis=1)

    if audio.size == 0:
        return b""

    downsampled = audio[::3]  # 48k -> 16k
    clipped = np.clip(downsampled, -1.0, 1.0)
    int16 = (clipped * 32767).astype("<i2")

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(int16.tobytes())
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

def _search_text(obj) -> str:
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


async def send_audio():
    task_id = str(uuid.uuid4())
    time_start = 0.0
    cache = []
    recorded = []
    duration = 0.0
    file_path = None
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

                console.print(f"任务标识：{task_id}")
                console.print(f"    录音时长：{duration:.2f}s")

                wav_bytes = _build_wav_bytes(recorded)
                if not wav_bytes:
                    console.print("    Audio too short, skipped.")
                    break

                filename = Path(file_path).name if file_path else "mic.wav"

                mode = getattr(Cosmic, 'api_mode', getattr(Config, 'api_mode', 'optimize')).lower()
                try:
                    response = await asyncio.to_thread(post_audio, mode, wav_bytes, filename)
                except Exception as e:
                    console.print(f"[red]发送到后端失败：{e}[/]")
                    break

                console.print(f"    后端响应: {response}")

                preferred_keys = {
                    'transcribe': ['recognized_text', 'text', 'optimized_text'],
                    'optimize': ['optimized_text', 'recognized_text', 'text'],
                    'translate': ['translated_text', 'translation', 'recognized_text', 'optimized_text', 'text'],
                }
                text = None
                for key in preferred_keys.get(mode, []):
                    value = response.get(key)
                    if isinstance(value, str) and value.strip():
                        text = value
                        break

                if not text and isinstance(response.get('asr_result'), dict):
                    asr_result = response['asr_result']
                    text = asr_result.get('text') or asr_result.get('raw_text')

                if not text and mode == 'transcribe':
                    try:
                        optimize_mode = getattr(Config, 'auto_optimize_mode', 'optimize')
                        source_text = response.get('recognized_text') or response.get('text') or _search_text(response)
                        opt_resp = await asyncio.to_thread(post_optimize, source_text or '', optimize_mode)
                        text = _extract_text(opt_resp) or _search_text(opt_resp)
                    except Exception as e:
                        console.print(f"[yellow]文本优化失败：{e}[/]")

                if not text:
                    text = _search_text(response)

                _skip_markers = {"", "none", "无修改", "未修改", "暂无内容", "no change"}
                if not text or text.strip() == "" or text.strip().lower() in _skip_markers:
                    console.print("[red]后端未返回识别文本[/]")
                    break

                text = hot_sub(text)
                text = strip_punc(text)

                await type_result(text)

                if Config.save_audio and file_path:
                    new_path = rename_audio(task_id, text, time_start)
                else:
                    new_path = None

                if Config.save_audio:
                    write_md(text, time_start, new_path)

                console.print(f"    识别结果：[green]{text}[/]")
                console.line()
                break
    except Exception as exc:
        console.print(f"[red]处理录音时发生错误：{exc}[/]")
