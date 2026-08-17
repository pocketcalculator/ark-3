# ark-3 — Portable OCR-Triggered Azure Resource Group Deletion

> ⚠️ **SANDBOX / NON-PRODUCTION ONLY**
> This system is a proof-of-concept that performs **irreversible deletion** of Azure resource groups. It is explicitly scoped to disposable, non-production targets and is **not validated for production use**. No deployment or hardware validation has been performed; all validation remains manual before first use.

---

## What it does

A Raspberry Pi Zero 2 W with a camera and button photographs a printed Azure resource group name label. The image is uploaded to a Node.js backend hosted on Azure Container Apps, which uses a multimodal vision model (`gpt-5.4-mini`, Canada Central) to extract the proposed name. After server-side grammar validation, exact ARM lookup, allowlist check, and disposability tag check, the result is presented in an authenticated web UI. A human operator reviews the original image and the canonical ARM resource group ID before approving deletion. Deletion re-validates all gates before executing.

**Key safety properties:**
- Target RG must appear on an explicit operator-controlled allowlist **and** be tagged `ark3-disposable=true`
- No fuzzy name matching; one exact match required
- Authenticated web approval required; no automatic deletion
- All gates re-validated immediately before deletion (TOCTOU protection)
- Model confidence is an uncalibrated indicator only; never gates decisions
- Sandbox resource group deletion only; no production subscription scope

---

## Architecture summary

```
Pi Zero 2 W (camera + button + GPIO LEDs)
    │  HTTPS + Bearer token
    ▼
Azure Container Apps (Node.js/Fastify backend)
    ├── Azure Blob Storage — uploaded images, 7-day lifecycle
    ├── Azure Table Storage — approval state records
    ├── Azure Key Vault — device token verifier hash
    ├── Azure OpenAI (gpt-5.4-mini, Canada Central) — vision/OCR
    ├── Azure Container Registry — app image
    ├── Log Analytics + Application Insights — monitoring
    └── Easy Auth (Entra ID) — web UI authentication
              │  ARM SDK + custom role
              ▼
    Azure Resource Manager — sandbox RG deletion
```

All infrastructure is deployed to `canadacentral` in a single non-production subscription. The control resource group (`rg-ark3-<suffix>`) hosts all app infrastructure. A separate sandbox resource group (`rg-ark3-sandbox-<suffix>`) is the proof-of-concept deletion target.

---

## Quick navigation

| Topic | Document |
|---|---|
| Step-by-step: hardware → Azure → full workflow | [docs/how-to.md](docs/how-to.md) |
| Architecture narrative + diagrams | [docs/architecture.md](docs/architecture.md) |
| Hardware assembly, GPIO wiring | [docs/hardware.md](docs/hardware.md) |
| Threat model, trust boundaries, security design | [docs/security.md](docs/security.md) |
| API reference (endpoints, schemas, errors) | [docs/api.md](docs/api.md) |
| Bicep deployment operator reference | [docs/deployment.md](docs/deployment.md) |
| Local development, Docker Compose, tests | [docs/development.md](docs/development.md) |
| Optional Microsoft Edge GIF overlay extension | [apps/edge-overlay-extension/README.md](apps/edge-overlay-extension/README.md) |
| Bill of materials | [BOM.md](BOM.md) |
| Process flow diagram | [diagrams/process-flow.mmd](diagrams/process-flow.mmd) |
| Infrastructure diagram | [diagrams/infrastructure.mmd](diagrams/infrastructure.mmd) |
| GPIO wiring diagram | [diagrams/wiring.mmd](diagrams/wiring.mmd) |
| Security boundaries diagram | [diagrams/security-boundaries.mmd](diagrams/security-boundaries.mmd) |

---

## Prerequisites

**Azure**
- Azure subscription (non-production, confirmed out-of-band)
- Owner or User Access Administrator on the subscription (to create custom role + role assignments)
- Azure CLI ≥ 2.60 and Bicep CLI installed (`az bicep install`)

**Local development**
- Node.js ≥ 20, npm ≥ 10
- Docker and Docker Compose
- Python ≥ 3.11 (for device code, Raspberry Pi OS only for live hardware)

**Hardware**
- Raspberry Pi Zero 2 W (see [BOM.md](BOM.md) and [docs/hardware.md](docs/hardware.md))

---

## Local quickstart

```bash
# 1. Install dependencies
npm install

# 2. Start local services (Azurite + mock-vision + backend)
docker compose up

# 3. Open the web app (served by backend on http://localhost:3000)
open http://localhost:3000
```

The backend starts with `ARK3_AUTH_BYPASS=true` and uses Azurite for storage and a mock-vision service for OCR. No Azure credentials are required for local development.

---

## Test commands

```bash
# Run all tests across workspaces
npm test

# Run tests for a specific workspace
npm test -w apps/backend
npm test -w packages/contracts

# Typecheck
npm run typecheck

# Lint
npm run lint

# Device (Python) — run from the device/ directory
cd device
pytest tests/

# Device mock mode — no Pi hardware required
python -m ark3_device.main --config config.example.yaml --mock
```

---

## Status

- **Implementation:** Complete (feature branch `squad/1-portable-ocr-azure-delete`)
- **Azure deployment:** Not performed — see [docs/deployment.md](docs/deployment.md) for operator instructions
- **Hardware validation:** Not performed — see [docs/hardware.md](docs/hardware.md) and [docs/how-to.md](docs/how-to.md)
- **Production use:** Out of scope
