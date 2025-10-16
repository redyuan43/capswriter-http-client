# -*- coding: utf-8 -*-
import asyncio
import time
from concurrent.futures import ThreadPoolExecutor
from threading import Event

import keyboard

from config import ClientConfig as Config
from util.client_cosmic import Cosmic, console
from util.client_send_audio import send_audio
from util.my_status import Status

# 状态管理
task = asyncio.Future()
status = Status('开始录音', spinner='point')
pool = ThreadPoolExecutor()
pressed = False
released = True
event = Event()

# 支持的接口模式
MODES = [m.lower() for m in getattr(Config, 'api_mode_cycle', ['optimize', 'transcribe', 'translate'])]
if not MODES:
    MODES = ['optimize', 'transcribe', 'translate']


def cycle_api_mode():
    """切换接口模式并显示提示。"""
    current = getattr(Cosmic, 'api_mode', MODES[0] if MODES else 'optimize').lower()
    try:
        idx = MODES.index(current)
    except ValueError:
        idx = 0
    new_mode = MODES[(idx + 1) % len(MODES)] if MODES else 'optimize'
    Cosmic.api_mode = new_mode
    label_map = {
        'transcribe': '仅语音识别',
        'optimize': '语音识别 + 文本优化',
        'translate': '语音识别 + 翻译',
    }
    console.print(f"[cyan]接口模式已切换为：{label_map.get(new_mode, new_mode)}[/]")


def shortcut_correct(e: keyboard.KeyboardEvent) -> bool:
    expected = keyboard.normalize_name(Config.shortcut).replace('left ', '')
    actual = (e.name or '').replace('left ', '')
    return expected == actual


def launch_task():
    global task
    start_time = time.time()
    asyncio.run_coroutine_threadsafe(
        Cosmic.queue_in.put({'type': 'begin', 'time': start_time, 'data': None}),
        Cosmic.loop,
    )
    Cosmic.on = start_time
    status.start()
    task = asyncio.run_coroutine_threadsafe(send_audio(), Cosmic.loop)


def cancel_task():
    Cosmic.on = False
    status.stop()
    if not task.done():
        task.cancel()


def finish_task():
    global task
    Cosmic.on = False
    status.stop()
    asyncio.run_coroutine_threadsafe(
        Cosmic.queue_in.put({'type': 'finish', 'time': time.time(), 'data': None}),
        Cosmic.loop,
    )


def count_down(flag: Event):
    time.sleep(Config.threshold)
    flag.set()


def manage_task(flag: Event):
    already_running = bool(Cosmic.on)
    if not already_running:
        launch_task()

    if flag.wait(timeout=Config.threshold * 0.8):
        if Cosmic.on and already_running:
            finish_task()
    else:
        if not already_running:
            cancel_task()
        keyboard.send(Config.shortcut)


def click_mode(e: keyboard.KeyboardEvent):
    global pressed, released, event

    if e.event_type == 'down' and released:
        pressed, released = True, False
        event = Event()
        pool.submit(count_down, event)
        pool.submit(manage_task, event)
    elif e.event_type == 'up' and pressed:
        pressed, released = False, True
        event.set()


def hold_mode(e: keyboard.KeyboardEvent):
    if e.event_type == 'down' and not Cosmic.on:
        launch_task()
    elif e.event_type == 'up':
        duration = time.time() - (Cosmic.on or time.time())
        if duration < Config.threshold:
            cancel_task()
        else:
            finish_task()
            if Config.restore_key:
                time.sleep(0.01)
                keyboard.send(Config.shortcut)


def hold_handler(e: keyboard.KeyboardEvent):
    if shortcut_correct(e):
        hold_mode(e)


def click_handler(e: keyboard.KeyboardEvent):
    if shortcut_correct(e):
        click_mode(e)


def bond_shortcut():
    if Config.hold_mode:
        keyboard.hook_key(Config.shortcut, hold_handler, suppress=Config.suppress)
    else:
        keyboard.hook_key(Config.shortcut, click_handler, suppress=True)

    mode_hotkey = getattr(Config, 'mode_hotkey', None)
    if mode_hotkey:
        try:
            keyboard.add_hotkey(mode_hotkey, cycle_api_mode, suppress=False)
        except Exception as exc:
            console.print(f"[red]注册模式切换热键失败: {exc}[/]")
