# Bill of Materials — ark-3

> **Price disclaimer:** All price estimates are approximate USD ranges as of **2026-08-13** and subject to change. Prices vary by supplier, region, and availability. Verify current pricing before purchase. Estimates are provided for planning purposes only; the development team makes no purchase recommendation or warranty of availability.
>
> Supplier links are provided for reference and are not affiliate links.

---

## Core electronics

| # | Component | Specification | Qty | Est. USD (each) | Notes |
|---|---|---|---|---|---|
| 1 | Raspberry Pi Zero 2 W | 64-bit quad-core Cortex-A53 @ 1 GHz, 512 MB LPDDR2, 2.4 GHz Wi-Fi, Bluetooth 4.2, micro-USB × 2, CSI camera connector (22-pin 0.5 mm pitch), 40-pin GPIO header | 1 | $15–$18 | Pre-soldered header variant (`Pi Zero 2 WH`) saves soldering; costs slightly more |
| 2 | Raspberry Pi Camera Module 3 | 12 MP Sony IMX708, autofocus (PDAF), 75° diagonal FoV, CSI-2 2-lane MIPI | 1 | $25–$30 | Standard FoV; wide-angle variant (102°) also compatible |
| 3 | Camera flex cable (Pi Zero camera cable) | 22-contact 0.5 mm pitch end (Pi Zero 2 W) to 15-contact 1.0 mm pitch end (Camera Module 3), length ≥ 150 mm | 1 | $3–$7 | **Not included** with Camera Module 3 — the standard cable shipped with the camera is for full-size Pi boards and is not compatible with the Pi Zero 2 W CSI connector. Purchase separately from any Raspberry Pi Approved Reseller. |
| 4 | Push button (momentary NO) | 12 mm tactile, normally open, through-hole or panel-mount | 1 | $0.50–$2 | Any standard momentary NO button; panel-mount variants for enclosures |
| 5 | Green LED | Standard 3 mm or 5 mm, Vf ≈ 2.0–2.2 V, any brightness | 1 | $0.10–$0.50 | |
| 6 | Red LED | Standard 3 mm or 5 mm, Vf ≈ 1.9–2.1 V | 1 | $0.10–$0.50 | |
| 7 | Resistor 330 Ω | 1/4 W, 5% tolerance | 2 | $0.05–$0.10 ea | LED current-limiting resistors |
| 8 | Resistor 10 kΩ | 1/4 W, 5% tolerance | 1 | $0.05–$0.10 | Button pull-up (optional; software pull-up used) |
| 9 | MicroSD card | ≥ 16 GB, Class 10, A1 or better; 32 GB recommended | 1 | $8–$15 | SanDisk Ultra A1 or Samsung EVO compatible |
| 10 | Female-to-male GPIO jumper wires | 20 cm dupont wires | 10 | $1–$3 (pack of 40) | For breadboard prototyping |
| 11 | Half-size breadboard | Standard 400-point | 1 | $3–$6 | For prototyping; omit for final build |

**Core subtotal (estimated):** $56–$82

---

## Power

| # | Component | Specification | Qty | Est. USD | Notes |
|---|---|---|---|---|---|
| 12 | USB power supply (wall) | 5 V / 2.5 A or greater, micro-USB or USB-C + adapter | 1 | $8–$15 | Official Raspberry Pi power supply recommended; see [rpi.com](https://www.raspberrypi.com/products/raspberry-pi-27w-usb-c-power-supply/) |
| 13 | USB power bank (portable) | ≥ 10,000 mAh, 5 V / 2.4 A continuous output, no auto-cutoff | 1 | $20–$40 | Must support continuous low-current draw (see [docs/hardware.md](docs/hardware.md#safe-shutdown-and-brownout-prevention)). Anker models with "Always-On" feature are commonly used. |
| 14 | Micro-USB to USB-A cable | High-quality, data + power, ≥ 1 m | 1 | $5–$10 | Use power-only cable for the PWR IN port if connecting to power bank |

**Power subtotal (estimated):** $33–$65

---

## Tools and consumables

| # | Item | Purpose | Est. USD |
|---|---|---|---|
| T1 | Soldering iron (temperature-controlled) | Solder GPIO header if not pre-populated | $25–$60 |
| T2 | Solder (rosin-core, 60/40 or lead-free) | GPIO header soldering | $5–$12 |
| T3 | Anti-static wrist strap | Prevent ESD damage during assembly | $5–$15 |
| T4 | Anti-static mat | Work surface protection | $10–$25 |
| T5 | Fine-tip tweezers | Cable and connector handling | $3–$10 |
| T6 | Multimeter | Verify wiring continuity and voltage | $15–$40 |
| T7 | USB-A to micro-USB adapter or cable | Connect power bank to Pi micro-USB power port | $3–$8 |

**Tools subtotal (estimated):** $66–$170 (one-time investment; may be already available)

---

## Optional: enclosure and labeling

| # | Component | Specification | Est. USD | Notes |
|---|---|---|---|---|
| E1 | Project box / enclosure | ABS or aluminum, ≥ 80 × 50 × 30 mm | $5–$20 | Must accommodate Pi Zero + camera + wiring |
| E2 | Camera mount / lens cutout | 12 mm hole or acrylic window | $2–$10 | Clear optical acrylic for camera window |
| E3 | Panel-mount button | 12 mm momentary, with nut | $2–$8 | For permanent installation |
| E4 | LED bezels (3 mm or 5 mm) | Match LED diameter | $1–$3 (pack) | |
| E5 | Label printer / laser printer | Print Azure RG name labels | — | Standard office printer acceptable |
| E6 | Label card stock | Heavy paper or card stock for printed labels | $5–$15 | |
| E7 | Cable tie / strain relief | 100 mm nylon ties | $2–$5 (pack) | |
| E8 | Thermal paste / heatsink | Small heatsink for Pi SoC | $3–$8 | Optional; improves thermal stability in enclosure |
| E9 | Conformal coating spray | Moisture protection if used outdoors | $10–$20 | |

**Enclosure subtotal (estimated):** $30–$89

---

## Cable compatibility notes

> **Critical:** The Raspberry Pi Zero 2 W CSI camera connector has **22 contacts at 0.5 mm pitch**. The Camera Module 3 board connector has **15 contacts at 1.0 mm pitch**. These are different — a conversion cable is required.

- **Required cable:** A "Pi Zero camera cable" (also called a Zero-to-standard or mini camera adapter cable) with a **22-contact 0.5 mm pitch end** for the Pi Zero 2 W and a **15-contact 1.0 mm pitch end** for the Camera Module 3.
- **The standard cable included with Camera Module 3 is not compatible** with the Pi Zero 2 W — per the official Raspberry Pi product page, "the standard cable supplied with the camera is not compatible with the smaller Raspberry Pi Zero camera connector." Purchase the Pi Zero camera cable separately.
- Suitable cables are available from Raspberry Pi Approved Resellers (Pimoroni, Adafruit, Vilros, SparkFun). Check whether the cable is also bundled with the [Raspberry Pi Zero Case](https://www.raspberrypi.com/products/raspberry-pi-zero-case/) if purchasing that accessory.
- Verify cable contact count and pitch at point of purchase — specifications govern, not marketing names.

> **Official source note:** Connector specifications verified against the Raspberry Pi Camera Module 3 product page (cable connector: 15 × 1 mm FPC) and the Pi Zero camera compatibility statement on that page.

References:
- [Camera Module 3 product page — specifications and cable compatibility](https://www.raspberrypi.com/products/camera-module-3/) _(accessed 2026-08-13)_
- [Camera Module 3 documentation](https://www.raspberrypi.com/documentation/accessories/camera.html) _(accessed 2026-08-13)_

---

## Safety notes

- **Do not use raw Li-ion cells** without a protection/charge controller board. Use only commercial power banks.
- **GPIO pins are 3.3 V only.** Connecting 5 V to any GPIO pin will permanently damage the Pi.
- **Anti-static precautions** are required during assembly.
- **Power bank auto-cutoff:** Many power banks shut off automatically when they detect low current draw (the idle Pi may trigger this). Verify the power bank's always-on behavior before relying on it for portable use.
- **Inspect cables** before use; damaged flex cables are fragile and can cause intermittent failures or shorts.

---

## Suggested suppliers (non-affiliate reference links)

| Supplier | Region | URL |
|---|---|---|
| Raspberry Pi (official) | Worldwide | [raspberrypi.com](https://www.raspberrypi.com) |
| Adafruit | US | [adafruit.com](https://www.adafruit.com) |
| Pimoroni | UK | [pimoroni.com](https://www.pimoroni.com) |
| SparkFun | US | [sparkfun.com](https://www.sparkfun.com) |
| Vilros | US | [vilros.com](https://www.vilros.com) |
| Arrow Electronics | US/Global | [arrow.com](https://www.arrow.com) |
| Mouser Electronics | US/Global | [mouser.com](https://www.mouser.com) |
| DigiKey | US/Global | [digikey.com](https://www.digikey.com) |

---

## Total estimated cost summary

| Category | Low | High |
|---|---|---|
| Core electronics | $56 | $82 |
| Power | $33 | $65 |
| Tools (one-time) | $66 | $170 |
| Enclosure (optional) | $30 | $89 |
| **Grand total** | **$185** | **$406** |

Without tools (assuming available) and without optional enclosure:

| Without tools/enclosure | $89 | $147 |
|---|---|---|
