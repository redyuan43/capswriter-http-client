import asyncio
import json

import keyboard
import websockets
from config import ClientConfig as Config
from util.client_check_websocket import check_websocket
from util.client_cosmic import Cosmic, console
from util.client_hot_sub import hot_sub
from util.client_rename_audio import rename_audio
from util.client_strip_punc import strip_punc
from util.client_type_result import type_result
from util.client_write_md import write_md
from util.status_overlay import overlay


async def recv_result():
    if not await check_websocket():
        return
    console.print("[green]\u8fde\u63a5\u6210\u529f\n")
    try:
        while True:
            message = await Cosmic.websocket.recv()
            message = json.loads(message)
            text = message["text"]
            delay = message["time_complete"] - message["time_submit"]

            if not message["is_final"]:
                overlay.update_transcript(text)
                overlay.show_status("\u8bc6\u522b\u4e2d...", animate=True, color="#22c55e", style="bars")
                continue

            text = hot_sub(text)
            text = strip_punc(text)

            await type_result(text)
            overlay.update_transcript(text)
            overlay.show_status("\u8bc6\u522b\u5b8c\u6210", animate=False, color="#22c55e")
            overlay.hide(delay_ms=2000)

            if Config.save_audio:
                file_audio = rename_audio(message["task_id"], text, message["time_start"])
                write_md(text, message["time_start"], file_audio)

            console.print(f"    \u8f6c\u5f55\u65f6\u5ef6\uff1a{delay:.2f}s")
            console.print(f"    \u8bc6\u522b\u7ed3\u679c\uff1a[green]{text}")
            console.line()

    except websockets.ConnectionClosedError:
        console.print("[red]\u8fde\u63a5\u65ad\u5f00\n")
    except websockets.ConnectionClosedOK:
        console.print("[red]\u8fde\u63a5\u65ad\u5f00\n")
    except Exception as exc:
        console.print(f"[red]\u63a5\u6536\u8bc6\u522b\u7ed3\u679c\u51fa\u9519\uff1a{exc}[/]")
    finally:
        return
