// modules/model.bicep
// Azure OpenAI / Cognitive Services account + model deployment.
//
// Parameterized model name, version, and SKU allow the operator to select the
// currently-available multimodal model at deploy time without template changes.
//
// Default parameters reflect the plan-agreed values:
//   model:   gpt-5.4-mini  (⚠️ verify availability in canadacentral before deploying)
//   version: 2026-03-17     (⚠️ verify current version before deploying)
//   sku:     GlobalStandard
//
// The app accesses the model endpoint via DefaultAzureCredential / managed identity;
// no API keys are used. Role: Cognitive Services OpenAI User (roleAssignments.bicep).
//
// ⚠️ Quota: GlobalStandard deployments share quota across a subscription.
//    Validate tokens-per-minute (TPM) quota before deploying:
//      az cognitiveservices account deployment list --name <accountName> -g <rgName>
//    Request quota increases at https://aka.ms/oai/quotaincrease if needed.

@description('Azure region for all resources')
param location string

@description('Short unique suffix for globally unique Cognitive Services account name')
param suffix string

@description('Resource tags applied to all resources in this module')
param tags object

@description('Model name for the vision deployment (e.g. gpt-5.4-mini, gpt-4o)')
param modelName string = 'gpt-5.4-mini'

@description('Model version — verify current lifecycle before deploying')
param modelVersion string = '2026-03-17'

@description('Deployment SKU name (e.g. GlobalStandard, Standard)')
param modelSkuName string = 'GlobalStandard'

@description('Tokens-per-minute capacity for the model deployment (in thousands)')
param modelCapacity int = 10

@description('Name for the model deployment (used in API calls and env var AZURE_VISION_MODEL_DEPLOYMENT)')
param modelDeploymentName string = 'ark3-vision'

var accountName = 'oai-ark3-${suffix}'

// ── Azure OpenAI Account ──────────────────────────────────────────────────────

resource openAIAccount 'Microsoft.CognitiveServices/accounts@2024-04-01-preview' = {
  name: accountName
  location: location
  tags: tags
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  identity: {
    type: 'None' // Account uses caller's managed identity; no system identity needed
  }
  properties: {
    publicNetworkAccess: 'Enabled' // Required: Container App accesses over internet
    customSubDomainName: accountName // Required for Entra/managed identity auth
    disableLocalAuth: false // Keep enabled; app uses managed identity via DefaultAzureCredential
    networkAcls: {
      defaultAction: 'Allow'
    }
  }
}

// ── Model Deployment ──────────────────────────────────────────────────────────

resource modelDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-04-01-preview' = {
  parent: openAIAccount
  name: modelDeploymentName
  sku: {
    name: modelSkuName
    capacity: modelCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: modelName
      version: modelVersion
    }
    raiPolicyName: 'Microsoft.Default' // Use default content filtering policy
    versionUpgradeOption: 'NoAutoUpgrade' // Pin version; explicit upgrades only
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────

@description('Name of the Azure OpenAI account')
output accountName string = openAIAccount.name

@description('Resource ID of the Azure OpenAI account')
output accountId string = openAIAccount.id

@description('Azure OpenAI endpoint (used in AZURE_VISION_ENDPOINT env var)')
output endpoint string = openAIAccount.properties.endpoint

@description('Name of the model deployment (used in AZURE_VISION_MODEL_DEPLOYMENT env var)')
output deploymentName string = modelDeployment.name
