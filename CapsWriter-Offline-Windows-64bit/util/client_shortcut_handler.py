# -*- coding: utf-8 -*-
import asyncio
import time
from concurrent.futures import ThreadPoolExecutor
from threading import Event

import keyboard

from config import ClientConfig as Config
from util.client_cosmic import Cosmic, console
from util.client_send_audio import send_audio
from util.status_overlay import overlay
from util.my_status import Status

task = asyncio.Future()
status = Status("\u5f00\u59cb\u5f55\u97f3", spinner="point")
pool = ThreadPoolExecutor()
pressed = False
released = True
event = Event()

MODES = [m.lower() for m in getattr(Config, "api_mode_cycle", ["optimize", "transcribe", "translate"])]
if not MODES:
    MODES = ["optimize", "transcribe", "translate"]


def cycle_api_mode():
    current = getattr(Cosmic, "api_mode", MODES[0] if MODES else "optimize").lower()
    try:
        idx = MODES.index(current)
    except ValueError:
        idx = 0
    new_mode = MODES[(idx + 1) % len(MODES)] if MODES else "optimize"
    Cosmic.api_mode = new_mode
    label_map = {
        "transcribe": "\u4ec5\u8bed\u97f3\u8bc6\u522b",
        "optimize": "\u8bed\u97f3\u8bc6\u522b + \u6587\u672c\u4f18\u5316",
        "translate": "\u8bed\u97f3\u8bc6\u522b + \u7ffb\u8bd1",
    }
    overlay.update_transcript("")
    overlay.flash_message(label_map.get(new_mode, new_mode), duration_ms=2000, animate=False)
    console.print(f"[cyan]\u63a5\u53e3\u6a21\u5f0f\u5df2\u5207\u6362\u4e3a\uff1a{label_map.get(new_mode, new_mode)}[/]")


def shortcut_correct(e: keyboard.KeyboardEvent) -> bool:
    expected = keyboard.normalize_name(Config.shortcut).replace("left ", "")
    actual = (e.name or "").replace("left ", "")
    return expected == actual


def launch_task():
    global task
    start_time = time.time()
    asyncio.run_coroutine_threadsafe(
        Cosmic.queue_in.put({"type": "begin", "time": start_time, "data": None}),
        Cosmic.loop,
    )
    Cosmic.on = start_time
    status.start()
    overlay.show_status("\u6b63\u5728\u5f55\u97f3...", animate=True, color="#22c55e", style="dots")
    overlay.update_transcript("")
    task = asyncio.run_coroutine_threadsafe(send_audio(), Cosmic.loop)


def cancel_task():
    Cosmic.on = False
    status.stop()
    overlay.show_status("\u5f55\u97f3\u5df2\u53d6\u6d88", animate=False, color="#f97316")
    overlay.update_transcript("")
    overlay.hide(delay_ms=600)
    if not task.done():
        task.cancel()


def finish_task():
    Cosmic.on = False
    status.stop()
    overlay.show_status("\u5904\u7406\u4e2d...", animate=True, color="#22c55e", style="bars")
    asyncio.run_coroutine_threadsafe(
        Cosmic.queue_in.put({"type": "finish", "time": time.time(), "data": None}),
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

    if e.event_type == "down" and released:
        pressed, released = True, False
        event = Event()
        pool.submit(count_down, event)
        pool.submit(manage_task, event)
    elif e.event_type == "up" and pressed:
        pressed, released = False, True
        event.set()


def hold_mode(e: keyboard.KeyboardEvent):
    if e.event_type == "down" and not Cosmic.on:
        launch_task()
    elif e.event_type == "up":
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

    mode_hotkey = getattr(Config, "mode_hotkey", None)
    if mode_hotkey:
        try:
            keyboard.add_hotkey(mode_hotkey, cycle_api_mode, suppress=False)
        except Exception as exc:
            console.print(f"[red]\u6ce8\u518c\u6a21\u5f0f\u5207\u6362\u70ed\u952e\u5931\u8d25: {exc}[/]")
