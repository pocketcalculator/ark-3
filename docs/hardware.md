# Hardware Guide

> ⚠️ **SANDBOX / NON-PRODUCTION ONLY.** No hardware assembly or validation has been performed by the development team. All instructions require manual verification. Electrical wiring carries risk of component damage; work carefully and follow the safety notes in this document.

---

## Bill of materials summary

See [BOM.md](../BOM.md) for complete specs, quantities, and price estimates. Key components:

| Component | Key spec |
|---|---|
| Raspberry Pi Zero 2 W | 64-bit quad-core ARM Cortex-A53, 512 MB RAM, micro-USB power |
| Camera Module 3 | 12 MP Sony IMX708, autofocus, 75° FoV (standard) or 102° (wide) |
| Pi Zero camera cable | **22-contact 0.5 mm pitch** end for Pi Zero 2 W ↔ **15-contact 1.0 mm pitch** end for Camera Module 3. **Not included** with Camera Module 3 — must be purchased separately. |
| Push button | 12 mm tactile momentary, normally open |
| Green LED | Any standard 3 mm or 5 mm LED, Vf ≈ 2.0–2.2 V |
| Red LED | Any standard 3 mm or 5 mm LED, Vf ≈ 1.9–2.1 V |
| Resistors | 330 Ω (×2 for LEDs), 10 kΩ optional (button pull-up; software pull-up used) |
| USB-C power supply | 5 V ≥ 2.5 A continuous; official Raspberry Pi power supply recommended |
| MicroSD card | ≥ 16 GB, Class 10 / A1 or better |

---

## Raspberry Pi Zero 2 W — physical overview

The Pi Zero 2 W has:
- A 40-pin GPIO header (unpopulated by default; must be soldered before use)
- A CSI camera connector (**22 contacts, 0.5 mm pitch** FFC — this is the Pi Zero mini CSI connector; the Camera Module 3 board connector is a different format: 15 contacts, 1.0 mm pitch — see Camera section below)
- One micro-USB OTG port (data + power when using a split cable; power-only with a standard cable)
- One micro-USB power-only port (labeled PWR IN)

**References:**
- [Camera Module 3 product page — specifications and cable compatibility](https://www.raspberrypi.com/products/camera-module-3/) _(accessed 2026-08-13)_
- [Pi Zero 2 W datasheet / hardware design files](https://datasheets.raspberrypi.com/rpizero2w/raspberry-pi-zero-2-w-product-brief.pdf) _(accessed 2026-08-13)_
- [Camera Module 3 documentation](https://www.raspberrypi.com/documentation/accessories/camera.html) _(accessed 2026-08-13)_

---

## GPIO header pinout (40-pin)

The Pi Zero 2 W shares the standard 40-pin Raspberry Pi header layout.

| Header Pin | BCM | Function | Used by ark-3 |
|---|---|---|---|
| 1 | — | 3.3 V power | Reference only |
| 2 | — | 5 V power | **Do not connect to GPIO** |
| 6 | — | GND | Common ground |
| 9 | — | GND | Common ground |
| 11 | BCM 17 | GPIO (button input) | ✅ Button |
| 13 | BCM 27 | GPIO (green LED output) | ✅ Green LED |
| 15 | BCM 22 | GPIO (red LED output) | ✅ Red LED |
| 14 | — | GND | Common ground for LEDs |
| 17 | — | 3.3 V | Reference only |
| 20 | — | GND | Additional GND |

> **⚠️ All GPIO pins operate at 3.3 V logic levels. Never apply 5 V to any GPIO pin — this will permanently damage the SoC.**

Full pinout reference: [pinout.xyz](https://pinout.xyz) _(accessed 2026-08-13)_

BCM pin numbers are the values used in software (gpiozero and the config file). Header pin numbers are the physical connector positions (counting left-to-right, top-to-bottom with USB ports on the right).

---

## GPIO wiring detail

### Button (BCM 17 — Header Pin 11)

```
3.3V (Pin 1) ──── [10kΩ pull-up, optional] ────┐
                                                 │
GPIO BCM17 (Pin 11) ──────────────────────────┤
                                                 │
GND (Pin 9) ──── [Button, normally open] ────────┘
```

Software uses `gpiozero.Button(pin, pull_up=True)`, which enables the internal BCM pull-up. The external 10 kΩ resistor is optional but adds robustness against long wire runs. Debounce is configured at 50 ms (`debounce_ms: 50` in config).

When the button is pressed, BCM17 is pulled LOW → gpiozero fires `when_pressed`.

### Green LED (BCM 27 — Header Pin 13)

```
GPIO BCM27 (Pin 13) ──── [330 Ω] ──── [LED anode (+)] ──── [LED cathode (−)] ──── GND (Pin 14)
```

The 330 Ω resistor limits current to approximately (3.3 V − 2.1 V) / 330 Ω ≈ 3.6 mA — safe for the GPIO pin (max 16 mA per pin, 50 mA total).

### Red LED (BCM 22 — Header Pin 15)

```
GPIO BCM22 (Pin 15) ──── [330 Ω] ──── [LED anode (+)] ──── [LED cathode (−)] ──── GND (Pin 20)
```

Same resistor calculation as green LED.

### LED state meanings

| State | Green | Red | Meaning |
|---|---|---|---|
| READY | Slow blink (1 Hz) | Off | Ready for button press |
| CAPTURING | On | Off | Camera capturing |
| UPLOADING | Fast blink (5 Hz) | Off | Upload in progress |
| QUEUED | Double blink | Off | Items queued, uploading |
| ERROR | Off | On (3 s) | Capture or upload error |
| SHUTDOWN | Off | Off | Service stopping |

---

## Camera Module 3 — cable and connector

> **⚠️ Critical: Cable orientation matters. Incorrect insertion can damage the camera, the flex cable, or the Pi.**

The Camera Module 3 requires a **Pi Zero camera cable** (also called a Zero camera adapter cable):
- **22-contact, 0.5 mm pitch end → Pi Zero 2 W** CSI camera connector
- **15-contact, 1.0 mm pitch end → Camera Module 3** board connector (per official spec: `15 × 1 mm FPC`)

These connectors are different formats. **The standard cable included with Camera Module 3 is not compatible with the Pi Zero 2 W** — the official Raspberry Pi product page states this explicitly. Purchase the Pi Zero camera cable separately from an Approved Reseller (Pimoroni, Adafruit, Vilros, SparkFun).

**Pi Zero 2 W camera connector (22-contact, 0.5 mm pitch):**
- Lift the locking tab gently upward.
- Insert the **22-contact end** of the Pi Zero camera cable. Consult the board silkscreen and locking tab orientation — the correct contact face direction is marked on the Pi board. Refer to the [official camera installation guide](https://www.raspberrypi.com/documentation/accessories/camera.html) for step-by-step photos.
- Push the cable fully in until seated, then close the locking tab firmly.

**Camera Module 3 connector (15-contact, 1.0 mm pitch):**
- Lift the locking tab upward.
- Insert the **15-contact end** of the Pi Zero camera cable. Refer to the board silkscreen and the official installation guide for correct orientation.
- Push fully in and close the locking tab.

**Do not force the cable.** If resistance is felt, check orientation and try again.

**References:**
- [Camera Module 3 product page — specifications and cable compatibility](https://www.raspberrypi.com/products/camera-module-3/) _(accessed 2026-08-13)_
- [Camera Module 3 documentation](https://www.raspberrypi.com/documentation/accessories/camera.html) _(accessed 2026-08-13)_

---

## Power supply

- Use the official **Raspberry Pi micro-USB power supply** rated at **5.1 V / 2.5 A or greater**.
- USB power banks must support **continuous current draw** — many power banks cut off automatically after detecting low current (idle Pi). Look for power banks with a "continuous mode" or "always-on" feature.
- Do **not** power the Pi from a PC USB port (limited to 500 mA at 5 V; may cause brownout).
- Do **not** wire raw Li-ion cells without a proper battery protection/charge controller board. Use only commercially made power banks or official Pi supplies.

### Power bank battery runtime estimate

Use the following formula to estimate runtime. This is a planning estimate only; actual runtime depends on power bank efficiency, battery age, and load profile.

```
Runtime (hours) ≈ (Power bank capacity mAh × efficiency × 0.001) / average draw (A)
```

| Parameter | Typical value |
|---|---|
| Pi Zero 2 W idle | ~120 mA @ 5 V |
| Pi Zero 2 W active (CPU + camera) | ~400–500 mA @ 5 V |
| Average (infrequent captures) | ~150–200 mA |
| Efficiency factor (power bank conversion) | 0.80–0.90 |

**Example (10,000 mAh power bank, 0.85 efficiency, 175 mA average draw):**
```
Runtime ≈ (10,000 × 0.85) / 175 ≈ 48.6 hours
```

> **This is an estimate.** Measure actual draw with a USB power meter for your specific setup. Record measured values in the worksheet below.

### Measured runtime worksheet

| Date | Power bank capacity (mAh) | Measured avg draw (mA) | Measured runtime (hours) | Notes |
|---|---|---|---|---|
| — | — | — | — | — |

---

## Anti-static and insulation safety

- Always use an **anti-static wrist strap** connected to a ground point before handling the Pi or camera.
- Place the Pi on a **non-conductive surface** (e.g., anti-static foam mat, cardboard — not bare metal).
- Inspect all wires for insulation damage before powering on.
- Ensure no conductive wire or component can contact the Pi circuit board.
- Apply **strain relief** (cable tie, foam tape) to all wires at connection points to prevent connectors from being pulled loose during use.

---

## Safe shutdown and brownout prevention

- Always shut down cleanly before removing power: `sudo shutdown -h now` or let the service handle `SIGTERM`.
- Unexpected power loss (brownout) can corrupt the SD card filesystem. Use a UPS, power bank with battery protection, or the official Raspberry Pi UPS HAT if reliable power is required.
- The `ark3-capture` service captures a lock file at `/var/run/ark3/ark3-capture.lock`; a stale lock after an unclean shutdown is automatically overwritten on next start.

---

## Portability, enclosure, and thermal notes

- The Pi Zero 2 W generates moderate heat under load (CPU cores active during image processing). Ensure adequate ventilation in any enclosure.
- If enclosing in a case, do not seal the ventilation holes unless a thermal pad or heatsink is attached.
- For outdoor or high-humidity use, consider a weatherproof project box and apply conformal coating to the PCB (except connectors).
- The camera must have a clear line of sight through the enclosure; use optical-quality acrylic or a cutout, not opaque material.

---

## Assembly checklist

- [ ] Anti-static wrist strap on
- [ ] GPIO header soldered (if not pre-populated)
- [ ] Pi Zero camera cable connected — 22-contact/0.5 mm end into Pi Zero 2 W CSI connector, 15-contact/1.0 mm end into Camera Module 3; follow board silkscreen and official installation guide for contact orientation
- [ ] Camera Module 3 locking tab closed
- [ ] Button wired: one terminal to BCM17 (Header Pin 11), other terminal to GND
- [ ] Green LED wired: BCM27 (Pin 13) → 330 Ω → LED anode → cathode → GND
- [ ] Red LED wired: BCM22 (Pin 15) → 330 Ω → LED anode → cathode → GND
- [ ] No 5 V signals on any GPIO pin
- [ ] Strain relief on all wiring
- [ ] No bare conductors contacting the PCB
- [ ] Power supply ≥ 2.5 A at 5 V
- [ ] MicroSD card inserted
- [ ] Pi OS installed and camera interface enabled (`raspi-config`)
- [ ] Camera tested: `libcamera-still -o test.jpg`
- [ ] Service installed and token provisioned (see [docs/how-to.md](how-to.md))
- [ ] All GPIO pins verified with `python3 -c "from gpiozero import LED; l=LED(27); l.on()"` before service start
