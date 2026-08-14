"""GPIO abstraction — real gpiozero or mock implementation."""

from __future__ import annotations

import abc
import contextlib
import logging
from collections.abc import Callable
from typing import Any

logger = logging.getLogger(__name__)


class GPIOAdapter(abc.ABC):
    """Abstraction over GPIO: button and LEDs."""

    @abc.abstractmethod
    def setup_button(self, pin: int, debounce_ms: int, callback: Callable[[], None]) -> None:
        """Register a callback for button press (falling edge after debounce)."""

    @abc.abstractmethod
    def set_led(self, pin: int, state: bool) -> None:
        """Set an LED on (True) or off (False)."""

    @abc.abstractmethod
    def close(self) -> None:
        """Release all GPIO resources."""


class GpiozeroAdapter(GPIOAdapter):
    """Live adapter using gpiozero."""

    def __init__(self) -> None:
        from gpiozero import LED, Button  # noqa: PLC0415

        self._Button = Button
        self._LED = LED
        self._leds: dict[int, Any] = {}
        self._buttons: dict[int, Any] = {}

    def setup_button(self, pin: int, debounce_ms: int, callback: Callable[[], None]) -> None:
        from gpiozero import Button  # noqa: PLC0415

        btn = Button(pin, pull_up=True, bounce_time=debounce_ms / 1000.0)
        btn.when_pressed = callback
        self._buttons[pin] = btn
        logger.debug("Button on BCM%d debounce=%.0fms", pin, debounce_ms)

    def set_led(self, pin: int, state: bool) -> None:
        if pin not in self._leds:
            from gpiozero import LED  # noqa: PLC0415

            self._leds[pin] = LED(pin)
        led = self._leds[pin]
        led.on() if state else led.off()

    def close(self) -> None:
        for dev in list(self._buttons.values()) + list(self._leds.values()):
            with contextlib.suppress(Exception):
                dev.close()
        self._buttons.clear()
        self._leds.clear()


class MockGPIOAdapter(GPIOAdapter):
    """Mock GPIO for local development — logs state changes."""

    def __init__(self) -> None:
        self._leds: dict[int, bool] = {}
        self._callbacks: dict[int, Callable[[], None]] = {}

    def setup_button(self, pin: int, debounce_ms: int, callback: Callable[[], None]) -> None:
        self._callbacks[pin] = callback
        logger.info("MockGPIO: button registered on BCM%d (debounce=%dms)", pin, debounce_ms)

    def simulate_press(self, pin: int) -> None:
        """Test helper: simulate a button press."""
        if pin in self._callbacks:
            self._callbacks[pin]()

    def set_led(self, pin: int, state: bool) -> None:
        prev = self._leds.get(pin)
        self._leds[pin] = state
        if prev != state:
            logger.info("MockGPIO: LED BCM%d -> %s", pin, "ON" if state else "OFF")

    def get_led(self, pin: int) -> bool:
        return self._leds.get(pin, False)

    def close(self) -> None:
        logger.info("MockGPIO: closed")


def build_gpio(mock_mode: bool) -> GPIOAdapter:
    if mock_mode:
        return MockGPIOAdapter()
    return GpiozeroAdapter()
