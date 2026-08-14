# How-To: End-to-End Operator Guide

> ⚠️ **SANDBOX / NON-PRODUCTION ONLY**
> This guide covers assembly, setup, and operation of the ark-3 system. No hardware or Azure deployment validation has been performed by the development team; all steps require manual verification before first use. Commands have been cross-checked against the implementation but have not been run against live infrastructure.

---

## Table of contents

1. [Hardware procurement and assembly](#1-hardware-procurement-and-assembly)
2. [Raspberry Pi OS setup](#2-raspberry-pi-os-setup)
3. [Camera test](#3-camera-test)
4. [GPIO wiring](#4-gpio-wiring)
5. [Device token provisioning](#5-device-token-provisioning)
6. [Local development setup](#6-local-development-setup)
7. [Azure prerequisites](#7-azure-prerequisites)
8. [Bicep what-if (dry run)](#8-bicep-what-if-dry-run)
9. [Deploy to Azure](#9-deploy-to-azure)
10. [Build and push container image](#10-build-and-push-container-image)
11. [Entra app registration and Easy Auth](#11-entra-app-registration-and-easy-auth)
12. [Key Vault: store device token verifier](#12-key-vault-store-device-token-verifier)
13. [Install Pi service](#13-install-pi-service)
14. [Authenticated approval workflow](#14-authenticated-approval-workflow)
15. [Manual end-to-end test (sandbox only)](#15-manual-end-to-end-test-sandbox-only)
16. [Teardown and recovery](#16-teardown-and-recovery)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. Hardware procurement and assembly

See [BOM.md](../BOM.md) for a complete bill of materials with part numbers and price estimates.

**Required parts**
- Raspberry Pi Zero 2 W
- Raspberry Pi Camera Module 3 (standard or wide)
- Camera cable: Pi Zero camera cable — **22-contact 0.5 mm pitch end** (Pi Zero 2 W) ↔ **15-contact 1.0 mm pitch end** (Camera Module 3). **Not included** with Camera Module 3; purchase separately.
- Momentary push button (normally open, e.g. 12 mm tactile)
- Green LED + 330 Ω resistor (status: ready / uploading)
- Red LED + 330 Ω resistor (status: error)
- 10 kΩ resistor (button pull-up — optional; internal pull-up is used in software)
- USB-C power supply ≥ 2.5 A (5 V), or USB power bank with continuous-draw support
- Micro-USB to USB-C adapter if using a Pi Zero micro-USB port
- MicroSD card ≥ 16 GB (Class 10 / A1)
- Anti-static wrist strap
- 40-pin GPIO header (if not pre-soldered)

**Assembly notes**
- Work on a non-conductive surface with an anti-static wrist strap.
- A Pi Zero camera cable is required. The Pi Zero 2 W CSI connector has **22 contacts at 0.5 mm pitch**; the Camera Module 3 board connector has **15 contacts at 1.0 mm pitch**. The cable adapts between these two formats. The standard cable included with Camera Module 3 is not compatible with the Pi Zero 2 W — purchase the Pi Zero camera cable separately. For cable orientation, follow the board silkscreen and locking tab on each connector; refer to the [official camera installation guide](https://www.raspberrypi.com/documentation/accessories/camera.html). Insert the cable fully and close the locking tab before applying power.
- Do **not** wire any Li-ion battery without a proper protection/charge controller board. Use only commercially made USB power banks or official Pi power supplies.
- Secure all cables with strain relief (e.g. cable tie or foam tape) to avoid connector damage during portability.

See [docs/hardware.md](hardware.md) for GPIO pin tables, resistor sizing, and assembly checklist.

---

## 2. Raspberry Pi OS setup

1. Download [Raspberry Pi Imager](https://www.raspberrypi.com/software/) and flash **Raspberry Pi OS Lite (64-bit, Bookworm)** to a microSD card.
2. In Imager advanced settings, enable SSH, set a username/password, and configure Wi-Fi if headless.
3. Insert SD card, connect power, and SSH in:
   ```bash
   ssh <username>@<pi-hostname>.local
   ```
4. Update the system:
   ```bash
   sudo apt-get update && sudo apt-get full-upgrade -y
   sudo reboot
   ```
5. Enable the camera interface (required for libcamera / picamera2):
   ```bash
   sudo raspi-config
   # Interface Options → Camera → Enable
   sudo reboot
   ```

---

## 3. Camera test

```bash
# Test camera with a still capture (writes test.jpg to current directory)
libcamera-still -o test.jpg --width 1920 --height 1080

# View image dimensions to confirm capture
file test.jpg
```

If `libcamera-still` is not found:
```bash
sudo apt-get install -y libcamera-tools
```

---

## 4. GPIO wiring

Defaults (BCM pin numbers, all 3.3 V):

| Signal | BCM | Header | Notes |
|---|---|---|---|
| Button | 17 | Pin 11 | Pull-up enabled in software; wire to GND on press |
| Green LED | 27 | Pin 13 | 330 Ω series resistor to GND |
| Red LED | 22 | Pin 15 | 330 Ω series resistor to GND |
| GND | — | Pin 9, 14, 20, 25, 30, 34, 39 | Any GND pin |
| 3.3 V | — | Pin 1, 17 | Power for pull-up reference only if needed |

**⚠️ GPIO pins are 3.3 V only. Never connect 5 V signals to GPIO pins — this will damage the Pi.**

For a logical wiring diagram see [diagrams/wiring.mmd](../diagrams/wiring.mmd). This is a logical diagram only, not a PCB schematic.

---

## 5. Device token provisioning

The backend authenticates device uploads using a shared bearer token. The device stores only the raw token; the backend stores only a hex-encoded SHA-256 hash (the "verifier").

**Step 1: Generate a cryptographically random token (operator workstation)**
```bash
# Generate a 32-byte (256-bit) random token and base64-encode it
TOKEN=$(openssl rand -base64 32)
echo "Token (keep secret): $TOKEN"
```

**Step 2: Compute the verifier hash**
```bash
HASH=$(echo -n "$TOKEN" | sha256sum | awk '{print $1}')
echo "Verifier hash (store in Key Vault): $HASH"
```

**Step 3: Save the token to the Pi (after service install)**
```bash
# On the Pi, as root:
echo -n "$TOKEN" | sudo tee /etc/ark3/device-token
sudo chmod 0600 /etc/ark3/device-token
sudo chown root:ark3 /etc/ark3/device-token
```
The file must be exactly mode `0600`. The service will refuse to start if permissions are wrong.

**Step 4: Store the verifier hash in Key Vault** — see [section 12](#12-key-vault-store-device-token-verifier).

---

## 6. Local development setup

```bash
# Clone the repository and enter it
git clone <repo-url> ark-3
cd ark-3

# Install Node.js dependencies
npm install

# Start local services: Azurite + mock-vision + backend
docker compose up
```

The backend is available at `http://localhost:3000`. Auth bypass is enabled by default in Docker Compose. No Azure credentials are required.

**Run tests**
```bash
npm test            # all workspaces
npm run typecheck   # TypeScript typecheck
npm run lint        # ESLint
```

**Device (Python) development**
```bash
cd device
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt -e .

# Run tests
pytest tests/

# Run device in mock mode (no Pi hardware required)
python3 -m ark3_device.main --config config.example.yaml --mock
```

---

## 7. Azure prerequisites

Log in and set your subscription:
```bash
az login
az account set --subscription "<your-subscription-id>"
```

Verify you have Owner or User Access Administrator:
```bash
az role assignment list --assignee "$(az ad signed-in-user show --query id -o tsv)" \
  --scope "/subscriptions/$(az account show --query id -o tsv)" \
  --query "[].roleDefinitionName" -o tsv
```

Install / update Bicep:
```bash
az bicep install
az bicep version
```

Register required providers (if not already registered):
```bash
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.CognitiveServices
az provider register --namespace Microsoft.ContainerRegistry
az provider register --namespace Microsoft.KeyVault
az provider register --namespace Microsoft.ManagedIdentity
az provider register --namespace Microsoft.OperationalInsights
az provider register --namespace Microsoft.Insights
```

Generate a deployment suffix (3–8 lowercase alphanumeric characters):
```bash
SUFFIX=$(az account show --query id -o tsv | head -c 8 | tr '[:upper:]' '[:lower:]')
echo "Suffix: $SUFFIX"
```

---

## 8. Bicep what-if (dry run)

Always run `what-if` before applying changes:

```bash
# Copy and fill in the parameter file
cp .azure/bicep/main.bicepparam.example .azure/bicep/main.bicepparam
# Edit .azure/bicep/main.bicepparam — set suffix, subscriptionId, tenantId, etc.
# NEVER commit main.bicepparam — it is git-ignored.

# Lint
az bicep lint --file .azure/bicep/main.bicep

# Build (validates syntax)
az bicep build --file .azure/bicep/main.bicep

# What-if dry run
az deployment sub what-if \
  --location canadacentral \
  --template-file .azure/bicep/main.bicep \
  --parameters .azure/bicep/main.bicepparam
```

Review the what-if output carefully before proceeding.

---

## 9. Deploy to Azure

```bash
az deployment sub create \
  --location canadacentral \
  --template-file .azure/bicep/main.bicep \
  --parameters .azure/bicep/main.bicepparam \
  --name "ark3-$(date +%Y%m%d-%H%M)"
```

Capture outputs for later steps:
```bash
DEPLOYMENT_NAME="ark3-$(date +%Y%m%d-%H%M)"   # use the name from above
CONTROL_RG=$(az deployment sub show -n "$DEPLOYMENT_NAME" \
  --query properties.outputs.controlResourceGroupName.value -o tsv)
CA_NAME=$(az deployment sub show -n "$DEPLOYMENT_NAME" \
  --query properties.outputs.containerAppName.value -o tsv)
CA_FQDN=$(az deployment sub show -n "$DEPLOYMENT_NAME" \
  --query properties.outputs.containerAppFqdn.value -o tsv)
ACR_SERVER=$(az deployment sub show -n "$DEPLOYMENT_NAME" \
  --query properties.outputs.registryLoginServer.value -o tsv)
KV_NAME=$(az deployment sub show -n "$DEPLOYMENT_NAME" \
  --query properties.outputs.keyVaultName.value -o tsv)
IDENTITY_CLIENT_ID=$(az deployment sub show -n "$DEPLOYMENT_NAME" \
  --query properties.outputs.identityClientId.value -o tsv)
echo "Control RG: $CONTROL_RG"
echo "Container App: $CA_NAME"
echo "FQDN: $CA_FQDN"
echo "ACR: $ACR_SERVER"
echo "Key Vault: $KV_NAME"
echo "Identity Client ID: $IDENTITY_CLIENT_ID"
```

---

## 10. Build and push container image

```bash
# Build and push backend image to ACR (uses managed identity / az acr build)
az acr build \
  --registry "$ACR_SERVER" \
  --image ark3-api:latest \
  apps/backend

# Link the managed identity to ACR (one-time; wait ~2 min for role propagation)
IDENTITY_ID=$(az deployment sub show -n "$DEPLOYMENT_NAME" \
  --query properties.outputs.identityName.value -o tsv)
az containerapp registry set \
  --name "$CA_NAME" \
  --resource-group "$CONTROL_RG" \
  --server "$ACR_SERVER" \
  --identity system   # or the full resource ID of the UAMI

# Update Container App to use the real image
az containerapp update \
  --name "$CA_NAME" \
  --resource-group "$CONTROL_RG" \
  --image "${ACR_SERVER}/ark3-api:latest"
```

---

## 11. Entra app registration and Easy Auth

**Step 1: Register the app**
```bash
APP_ID=$(az ad app create \
  --display-name "ark3-approver" \
  --sign-in-audience AzureADMyOrg \
  --query appId -o tsv)
echo "App ID: $APP_ID"
```

**Step 2: Add redirect URI and enable ID tokens**

In the Azure Portal → App registrations → ark3-approver:
- Authentication → Add platform → Web
- Redirect URI: `https://<CA_FQDN>/.auth/login/aad/callback`
- Enable **ID tokens** under Implicit grant and hybrid flows
- Supported account types: **Accounts in this organizational directory only**

Or via CLI:
```bash
az ad app update \
  --id "$APP_ID" \
  --web-redirect-uris "https://${CA_FQDN}/.auth/login/aad/callback"
```

**Step 3: Enable Easy Auth — re-deploy with the client ID**
```bash
TENANT_ID=$(az account show --query tenantId -o tsv)
az deployment sub create \
  --location canadacentral \
  --template-file .azure/bicep/main.bicep \
  --parameters .azure/bicep/main.bicepparam \
               easyAuthClientId="$APP_ID" \
               tenantId="$TENANT_ID" \
  --name "ark3-easyauth-$(date +%Y%m%d-%H%M)"
```

**Step 4: Verify Easy Auth**
```bash
curl -s "https://${CA_FQDN}/.auth/me" | head -c 200
# Should redirect to Microsoft login or return principal info
```

---

## 12. Key Vault: store device token verifier

After generating the verifier hash in [section 5](#5-device-token-provisioning):

```bash
# Store ONLY the hex-encoded SHA-256 hash — never the raw token
az keyvault secret set \
  --vault-name "$KV_NAME" \
  --name "device-token-verifier" \
  --value "<verifier-hash-from-step-2>"
```

---

## 13. Install Pi service

Transfer the device code to the Pi:
```bash
# From your workstation (adjust hostname/username)
rsync -avz device/ <username>@<pi-hostname>.local:~/ark3-device/
```

On the Pi:
```bash
cd ~/ark3-device
sudo bash setup.sh
```

The setup script:
- Installs system dependencies (python3, picamera2, gpiozero, pyyaml)
- Creates the `ark3` service user with `gpio` and `video` group membership
- Creates `/etc/ark3/`, `/var/lib/ark3/queue/`, `/var/run/ark3/`
- Installs the Python package system-wide
- Installs and enables the `ark3-capture` systemd service
- Creates `/etc/ark3/device-token` placeholder (mode 0600)

**Configure the service:**
```bash
sudo nano /etc/ark3/config.yaml
```
Set:
```yaml
backend_url: "https://<CA_FQDN>"
device_name: "pi-zero-001"   # unique per device
```

**Place the device token** (from [section 5](#5-device-token-provisioning)):
```bash
echo -n "$TOKEN" | sudo tee /etc/ark3/device-token
sudo chmod 0600 /etc/ark3/device-token
sudo chown root:ark3 /etc/ark3/device-token
```

**Start and verify:**
```bash
sudo systemctl start ark3-capture
sudo systemctl status ark3-capture
sudo journalctl -u ark3-capture -f
```

---

## 14. Authenticated approval workflow

1. Open `https://<CA_FQDN>` in a browser. You will be redirected to Microsoft login.
2. Sign in with an account that has the `approver` role (configured in Easy Auth app roles, or via the default role mapping).
3. Press the button on the Pi to capture and upload an image.
4. The dashboard shows pending approvals: source image, proposed RG name, canonical ARM ID (`/subscriptions/.../resourceGroups/...`), tags, and subscription label.
5. Review carefully. If correct, click **Approve** (sends `POST /api/approve/:id` with CSRF token, nonce, and version). If incorrect, click **Reject**.
6. On approval, the backend re-validates all gates against live ARM state, then deletes the resource group.

**The CSRF token** is issued as a cookie (`csrf-token`, `SameSite=Strict`) and must be echoed as the `X-CSRF-Token` request header. The web UI handles this automatically.

---

## 15. Manual end-to-end test (sandbox only)

> This is a manual test. No automated E2E test suite runs against live Azure infrastructure.

1. Confirm the sandbox target RG exists: `az group show -n rg-ark3-sandbox-<suffix>`
2. Confirm it has tag `ark3-disposable=true`: `az group show -n rg-ark3-sandbox-<suffix> --query tags`
3. Print a label with the exact sandbox RG name and photograph it with the Pi.
4. Watch the device logs: `sudo journalctl -u ark3-capture -f`
5. Open the approval UI and confirm the proposed name matches the sandbox RG.
6. Approve. Confirm the RG is deleted: `az group show -n rg-ark3-sandbox-<suffix>`
7. Re-create the sandbox RG for future tests: `az group create -n rg-ark3-sandbox-<suffix> -l canadacentral --tags ark3-disposable=true`

---

## 16. Teardown and recovery

**Delete all ark-3 infrastructure (both resource groups):**
```bash
az group delete -n rg-ark3-<suffix> --yes --no-wait
az group delete -n rg-ark3-sandbox-<suffix> --yes --no-wait
```

> Source: [Azure resource group deletion reference](https://learn.microsoft.com/en-us/cli/azure/group#az-group-delete)

**Delete the Entra app registration:**
```bash
az ad app delete --id "$APP_ID"
```

**Revoke a device token:**
1. Generate a new token and verifier hash (see [section 5](#5-device-token-provisioning)).
2. Update Key Vault: `az keyvault secret set --vault-name "$KV_NAME" --name device-token-verifier --value "<new-hash>"`
3. The cached hash in the backend is refreshed at next restart; to force immediate revocation, restart the Container App revision or the backend process.

---

## 17. Troubleshooting

| Symptom | Check |
|---|---|
| Pi LEDs solid red | Capture failed; check `journalctl -u ark3-capture` |
| Upload returns 401 | Token file permissions wrong or hash not in Key Vault |
| OCR fails / status `failed` | Check Application Insights logs; image quality or model quota |
| Approval UI returns 403 | User does not have `approver` role in Entra app; check app roles |
| Approve returns 409 / nonce invalid | Item already acted on or nonce expired (10-minute window) |
| RG delete returns `REVALIDATION_FAILED` | RG was removed from allowlist or `ark3-disposable` tag was changed |
| Container App not starting | Check `az containerapp logs show`; image not yet pushed to ACR |
| Key Vault secret not found | Complete [section 12](#12-key-vault-store-device-token-verifier) |
| Daily deletion cap hit | Config default is 10/day; wait for midnight UTC or adjust `ARK3_DAILY_DELETION_CAP` |

```bash
# Stream Container App logs
az containerapp logs show --name "$CA_NAME" --resource-group "$CONTROL_RG" --follow

# Device logs
sudo journalctl -u ark3-capture -f -n 100

# Check Key Vault secret exists
az keyvault secret show --vault-name "$KV_NAME" --name device-token-verifier --query id
```
