"""LED state machine — mutually exclusive states, no conflicting outputs."""

from __future__ import annotations

import enum
import logging
import threading

from .gpio_adapter import GPIOAdapter

logger = logging.getLogger(__name__)


class LEDState(enum.Enum):
    READY = "ready"  # solid green
    CAPTURING = "capturing"  # blink green
    UPLOADING = "uploading"  # fast blink green
    QUEUED = "queued"  # slow blink green + solid red
    ERROR = "error"  # solid red
    SHUTDOWN = "shutdown"  # all off


_BLINK_FAST = 0.15
_BLINK_SLOW = 0.5
_BLINK_CAPTURE = 0.3


class LEDController:
    """Thread-safe LED state machine."""

    def __init__(self, gpio: GPIOAdapter, green_pin: int, red_pin: int) -> None:
        self._gpio = gpio
        self._green = green_pin
        self._red = red_pin
        self._state = LEDState.SHUTDOWN
        self._lock = threading.Lock()
        self._blink_thread: threading.Thread | None = None
        self._stop_event = threading.Event()

    @property
    def state(self) -> LEDState:
        return self._state

    def transition(self, new_state: LEDState) -> None:
        with self._lock:
            if self._state == new_state:
                return
            logger.debug("LED: %s -> %s", self._state.value, new_state.value)
            self._state = new_state
            self._stop_blink()
            self._apply()

    def _stop_blink(self) -> None:
        if self._blink_thread and self._blink_thread.is_alive():
            self._stop_event.set()
            self._blink_thread.join(timeout=2.0)
            self._stop_event.clear()

    def _apply(self) -> None:
        s = self._state
        if s == LEDState.READY:
            self._gpio.set_led(self._green, True)
            self._gpio.set_led(self._red, False)
        elif s == LEDState.CAPTURING:
            self._gpio.set_led(self._red, False)
            self._start_blink(self._green, _BLINK_CAPTURE)
        elif s == LEDState.UPLOADING:
            self._gpio.set_led(self._red, False)
            self._start_blink(self._green, _BLINK_FAST)
        elif s == LEDState.QUEUED:
            self._gpio.set_led(self._red, True)
            self._start_blink(self._green, _BLINK_SLOW)
        elif s == LEDState.ERROR:
            self._gpio.set_led(self._green, False)
            self._gpio.set_led(self._red, True)
        elif s == LEDState.SHUTDOWN:
            self._gpio.set_led(self._green, False)
            self._gpio.set_led(self._red, False)

    def _start_blink(self, pin: int, interval: float) -> None:
        stop = self._stop_event

        def _blink() -> None:
            state = False
            while not stop.is_set():
                state = not state
                try:
                    self._gpio.set_led(pin, state)
                except Exception:
                    break
                stop.wait(interval)
            self._gpio.set_led(pin, False)

        self._blink_thread = threading.Thread(target=_blink, daemon=True)
        self._blink_thread.start()

    def shutdown(self) -> None:
        self.transition(LEDState.SHUTDOWN)
        self._stop_blink()
