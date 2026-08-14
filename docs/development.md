# Development Guide

> This guide covers local workspace setup, Docker Compose, testing, linting, and contributing safely.

---

## Prerequisites

| Tool | Minimum version |
|---|---|
| Node.js | 20.x |
| npm | 10.x |
| Docker | 24.x |
| Docker Compose | v2 (bundled with Docker Desktop) |
| Python | 3.11 (device only) |
| Azure CLI | 2.60+ (for deployment only) |

---

## Project layout

```
ark-3/
├── apps/
│   ├── backend/          # Node.js / Fastify backend (TypeScript)
│   │   ├── src/
│   │   │   ├── config.ts           # Configuration loader
│   │   │   ├── context.ts          # Dependency injection context (AppDeps)
│   │   │   ├── errors.ts           # ApiError class and envelope builder
│   │   │   ├── providers/          # Storage, blob, ARM, vision, secret adapters
│   │   │   ├── routes/             # Fastify route registrations
│   │   │   ├── services/           # ApprovalService, DeviceAuthService, OCR pipeline, CSRF, Easy Auth
│   │   │   └── validation/         # Image and resource group validators
│   │   ├── test/                   # Vitest tests
│   │   └── Dockerfile
│   └── web/              # React SPA (TypeScript, served by backend)
│       ├── src/
│       └── tests/
├── packages/
│   └── contracts/        # Shared Zod schemas and TypeScript types (@ark-3/contracts)
│       └── src/index.ts
├── device/               # Python device daemon (Raspberry Pi)
│   ├── src/ark3_device/  # Application source
│   ├── tests/            # pytest tests
│   ├── systemd/          # ark3-capture.service unit file
│   ├── setup.sh          # Pi installation script
│   ├── config.example.yaml
│   ├── requirements.txt
│   └── requirements-dev.txt
├── tools/
│   └── mock-vision/      # Mock Azure OpenAI endpoint for local development
├── .azure/
│   ├── bicep/            # Bicep IaC templates
│   └── deployment-plan.md
├── .squad/               # Squad AI team configuration
├── docker-compose.yml
├── package.json          # Workspace root (npm workspaces)
└── tsconfig.base.json
```

---

## Workspace setup

```bash
# Clone repository
git clone <repo-url> ark-3
cd ark-3

# Install all Node.js workspace dependencies
npm install
```

This installs dependencies for `packages/contracts`, `apps/backend`, and `apps/web` in a single step.

---

## Docker Compose (local development)

```bash
# Start all services (Azurite + mock-vision + backend)
docker compose up

# Start in background
docker compose up -d

# Rebuild images after code changes
docker compose up --build

# Stop and remove containers
docker compose down
```

### Services

| Service | Port | Description |
|---|---|---|
| `azurite` | 10000 (blob), 10001 (queue), 10002 (table) | Azure Storage emulator |
| `mock-vision` | 8080 | Mock Azure OpenAI endpoint |
| `backend` | 3000 | Fastify API server |

### Docker Compose environment

The `backend` service starts with:
- `ARK3_AUTH_BYPASS=true` — no Entra authentication required
- `ARK3_BLOB_STORAGE_PROVIDER=azurite` — uses Azurite for blob/table storage
- `ARK3_OPENAI_ENDPOINT=http://mock-vision:8080` — uses mock vision
- `ARK3_RG_ALLOWLIST=rg-test-disposable` — allowlisted sandbox name
- `ARK3_AZURE_SUBSCRIPTION_ID=00000000-0000-0000-0000-000000000000` — fake subscription (no ARM calls to real Azure)

No Azure credentials are required for local development.

---

## Mock vision service

The `tools/mock-vision` service implements the Azure OpenAI chat completions endpoint. It returns a deterministic mock OCR result based on the uploaded image. This allows end-to-end local testing of the upload → OCR → approval flow without any Azure resources.

The mock returns a configurable `resourceGroupName` (defaulting to `rg-test-disposable`). See `tools/mock-vision/` for implementation details.

---

## Tests

### Node.js (Vitest)

```bash
# Run all workspace tests
npm test

# Run tests for a specific workspace
npm test -w apps/backend
npm test -w apps/web
npm test -w packages/contracts

# Run with coverage
npm test -w apps/backend -- --coverage

# Run specific test file
npm test -w apps/backend -- src/services/deviceAuth.test.ts
```

Tests use Vitest. Configuration is in `vitest.config.ts` in each workspace.

### Python (pytest)

```bash
cd device

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate  # Linux/macOS; on Windows: .venv\Scripts\activate

# Install dev dependencies
pip install -r requirements-dev.txt -e .

# Run all tests
pytest tests/

# Run with verbose output
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=ark3_device --cov-report=term-missing
```

---

## Lint and typecheck

```bash
# Lint all workspaces
npm run lint

# Typecheck all workspaces
npm run typecheck

# Build all workspaces (contracts → backend → web)
npm run build
```

Python lint (from `device/` directory):
```bash
# Requires ruff installed: pip install ruff
ruff check src/ tests/

# Type check with mypy (requires pip install mypy)
mypy src/
```

---

## Device mock mode

The device daemon can be run locally without Pi hardware:

```bash
cd device
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -e .

# Run with mock GPIO and mock camera
python3 -m ark3_device.main --config config.example.yaml --mock
```

In mock mode:
- GPIO uses `MockGPIOAdapter` — logs LED state changes; button presses must be simulated programmatically
- Camera uses a mock adapter — returns a static test JPEG
- Token reads return `MOCK_TOKEN_PLACEHOLDER` (never uses real credentials)

The mock mode is explicitly refused if real credentials are detected.

---

## Contributor safety rules

1. **Never commit `.env` files.** Environment variables with real credentials must never appear in version control. Only `.env.example` and `config.example.yaml` (with placeholders) are committed.

2. **Never commit `main.bicepparam`.** This file contains real Azure subscription IDs and tenant IDs. It is git-ignored.

3. **`ARK3_AUTH_BYPASS=true` is development-only.** The backend refuses this flag unless `NODE_ENV=development` and no managed identity endpoint is present. Do not add tests or CI jobs that depend on it with real Azure credentials.

4. **No live deletion in CI.** Tests must not call real ARM APIs. The `ARK3_BLOB_STORAGE_PROVIDER=memory` and mock ARM providers are used in tests.

5. **Model output is untrusted.** Do not write code that uses the `uncertainty` field for authorization decisions. Do not write code that executes or interprets `rawText`.

6. **Update tests when changing APIs.** Changing a route handler, schema, or service interface requires updating the corresponding tests. See `apps/backend/test/` and `packages/contracts/src/index.test.ts`.

7. **Contracts are a breaking-change boundary.** Changes to `packages/contracts/src/index.ts` (schemas, error codes, status transitions) affect both the backend and the web SPA. Update both sides.

---

## Environment variables reference

See `.env.example` at the repository root for the complete list of environment variables with descriptions. Key variables for local development:

| Variable | Docker Compose value | Purpose |
|---|---|---|
| `ARK3_AUTH_BYPASS` | `true` | Skip Easy Auth (dev only) |
| `ARK3_BLOB_STORAGE_PROVIDER` | `azurite` | Use Azurite instead of Azure Storage |
| `ARK3_OPENAI_ENDPOINT` | `http://mock-vision:8080` | Use mock vision service |
| `ARK3_RG_ALLOWLIST` | `rg-test-disposable` | Sandbox allowlist |
| `AZURITE_CONNECTION_STRING` | (set in compose) | Azurite connection string |

For production values, see [docs/deployment.md](deployment.md) and [docs/how-to.md](how-to.md).
