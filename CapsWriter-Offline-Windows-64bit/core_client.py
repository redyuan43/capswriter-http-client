#!/usr/bin/env python

import asyncio
import os
import signal
import sys
from pathlib import Path
from platform import system
from typing import List

import colorama
import keyboard
import typer

from config import ClientConfig as Config
from util.client_cosmic import console, Cosmic
from util.client_stream import stream_open, stream_close
from util.client_shortcut_handler import bond_shortcut
from util.client_show_tips import show_mic_tips, show_file_tips
from util.client_hot_update import update_hot_all, observe_hot
from util.client_transcribe import transcribe_files
from util.client_adjust_srt import adjust_srt
from util.empty_working_set import empty_current_working_set

BASE_DIR = os.path.dirname(__file__)
os.chdir(BASE_DIR)

colorama.init()


def _ensure_macos_permission():
    if system() != "Darwin" or sys.argv[1:]:
        return
    if os.getuid() != 0:
        print("在 macOS 上需要以管理员身份启动客户端才能监听键盘，请使用 sudo 再试。")
        input("按回车退出")
        sys.exit()
    os.umask(0o000)


async def main_mic():
    Cosmic.loop = asyncio.get_event_loop()
    Cosmic.queue_in = asyncio.Queue()

    show_mic_tips()
    update_hot_all()
    observer = observe_hot()

    Cosmic.stream = stream_open()
    signal.signal(signal.SIGINT, stream_close)
    bond_shortcut()

    if system() == "Windows":
        empty_current_working_set()

    stop_event = asyncio.Event()
    try:
        await stop_event.wait()
    finally:
        try:
            observer.stop()
            observer.join(timeout=1)
        except Exception:
            pass


async def main_file(files: List[Path]):
    show_file_tips()
    await transcribe_files(files, adjust_srt)
    input("\n按回车退出\n")


def init_mic():
    try:
        asyncio.run(main_mic())
    except KeyboardInterrupt:
        console.print("再见！")
    finally:
        print("...")


def init_file(files: List[Path]):
    try:
        asyncio.run(main_file(files))
    except KeyboardInterrupt:
        console.print("再见！")
        sys.exit()


if __name__ == "__main__":
    _ensure_macos_permission()
    if sys.argv[1:]:
        typer.run(init_file)
    else:
        init_mic()
