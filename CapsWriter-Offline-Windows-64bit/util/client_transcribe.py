import asyncio
import io
import json
import subprocess
import wave
from pathlib import Path
from typing import Dict

import numpy as np

from config import ClientConfig as Config
from util.client_backend_http import post_audio, post_optimize
from util.client_cosmic import console, Cosmic
from util.client_hot_sub import hot_sub
from util.client_strip_punc import strip_punc


SUPPORTED_MEDIA = {'.wav', '.mp3', '.m4a', '.flac', '.aac', '.mp4', '.mov', '.avi', '.mkv'}


def is_supported_media(path: Path) -> bool:
    return path.suffix.lower() in SUPPORTED_MEDIA


def _search_text(obj) -> str:
    if isinstance(obj, str):
        return obj.strip()
    if isinstance(obj, dict):
        for key in ('translated_text', 'translation', 'optimized_text', 'recognized_text', 'processed_text', 'text', 'transcript'):
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
    return ''


def _convert_to_wav_bytes(file: Path) -> bytes:
    ffmpeg_cmd = [
        'ffmpeg',
        '-y',
        '-i', str(file),
        '-f', 'f32le',
        '-ac', '1',
        '-ar', '16000',
        '-',
    ]
    process = subprocess.Popen(ffmpeg_cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    data = process.stdout.read()
    process.wait()
    if not data:
        raise RuntimeError("ffmpeg 转码失败或未读取到音频数据")

    audio = np.frombuffer(data, dtype='<f4')
    audio = np.clip(audio, -1.0, 1.0)
    int16 = (audio * 32767).astype('<i2')

    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(int16.tobytes())
    buffer.seek(0)
    return buffer.read()


def _pick_text(result: Dict, mode: str) -> str:
    preferred_keys = {
        'transcribe': ['recognized_text', 'text', 'optimized_text'],
        'optimize': ['optimized_text', 'recognized_text', 'text'],
        'translate': ['translated_text', 'translation', 'optimized_text', 'recognized_text', 'text'],
    }
    for key in preferred_keys.get(mode, []):
        value = result.get(key)
        if isinstance(value, str) and value.strip():
            return value

    asr_result = result.get('asr_result')
    if isinstance(asr_result, dict):
        value = asr_result.get('text') or asr_result.get('raw_text')
        if isinstance(value, str) and value.strip():
            return value
    return ''


async def _transcribe_single(file: Path, adjust_srt):
    console.print(f'\n处理文件：{file}')
    if file.suffix.lower() in {'.txt', '.json', '.srt'}:
        adjust_srt(file)
        return

    if not is_supported_media(file):
        console.print(f'[red]暂不支持的文件类型：{file.suffix}[/]')
        return

    wav_bytes = await asyncio.to_thread(_convert_to_wav_bytes, file)
    mode = getattr(Cosmic, 'api_mode', getattr(Config, 'api_mode', 'optimize')).lower()
    try:
        response = await asyncio.to_thread(post_audio, mode, wav_bytes, file.name)
    except Exception as e:
        console.print(f'[red]上传失败：{e}[/]')
        return

    console.print(f'    后端响应: {response}')

    text = _pick_text(response, mode)
    if not text and mode == 'transcribe':
        try:
            optimize_mode = getattr(Config, 'auto_optimize_mode', 'optimize')
            opt_resp = await asyncio.to_thread(post_optimize, response.get('text', ''), optimize_mode)
            text = _pick_text(opt_resp, 'optimize') or _search_text(opt_resp)
        except Exception as e:
            console.print(f'[yellow]文本优化失败：{e}[/]')

    if not text:
        text = _search_text(response)

    text = hot_sub(strip_punc(text)) if text else ''
    skip_markers = {'', 'none', '无修改', '未修改', '暂无内容', 'no change'}
    if not text or text.strip().lower() in skip_markers:
        console.print('[yellow]后端未返回文本结果[/]')
        return

    txt_filename = file.with_suffix('.txt')
    merge_filename = file.with_suffix('.merge.txt')
    json_filename = file.with_suffix('.json')

    with open(merge_filename, 'w', encoding='utf-8') as f:
        f.write(text)
    with open(txt_filename, 'w', encoding='utf-8') as f:
        f.write(text.replace('，', '\n').replace('。', '\n'))
    with open(json_filename, 'w', encoding='utf-8') as f:
        json.dump({'text': text, 'raw_response': response}, f, ensure_ascii=False, indent=2)

    console.print(f'    识别结果已写入：{txt_filename}')


async def transcribe_files(files, adjust_srt):
    for file in files:
        await _transcribe_single(Path(file), adjust_srt)
