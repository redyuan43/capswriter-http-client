import math
import threading
import time
from platform import system
from queue import Empty, Queue
from typing import Any, Optional

try:
    import tkinter as tk
except Exception:  # pragma: no cover
    tk = None


IS_WINDOWS = system().lower().startswith("win")


class _ConsoleOverlay:
    def start(self) -> None:
        return

    def show_status(self, message: str, *, animate: bool = True, color: str = "#22c55e") -> None:
        print(f"[overlay] status={message!r} animate={animate} color={color}")

    def flash_message(
        self,
        message: str,
        *,
        duration_ms: int = 1800,
        animate: bool = False,
        color: Optional[str] = None,
    ) -> None:
        print(f"[overlay] flash={message!r} animate={animate} color={color} duration={duration_ms}")

    def update_transcript(self, text: str) -> None:
        if text:
            print(f"[overlay] transcript={text!r}")

    def append_message(self, message: str) -> None:
        if message:
            print(f"[overlay] message={message!r}")

    def hide(self, *, delay_ms: int = 0) -> None:
        return


class StatusOverlay:
    _WINDOW_WIDTH = 320
    _WINDOW_HEIGHT = 176
    _BACKGROUND = "#0f0f10" if IS_WINDOWS else "#0f172a"
    _STATUS_COLOR = "#ffffff"
    _SECONDARY_COLOR = "#d4d4d8"
    _BAR_COLOR = "#1e293b"
    _ACCENT_DEFAULT = "#22c55e"

    def __init__(self) -> None:
        self._thread: Optional[threading.Thread] = None
        self._queue: "Queue[tuple[Any, ...]]" = Queue()
        self._running = threading.Event()

        self._status_text = "CapsWriter"
        self._status_animate = False
        self._accent_color = self._ACCENT_DEFAULT
        self._animation_style = "bars"
        self._message_lines: list[str] = []

        self._root: Optional[tk.Tk] = None
        self._canvas: Optional[tk.Canvas] = None
        self._status_label: Optional[tk.Label] = None
        self._bar_ids: list[int] = []
        self._bar_centers: list[float] = []
        self._dot_ids: list[int] = []
        self._dot_centers: list[float] = []

        self._flash_after: Optional[str] = None
        self._hide_after: Optional[str] = None
        self._queue_after: Optional[str] = None
        self._animation_after: Optional[str] = None

        self._visible = False
        self._drag_start: Optional[tuple[int, int, int, int]] = None

    # ------------------------------------------------------------------ API
    def start(self) -> None:
        if tk is None:
            return
        if self._thread and self._thread.is_alive():
            return
        self._running.set()
        self._thread = threading.Thread(target=self._run, name="CapsWriterOverlay", daemon=True)
        self._thread.start()

    def show_status(
        self,
        message: str,
        *,
        animate: bool = True,
        color: str = _ACCENT_DEFAULT,
        style: Optional[str] = None,
    ) -> None:
        self._enqueue(("status", message, animate, color, style))

    def flash_message(
        self,
        message: str,
        *,
        duration_ms: int = 1800,
        animate: bool = False,
        color: Optional[str] = None,
        style: Optional[str] = None,
    ) -> None:
        self._enqueue(("flash", message, animate, duration_ms, color or self._accent_color, style))

    def update_transcript(self, text: str) -> None:
        self._enqueue(("transcript", text))

    def append_message(self, message: str) -> None:
        self._enqueue(("append", message))

    def hide(self, *, delay_ms: int = 0) -> None:
        self._enqueue(("hide", delay_ms))

    # ----------------------------------------------------------------- internals
    def _enqueue(self, event: tuple[Any, ...]) -> None:
        self.start()
        self._queue.put(event)

    def _run(self) -> None:
        assert tk is not None

        self._root = tk.Tk()
        self._root.title("CapsWriter Overlay")
        self._root.overrideredirect(True)
        self._root.configure(bg=self._BACKGROUND)
        self._root.wm_attributes("-topmost", True)
        try:
            self._root.wm_attributes("-toolwindow", True)
            self._root.wm_attributes("-alpha", 0.97)
        except Exception:
            pass
        if IS_WINDOWS:
            try:
                self._root.wm_attributes("-transparentcolor", self._BACKGROUND)
            except Exception:
                pass

        screen_w = self._root.winfo_screenwidth()
        screen_h = self._root.winfo_screenheight()
        x = max(8, screen_w // 2 - self._WINDOW_WIDTH // 2)
        y = max(32, screen_h - self._WINDOW_HEIGHT - 120)
        self._root.geometry(f"{self._WINDOW_WIDTH}x{self._WINDOW_HEIGHT}+{x}+{y}")
        self._root.bind("<ButtonPress-1>", self._start_drag)
        self._root.bind("<B1-Motion>", self._perform_drag)

        self._build_ui()
        self._set_visibility(False)

        self._schedule_queue_pump()
        self._schedule_animation()

        try:
            self._root.mainloop()
        finally:
            self._running.clear()
            self._root = None

    def _build_ui(self) -> None:
        assert self._root is not None

        container = tk.Frame(
            self._root,
            bg=self._BACKGROUND,
            padx=16,
            pady=16,
        )
        container.pack(fill="both", expand=True)

        self._canvas = tk.Canvas(
            container,
            width=84,
            height=84,
            bg=self._BACKGROUND,
            highlightthickness=0,
            bd=0,
        )
        self._canvas.pack(pady=(0, 10))

        start_x = 30
        spacing = 12
        self._bar_ids = []
        self._bar_centers = []
        for idx in range(3):
            cx = start_x + idx * spacing
            bar = self._canvas.create_rectangle(cx - 3, 54 - 12, cx + 3, 54, fill=self._BAR_COLOR, outline="")
            self._bar_ids.append(bar)
            self._bar_centers.append(cx)

        self._dot_radius = 5
        self._dot_centers = []
        self._dot_ids = []
        dot_start = 30
        dot_spacing = 12
        for idx in range(3):
            cx = dot_start + idx * dot_spacing
            dot = self._canvas.create_oval(
                cx - self._dot_radius,
                54 - self._dot_radius,
                cx + self._dot_radius,
                54 + self._dot_radius,
                fill=self._BAR_COLOR,
                outline="",
            )
            self._dot_ids.append(dot)
            self._dot_centers.append(cx)

        text_frame = tk.Frame(self._root, bg=self._BACKGROUND)
        text_frame.pack(fill="both", expand=True, padx=16)

        self._status_label = tk.Label(
            text_frame,
            text=self._status_text,
            font=("Microsoft YaHei", 10, "bold"),
            fg=self._STATUS_COLOR,
            bg=self._BACKGROUND,
            anchor="w",
            justify="left",
        )
        self._status_label.pack(fill="x")

    # --------------------------- queue / animation
    def _schedule_queue_pump(self) -> None:
        if not self._root or not self._running.is_set():
            return
        self._pump_queue()
        self._queue_after = self._root.after(60, self._schedule_queue_pump)

    def _pump_queue(self) -> None:
        while True:
            try:
                event = self._queue.get_nowait()
            except Empty:
                break

            kind = event[0]
            payload = event[1:]

            if kind == "status":
                message, animate, color, style = payload
                self._set_visibility(True)
                self._status_text = message
                self._status_animate = bool(animate)
                self._accent_color = color
                if style:
                    self._set_animation_style(style)
                self._apply_status()
            elif kind == "flash":
                message, animate, duration_ms, color, style = payload
                self._handle_flash(message, bool(animate), int(duration_ms), color, style)
            elif kind == "transcript":
                (text,) = payload
                self._message_lines = []
                if text:
                    for line in text.splitlines():
                        self._append_message(line)
                else:
                    self._render_status_line()
            elif kind == "append":
                (message,) = payload
                self._append_message(message)
            elif kind == "hide":
                (delay_ms,) = payload
                self._handle_hide(int(delay_ms))

    def _schedule_animation(self) -> None:
        if not self._root or not self._running.is_set():
            return
        self._animate_step()
        self._animation_after = self._root.after(70, self._schedule_animation)

    def _animate_step(self) -> None:
        if not self._canvas:
            return
        if self._animation_style == "dots":
            self._animate_dots()
            self._reset_bars()
        elif self._animation_style == "bars":
            self._animate_bars()
            self._reset_dots()
        else:
            self._reset_bars()
            self._reset_dots()

    def _animate_bars(self) -> None:
        if not self._status_animate or not self._visible:
            self._reset_bars()
            return
        now = time.time()
        for idx, bar in enumerate(self._bar_ids):
            phase = now * 7.5 + idx * 1.1
            amplitude = (math.sin(phase) + 1) / 2
            height = 12 + amplitude * 18
            cx = self._bar_centers[idx]
            self._canvas.coords(bar, cx - 3, 60 - height, cx + 3, 60)

    def _reset_bars(self) -> None:
        for idx, bar in enumerate(self._bar_ids):
            cx = self._bar_centers[idx]
            height = [16, 24, 14][idx % 3]
            self._canvas.coords(bar, cx - 3, 60 - height, cx + 3, 60)

    def _animate_dots(self) -> None:
        if not self._status_animate or not self._visible:
            self._reset_dots()
            return
        now = time.time()
        for idx, dot in enumerate(self._dot_ids):
            phase = now * 6.2 + idx * 0.9
            offset = math.sin(phase) * 8
            cx = self._dot_centers[idx]
            self._canvas.coords(dot, cx - self._dot_radius, 58 + offset, cx + self._dot_radius, 68 + offset)

    def _reset_dots(self) -> None:
        for idx, dot in enumerate(self._dot_ids):
            cx = self._dot_centers[idx]
            self._canvas.coords(dot, cx - self._dot_radius, 58, cx + self._dot_radius, 68)

    # --------------------------- rendering helpers
    def _apply_status(self) -> None:
        if not self._status_label:
            return
        accent = self._accent_color or self._ACCENT_DEFAULT
        self._status_label.config(text=self._status_text, fg=self._STATUS_COLOR)

        if self._canvas:
            bars_active = self._animation_style == "bars" and self._status_animate
            dots_active = self._animation_style == "dots" and self._status_animate
            bar_color = accent if bars_active else self._BAR_COLOR
            dot_color = accent if dots_active else self._BAR_COLOR
            for bar in self._bar_ids:
                self._canvas.itemconfigure(bar, fill=bar_color)
            for dot in self._dot_ids:
                self._canvas.itemconfigure(dot, fill=dot_color)
        self._render_status_line()

    def _append_message(self, message: str) -> None:
        line = (message or "").strip()
        if not line:
            return
        self._message_lines.append(line)
        if len(self._message_lines) > 6:
            self._message_lines = self._message_lines[-6:]
        self._render_status_line()

    def _render_status_line(self) -> None:
        if not self._status_label:
            return
        extra = " | ".join(self._message_lines[-2:])
        if extra:
            self._status_label.config(text=f"{self._status_text}  |  {extra}")
        else:
            self._status_label.config(text=self._status_text)

    # ------------------------------- visibility & hide
    def _handle_flash(self, message: str, animate: bool, duration_ms: int, color: str, style: Optional[str]) -> None:
        if not self._root:
            return
        self._cancel_flash()
        self._cancel_hide()
        self._set_visibility(True)

        previous = (
            self._status_text,
            self._status_animate,
            self._accent_color,
            self._animation_style,
        )
        self._status_text = message
        self._status_animate = animate
        self._accent_color = color
        if style:
            self._set_animation_style(style)
        self._apply_status()

        min_duration = max(300, duration_ms)

        def restore() -> None:
            (
                self._status_text,
                self._status_animate,
                self._accent_color,
                self._animation_style,
            ) = previous
            self._set_animation_style(None)
            self._flash_after = None
            self._apply_status()

        self._flash_after = self._root.after(min_duration, restore)
        self._schedule_hide(min_duration + 180)

    def _handle_hide(self, delay_ms: int) -> None:
        if not self._root:
            return
        if delay_ms <= 0:
            self._cancel_hide()
            self._set_visibility(False)
            return
        self._schedule_hide(delay_ms)

    def _schedule_hide(self, delay_ms: int) -> None:
        if not self._root:
            return
        self._cancel_hide()
        self._hide_after = self._root.after(delay_ms, lambda: self._set_visibility(False))

    def _set_visibility(self, visible: bool) -> None:
        if not self._root:
            return
        if visible and not self._visible:
            self._root.deiconify()
            self._root.lift()
            self._visible = True
        elif not visible and self._visible:
            self._root.withdraw()
            self._visible = False

    def _set_animation_style(self, style: Optional[str]) -> None:
        if not self._canvas:
            return
        if style:
            self._animation_style = style
        state_bars = "normal" if self._animation_style == "bars" else "hidden"
        state_dots = "normal" if self._animation_style == "dots" else "hidden"
        for bar in self._bar_ids:
            self._canvas.itemconfigure(bar, state=state_bars)
        for dot in self._dot_ids:
            self._canvas.itemconfigure(dot, state=state_dots)
        self._reset_bars()
        self._reset_dots()

    def _cancel_flash(self) -> None:
        if self._root and self._flash_after:
            self._root.after_cancel(self._flash_after)
            self._flash_after = None

    def _cancel_hide(self) -> None:
        if self._root and self._hide_after:
            self._root.after_cancel(self._hide_after)
            self._hide_after = None

    # ------------------------------- drag support
    def _start_drag(self, event: Any) -> None:
        if not self._root:
            return
        self._drag_start = (
            event.x_root,
            event.y_root,
            self._root.winfo_rootx(),
            self._root.winfo_rooty(),
        )

    def _perform_drag(self, event: Any) -> None:
        if not self._root or not self._drag_start:
            return
        sx, sy, ox, oy = self._drag_start
        dx = event.x_root - sx
        dy = event.y_root - sy
        self._root.geometry(f"+{ox + dx}+{oy + dy}")


if tk is None:
    overlay: _ConsoleOverlay | StatusOverlay = _ConsoleOverlay()
else:
    overlay = StatusOverlay()
