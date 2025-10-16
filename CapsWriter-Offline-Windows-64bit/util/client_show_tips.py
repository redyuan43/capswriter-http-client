import os

from rich.markdown import Markdown

from config import ClientConfig as Config
from util.client_cosmic import console, Cosmic


def _backend_url() -> str:
    backend = getattr(Config, "backend_url", "").strip()
    if backend:
        return backend
    return f"{Config.addr}:{Config.port}"


def _mode_label() -> str:
    mode = getattr(Cosmic, "api_mode", getattr(Config, "api_mode", "optimize")).lower()
    mapping = {
        "transcribe": "ASR only  (/api/asr/transcribe)",
        "optimize": "ASR + optimize (/api/asr/transcribe-and-optimize)",
        "translate": "ASR + translate (/api/asr/transcribe-and-translate)",
    }
    return mapping.get(mode, mode)


def show_mic_tips():
    console.rule("[bold #d55252]CapsWriter HTTP Client")
    markdown = f"""
This build keeps the original CapsWriter UX, but all requests go to your LAN HTTP backend.

1. Hold `{Config.shortcut}` to start recording and release to upload using the current API mode.
2. The returned text is pasted into the active input field (current mode: {_mode_label()}).
3. Hotwords, diary logging, and audio archiving still work. Edit `hot-zh.txt`, `hot-en.txt`, etc. for live updates.
4. Drag an audio/video file onto the window to transcribe it with the same backend.

Default backend: `{_backend_url()}`

Tips:
- Change backend or default mode in `config.py` (`ClientConfig.backend_url`, `ClientConfig.api_mode`).
- Press `{Config.mode_hotkey}` to cycle modes: ASR only → ASR+optimize → ASR+translate.
- Auto-paste simulates `Ctrl+V`. If the target app blocks it, the text remains in the clipboard.
"""
    console.print(Markdown(markdown), highlight=True)
    console.rule()
    console.print(f"\nWorking directory: [cyan underline]{os.getcwd()}")
    console.print(f"Backend URL: [cyan underline]{_backend_url()}")
    console.print(f"Record hotkey: [green4]{Config.shortcut}")
    console.print(f"API mode: [green4]{_mode_label()} (switch: {Config.mode_hotkey})")
    console.line()


def show_file_tips():
    markdown = f"""
Current mode: {_mode_label()}

Drop audio/video files here to transcribe them via the HTTP backend.
Generated `.txt`, `.merge.txt`, and `.json` files will be placed next to the source file.
"""
    console.print(Markdown(markdown), highlight=True)
    console.print(f"Working directory: [cyan underline]{os.getcwd()}")
    console.print(f"Backend URL: [cyan underline]{_backend_url()}")
