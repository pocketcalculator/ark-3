# Deployment Reference

> ⚠️ **SANDBOX / NON-PRODUCTION ONLY.** No deployment has been performed. All commands have been cross-checked against the Bicep templates but have not been run against live infrastructure. Always run `what-if` first. Never commit `main.bicepparam` (it contains secrets).

---

## Overview

ark-3 uses a subscription-scope Bicep deployment that creates two resource groups and all app infrastructure in Canada Central. The deployment is idempotent; re-running with the same parameters is safe.

| Resource group | Purpose |
|---|---|
| `rg-ark3-<suffix>` | Control RG — all app infrastructure |
| `rg-ark3-sandbox-<suffix>` | Sandbox target RG — the disposable deletion target |

---

## Bicep module summary

| Module | File | Scope | Resources created |
|---|---|---|---|
| identity | `modules/identity.bicep` | controlRg | User-Assigned Managed Identity |
| monitoring | `modules/monitoring.bicep` | controlRg | Log Analytics Workspace, Application Insights |
| registry | `modules/registry.bicep` | controlRg | Container Registry (Basic SKU) |
| storage | `modules/storage.bicep` | controlRg | Storage Account, blob container `uploads`, table `approvals`, lifecycle policy |
| keyvault | `modules/keyvault.bicep` | controlRg | Key Vault (Standard, RBAC mode) |
| model | `modules/model.bicep` | controlRg | Azure OpenAI account, model deployment `ark3-vision` |
| containerApp | `modules/containerApp.bicep` | controlRg | Container Apps Environment, Container App, Easy Auth config |
| roleDefinition | `modules/roleAssignments.bicep` | subscription | Custom role `ark3-RGDeletion-<hash>` |
| roleAssignmentsControlRG | `modules/roleAssignmentsControlRG.bicep` | controlRg | AcrPull, Storage Blob/Table Data Contributor, Key Vault Secrets User, Cognitive Services OpenAI User |
| roleAssignmentsSandboxRG | `modules/roleAssignmentsSandboxRG.bicep` | sandboxRg | Custom role assignment (sandbox scope only) |

---

## Parameters

| Parameter | Required | Default | Description |
|---|---|---|---|
| `suffix` | Yes | — | 3–8 lowercase alphanumeric chars; used in all resource names |
| `location` | No | `canadacentral` | Deployment region |
| `subscriptionId` | Yes | — | Azure subscription ID (never hard-code; supply as parameter) |
| `tenantId` | Yes | — | Azure tenant ID (supply as parameter) |
| `easyAuthClientId` | No | `""` | Entra app client ID for Easy Auth; leave empty pre-registration |
| `subscriptionDisplayLabel` | No | `""` | Human-readable subscription label for UI |
| `rgAllowlist` | No | `""` | Comma-separated RG names permitted for deletion |
| `corsOrigin` | No | `""` | CORS allowed origin (set to Container App FQDN after first deploy) |
| `openaiApiVersion` | No | `2026-03-17` | Azure OpenAI REST API version |
| `containerImage` | No | `mcr.microsoft.com/k8se/quickstart:latest` | Bootstrap image (replaced by CI) |
| `modelName` | No | `gpt-5.4-mini` | Vision model name |
| `modelVersion` | No | `2026-03-17` | Model version |
| `modelSkuName` | No | `GlobalStandard` | Model deployment SKU |
| `modelCapacity` | No | `10` | Model tokens-per-minute (thousands) |

---

## Model lifecycle note

> ⚠️ **Date-sensitive information — verify before deploying.**

| Field | Value |
|---|---|
| Model | `gpt-5.4-mini` |
| Version | `2026-03-17` |
| Checked | 2026-08-13 |
| Estimated retirement | 2027-09-21 |
| Region | Canada Central |
| SKU | GlobalStandard |

Model availability and lifecycle change. Verify current status before deployment:
- [Azure OpenAI model lifecycle and retirement](https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/model-retirements) _(verify date on access)_
- [Azure OpenAI models available by region](https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/models) _(verify date on access)_

The `versionUpgradeOption: 'NoAutoUpgrade'` setting pins the version; re-deploy with an updated `modelVersion` parameter to upgrade.

---

## Build and validate

```bash
# Lint Bicep (static analysis)
az bicep lint --file .azure/bicep/main.bicep

# Build / compile (validates syntax, generates ARM JSON)
az bicep build --file .azure/bicep/main.bicep
```

---

## What-if (dry run)

Always run what-if before applying:

```bash
# Copy and populate the parameter file
cp .azure/bicep/main.bicepparam.example .azure/bicep/main.bicepparam
# Edit .azure/bicep/main.bicepparam — NEVER commit this file

az deployment sub what-if \
  --location canadacentral \
  --template-file .azure/bicep/main.bicep \
  --parameters .azure/bicep/main.bicepparam
```

Review the output carefully. Confirm no unexpected resources will be modified or deleted.

---

## Deploy

```bash
az deployment sub create \
  --location canadacentral \
  --template-file .azure/bicep/main.bicep \
  --parameters .azure/bicep/main.bicepparam \
  --name "ark3-$(date +%Y%m%d-%H%M)"
```

Estimated deploy time: 5–15 minutes (model deployment is slowest).

---

## Read deployment outputs

```bash
# Replace DEPLOYMENT_NAME with the value used in --name above
az deployment sub show \
  --name "<DEPLOYMENT_NAME>" \
  --query properties.outputs \
  -o json
```

Key outputs:

| Output | Description |
|---|---|
| `controlResourceGroupName` | Name of the control RG |
| `sandboxResourceGroupName` | Name of the sandbox target RG |
| `containerAppName` | Container App name |
| `containerAppFqdn` | Public FQDN of the Container App |
| `registryLoginServer` | ACR login server (e.g. `crark3<suffix>.azurecr.io`) |
| `keyVaultName` | Key Vault name |
| `identityClientId` | UAMI client ID (set as `AZURE_CLIENT_ID` in Container App env) |

---

## Post-deploy checklist

Run these steps in order after deployment:

1. **Store device token verifier in Key Vault**
   ```bash
   az keyvault secret set \
     --vault-name "<keyVaultName>" \
     --name "device-token-verifier" \
     --value "<hex-sha256-hash-of-device-token>"
   ```

2. **Register Entra app and re-deploy with Easy Auth**
   See [docs/how-to.md § 11](how-to.md#11-entra-app-registration-and-easy-auth).

3. **Link ACR to Container App managed identity** (after role propagation, ~2 min)
   ```bash
   az containerapp registry set \
     --name "<containerAppName>" \
     --resource-group "<controlRG>" \
     --server "<registryLoginServer>" \
     --identity system
   ```

4. **Build and push app image**
   ```bash
   az acr build \
     --registry "<registryLoginServer>" \
     --image ark3-api:latest \
     apps/backend

   az containerapp update \
     --name "<containerAppName>" \
     --resource-group "<controlRG>" \
     --image "<registryLoginServer>/ark3-api:latest"
   ```

5. **Set `CORS_ORIGIN` and re-deploy**
   After obtaining the FQDN, re-deploy with `corsOrigin=https://<fqdn>`.

6. **Verify health endpoint**
   ```bash
   curl https://<containerAppFqdn>/api/health
   # Expected: {"status":"ok","version":"..."}
   ```

7. **Verify Easy Auth** (if configured)
   ```bash
   curl -s https://<containerAppFqdn>/.auth/me | head -c 200
   ```

---

## Diagnostics

```bash
# Container App logs (streaming)
az containerapp logs show \
  --name "<containerAppName>" \
  --resource-group "<controlRG>" \
  --follow

# Container App revision list
az containerapp revision list \
  --name "<containerAppName>" \
  --resource-group "<controlRG>" \
  -o table

# Key Vault secret list
az keyvault secret list --vault-name "<keyVaultName>" -o table

# Model deployment status
az cognitiveservices account deployment show \
  --name "oai-ark3-<suffix>" \
  --resource-group "<controlRG>" \
  --deployment-name "ark3-vision"
```

---

## Re-deploying (updates)

Re-deploying with the same parameters is safe (idempotent). To update the container image only (without a full Bicep re-deploy):
```bash
az containerapp update \
  --name "<containerAppName>" \
  --resource-group "<controlRG>" \
  --image "<registryLoginServer>/ark3-api:<tag>"
```

---

## Teardown

```bash
# Delete both resource groups (irreversible)
az group delete -n "rg-ark3-<suffix>" --yes --no-wait
az group delete -n "rg-ark3-sandbox-<suffix>" --yes --no-wait

# Delete Entra app registration
az ad app delete --id "<appId>"

# Delete custom role (if not cleaned up by RG deletion)
az role definition delete --name "ark3-RGDeletion-<hash>"
```

Resource group deletion reference: [az group delete](https://learn.microsoft.com/en-us/cli/azure/group#az-group-delete)
