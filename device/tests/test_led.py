"""Tests for LED state machine transitions."""

from __future__ import annotations

import time

from ark3_device.gpio_adapter import MockGPIOAdapter
from ark3_device.led_controller import LEDController, LEDState

GREEN = 27
RED = 22


def _make_led() -> tuple[LEDController, MockGPIOAdapter]:
    gpio = MockGPIOAdapter()
    led = LEDController(gpio, GREEN, RED)
    return led, gpio


def test_ready_green_on_red_off() -> None:
    led, gpio = _make_led()
    led.transition(LEDState.READY)
    assert gpio.get_led(GREEN) is True
    assert gpio.get_led(RED) is False
    led.shutdown()


def test_error_red_on_green_off() -> None:
    led, gpio = _make_led()
    led.transition(LEDState.ERROR)
    time.sleep(0.05)
    assert gpio.get_led(RED) is True
    assert gpio.get_led(GREEN) is False
    led.shutdown()


def test_shutdown_all_off() -> None:
    led, gpio = _make_led()
    led.transition(LEDState.READY)
    led.shutdown()
    time.sleep(0.1)
    assert gpio.get_led(GREEN) is False
    assert gpio.get_led(RED) is False


def test_transition_sequence() -> None:
    led, gpio = _make_led()
    for state in [
        LEDState.READY,
        LEDState.CAPTURING,
        LEDState.UPLOADING,
        LEDState.QUEUED,
        LEDState.ERROR,
        LEDState.SHUTDOWN,
    ]:
        led.transition(state)
        time.sleep(0.05)
    led.shutdown()


def test_idempotent_transition() -> None:
    led, gpio = _make_led()
    led.transition(LEDState.READY)
    led.transition(LEDState.READY)  # second call should not crash
    assert led.state == LEDState.READY
    led.shutdown()


def test_state_reported_correctly() -> None:
    led, gpio = _make_led()
    led.transition(LEDState.UPLOADING)
    assert led.state == LEDState.UPLOADING
    led.shutdown()
