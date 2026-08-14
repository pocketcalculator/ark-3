// main.bicep — Subscription-scope orchestrator for ark-3 Azure infrastructure.
//
// Deployment scope: subscription
//   - Creates the control resource group (rg-ark3-<suffix>) containing all app resources
//   - Creates the disposable sandbox target resource group (rg-ark3-sandbox-<suffix>)
//   - Calls all child modules at resource group scope
//   - Wires cross-RG role assignments at subscription scope
//
// ── Quick deploy reference ────────────────────────────────────────────────────
//   az bicep build  --file .azure/bicep/main.bicep
//   az bicep lint   --file .azure/bicep/main.bicep
//   az deployment sub what-if \
//     --location canadacentral \
//     --template-file .azure/bicep/main.bicep \
//     --parameters .azure/bicep/main.bicepparam.example
//
// ── Post-deploy checklist ─────────────────────────────────────────────────────
//   1. Set AZURE_CLIENT_ID in the Container App env to the identity client ID output.
//   2. Store device-token-verifier hash in Key Vault (see modules/keyvault.bicep).
//   3. Register an Entra app and re-deploy with easyAuthClientId to enable Easy Auth.
//   4. Wire ACR to Container App identity:
//        az containerapp registry set --name <caName> -g <rgName> \
//          --server <acrLoginServer> --identity <identityId>
//   5. Build and push the real app image (see modules/registry.bicep).
//   6. Tag the sandbox target RG: ark3-disposable=true (applied by this template).

targetScope = 'subscription'

// ── Parameters ────────────────────────────────────────────────────────────────

@minLength(3)
@maxLength(8)
@description('Short unique suffix (3–8 lowercase alphanumeric chars) used in all resource names. Derive with: uniqueString(subscriptionId) | cut -c1-8')
param suffix string

@description('Primary deployment region for all resources')
param location string = 'canadacentral'

@description('Azure subscription ID — supply as parameter, never hard-code in source')
@secure()
param subscriptionId string

@description('Azure tenant ID — supply as parameter, never hard-code in source')
@secure()
param tenantId string

@description('Entra app registration client ID for Easy Auth. Leave empty to skip Easy Auth configuration (complete app registration first, then re-deploy).')
param easyAuthClientId string = ''

@description('Human-readable display label for the Azure subscription shown in the approval UI (ARK3_AZURE_SUBSCRIPTION_DISPLAY_LABEL).')
param subscriptionDisplayLabel string = ''

@description('Comma-separated list of resource group names permitted for deletion (ARK3_RG_ALLOWLIST). Required in production.')
param rgAllowlist string = ''

@description('CORS allowed origin — the public URL of the Container App (ARK3_CORS_ORIGIN). Set to https://<containerAppFqdn> after first deployment or derive from suffix.')
param corsOrigin string = ''

@description('Azure OpenAI API version injected into the Container App (ARK3_OPENAI_API_VERSION)')
param openaiApiVersion string = '2026-03-17'

@description('Bootstrap container image. Replaced by CI after first real build.')
param containerImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('Model name for the Azure OpenAI vision deployment')
param modelName string = 'gpt-5.4-mini'

@description('Model version — verify current lifecycle in canadacentral before deploying')
param modelVersion string = '2026-03-17'

@description('Model deployment SKU name')
param modelSkuName string = 'GlobalStandard'

@description('Model tokens-per-minute capacity (in thousands)')
param modelCapacity int = 10

// ── Resource Tags ─────────────────────────────────────────────────────────────

var commonTags = {
  environment: 'dev'
  project: 'ark-3'
}

var sandboxTags = union(commonTags, {
  'ark3-disposable': 'true'
})

// ── Resource Group Names ──────────────────────────────────────────────────────

var controlRgName = 'rg-ark3-${suffix}'
var sandboxRgName = 'rg-ark3-sandbox-${suffix}'

// ── Control Resource Group ────────────────────────────────────────────────────

resource controlRg 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: controlRgName
  location: location
  tags: commonTags
}

// ── Sandbox Target Resource Group ─────────────────────────────────────────────
// Tagged ark3-disposable=true — required safety gate for deletion.
// This RG is the proof-of-concept deletion target. It contains no real resources
// beyond what is placed here for testing purposes.

resource sandboxRg 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: sandboxRgName
  location: location
  tags: sandboxTags
}

// ── Module: User-Assigned Managed Identity ────────────────────────────────────

module identity 'modules/identity.bicep' = {
  name: 'identity'
  scope: controlRg
  params: {
    location: location
    suffix: suffix
    tags: commonTags
  }
}

// ── Module: Monitoring (Log Analytics + Application Insights) ─────────────────

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  scope: controlRg
  params: {
    location: location
    suffix: suffix
    tags: commonTags
  }
}

// ── Module: Azure Container Registry ─────────────────────────────────────────

module registry 'modules/registry.bicep' = {
  name: 'registry'
  scope: controlRg
  params: {
    location: location
    suffix: suffix
    tags: commonTags
  }
}

// ── Module: Storage Account (Blob + Table) ────────────────────────────────────

module storage 'modules/storage.bicep' = {
  name: 'storage'
  scope: controlRg
  params: {
    location: location
    suffix: suffix
    tags: commonTags
  }
}

// ── Module: Key Vault ─────────────────────────────────────────────────────────

module keyVault 'modules/keyvault.bicep' = {
  name: 'keyvault'
  scope: controlRg
  params: {
    location: location
    suffix: suffix
    tags: commonTags
  }
}

// ── Module: Azure OpenAI / Vision Model ───────────────────────────────────────

module model 'modules/model.bicep' = {
  name: 'model'
  scope: controlRg
  params: {
    location: location
    suffix: suffix
    tags: commonTags
    modelName: modelName
    modelVersion: modelVersion
    modelSkuName: modelSkuName
    modelCapacity: modelCapacity
  }
}

// ── Module: Container App (Environment + App + Easy Auth) ─────────────────────

module containerApp 'modules/containerApp.bicep' = {
  name: 'containerApp'
  scope: controlRg
  params: {
    location: location
    suffix: suffix
    tags: commonTags
    identityId: identity.outputs.identityId
    identityClientId: identity.outputs.identityClientId
    logAnalyticsCustomerId: monitoring.outputs.logAnalyticsCustomerId
    logAnalyticsPrimarySharedKey: monitoring.outputs.logAnalyticsPrimarySharedKey
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    appInsightsInstrumentationKey: monitoring.outputs.appInsightsInstrumentationKey
    storageAccountName: storage.outputs.storageAccountName
    approvalTableName: storage.outputs.approvalTableName
    keyVaultUri: keyVault.outputs.keyVaultUri
    visionEndpoint: model.outputs.endpoint
    visionModelDeploymentName: model.outputs.deploymentName
    openaiApiVersion: openaiApiVersion
    subscriptionId: subscriptionId
    tenantId: tenantId
    easyAuthClientId: easyAuthClientId
    subscriptionDisplayLabel: subscriptionDisplayLabel
    rgAllowlist: rgAllowlist
    corsOrigin: corsOrigin
    containerImage: containerImage
  }
}

// ── Module: Custom Role Definition (subscription scope) ──────────────────────
// Defines the custom ark3-RGDeletion role at subscription scope.
// This must complete before the sandbox RG assignment can reference the role ID.

module roleDefinition 'modules/roleAssignments.bicep' = {
  name: 'roleDefinition'
  params: {
    subscriptionId: subscriptionId
  }
}

// ── Module: Resource-level Role Assignments (control RG scope) ────────────────
// AcrPull, Storage Blob Data Contributor, Storage Table Data Contributor,
// Key Vault Secrets User, Cognitive Services OpenAI User — all scoped to
// individual resources within the control resource group.

module roleAssignmentsControlRG 'modules/roleAssignmentsControlRG.bicep' = {
  name: 'roleAssignmentsControlRG'
  scope: controlRg
  params: {
    identityPrincipalId: identity.outputs.identityPrincipalId
    registryName: registry.outputs.registryName
    storageAccountName: storage.outputs.storageAccountName
    keyVaultName: keyVault.outputs.keyVaultName
    openAIAccountName: model.outputs.accountName
  }
}

// ── Module: Sandbox RG Deletion Assignment (sandbox RG scope) ─────────────────
// Assigns the custom ark3-RGDeletion role, scoped ONLY to the sandbox target RG.
// Does NOT grant subscription-wide Contributor or any broader permissions.

module roleAssignmentsSandboxRG 'modules/roleAssignmentsSandboxRG.bicep' = {
  name: 'roleAssignmentsSandboxRG'
  scope: sandboxRg
  params: {
    identityPrincipalId: identity.outputs.identityPrincipalId
    rgDeletionRoleId: roleDefinition.outputs.rgDeletionRoleId
    sandboxRgName: sandboxRgName
  }
}

// ── Outputs ────────────────────────────────────────────────────────────────────
// Only non-sensitive resource names and endpoints are output.
// No secrets, keys, connection strings with credentials, or token values are output.

@description('Name of the control resource group containing all app infrastructure')
output controlResourceGroupName string = controlRg.name

@description('Name of the disposable sandbox target resource group')
output sandboxResourceGroupName string = sandboxRg.name

@description('Name of the user-assigned managed identity')
output identityName string = identity.outputs.identityName

@description('Client ID of the managed identity — set as AZURE_CLIENT_ID in Container App env post-deploy')
output identityClientId string = identity.outputs.identityClientId

@description('Name of the Log Analytics workspace')
output logAnalyticsName string = monitoring.outputs.logAnalyticsName

@description('Name of the Application Insights component')
output appInsightsName string = monitoring.outputs.appInsightsName

@description('Name of the Container Registry')
output registryName string = registry.outputs.registryName

@description('Login server of the Container Registry (e.g. crark3<suffix>.azurecr.io)')
output registryLoginServer string = registry.outputs.registryLoginServer

@description('Name of the storage account')
output storageAccountName string = storage.outputs.storageAccountName

@description('Blob service endpoint')
output blobEndpoint string = storage.outputs.blobEndpoint

@description('Table service endpoint')
output tableEndpoint string = storage.outputs.tableEndpoint

@description('Name of the Key Vault')
output keyVaultName string = keyVault.outputs.keyVaultName

@description('URI of the Key Vault — set as AZURE_KEY_VAULT_URI in Container App env')
output keyVaultUri string = keyVault.outputs.keyVaultUri

@description('Name of the Azure OpenAI account')
output openAIAccountName string = model.outputs.accountName

@description('Azure OpenAI endpoint — set as AZURE_VISION_ENDPOINT in Container App env')
output openAIEndpoint string = model.outputs.endpoint

@description('Name of the Container App')
output containerAppName string = containerApp.outputs.containerAppName

@description('Fully qualified domain name of the Container App (public ingress URL)')
output containerAppFqdn string = containerApp.outputs.containerAppFqdn

@description('Whether Easy Auth was configured in this deployment')
output easyAuthConfigured bool = containerApp.outputs.easyAuthConfigured

@description('Custom RG deletion role name')
output rgDeletionRoleName string = roleDefinition.outputs.rgDeletionRoleName

// ── Post-deploy setup requirements ───────────────────────────────────────────
//
// The following steps MUST be completed by a human operator after deployment:
//
// 1. AZURE_CLIENT_ID env var:
//    az containerapp update --name <containerAppName> -g <controlRgName> \
//      --set-env-vars AZURE_CLIENT_ID=<identityClientId output>
//
// 2. Device token verifier secret (see docs/device-token-ops.md):
//    az keyvault secret set --vault-name <keyVaultName> \
//      --name device-token-verifier --value <sha256-hash-of-device-token>
//
// 3. Easy Auth (Entra app registration):
//    a. Register an Entra app at https://portal.azure.com → App registrations
//    b. Set redirect URI: https://<containerAppFqdn>/.auth/login/aad/callback
//    c. Enable ID token implicit grant
//    d. Re-deploy with: --parameters easyAuthClientId=<appClientId> tenantId=<tenantId>
//
// 4. ACR registry link (one-time, post role assignment propagation ~2 min):
//    az containerapp registry set \
//      --name <containerAppName> -g <controlRgName> \
//      --server <registryLoginServer> \
//      --identity <identityId output from identity module>
//
// 5. Build and push app image:
//    az acr build --registry <registryLoginServer> \
//      --image ark3-api:latest apps/backend
//    az containerapp update --name <containerAppName> -g <controlRgName> \
//      --image <registryLoginServer>/ark3-api:latest
