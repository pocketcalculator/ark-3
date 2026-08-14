// modules/roleAssignmentsControlRG.bicep
// Resource-level RBAC role assignments for the user-assigned managed identity.
// Deployed at the control resource group scope.
//
// Assignments:
//   1. AcrPull            → Azure Container Registry
//   2. Storage Blob Data Contributor   → Storage Account
//   3. Storage Table Data Contributor  → Storage Account
//   4. Key Vault Secrets User          → Key Vault
//   5. Cognitive Services OpenAI User  → Azure OpenAI account
//
// All GUIDs are deterministic (stable seed inputs) — safe for re-deployment.
// principalType 'ServicePrincipal' avoids a Graph API lookup and speeds propagation.

@description('Principal ID of the user-assigned managed identity')
param identityPrincipalId string

@description('Name of the Azure Container Registry')
param registryName string

@description('Name of the storage account')
param storageAccountName string

@description('Name of the Key Vault')
param keyVaultName string

@description('Name of the Azure OpenAI account')
param openAIAccountName string

// ── Built-in Role Definition IDs ─────────────────────────────────────────────

var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
var storageTableDataContributorRoleId = '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'
var cognitiveServicesOpenAIUserRoleId = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'

// ── Existing resource references ──────────────────────────────────────────────

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: storageAccountName
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource openAIAccount 'Microsoft.CognitiveServices/accounts@2024-04-01-preview' existing = {
  name: openAIAccountName
}

// ── 1. AcrPull ────────────────────────────────────────────────────────────────

resource acrPullAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, identityPrincipalId, acrPullRoleId)
  scope: registry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: identityPrincipalId
    principalType: 'ServicePrincipal'
    description: 'Allows managed identity to pull container images from ACR'
  }
}

// ── 2. Storage Blob Data Contributor ─────────────────────────────────────────

resource blobContributorAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, identityPrincipalId, storageBlobDataContributorRoleId)
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      storageBlobDataContributorRoleId
    )
    principalId: identityPrincipalId
    principalType: 'ServicePrincipal'
    description: 'Allows managed identity to read and write uploaded images in blob storage'
  }
}

// ── 3. Storage Table Data Contributor ────────────────────────────────────────

resource tableContributorAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, identityPrincipalId, storageTableDataContributorRoleId)
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      storageTableDataContributorRoleId
    )
    principalId: identityPrincipalId
    principalType: 'ServicePrincipal'
    description: 'Allows managed identity to read and write approval records in Table Storage'
  }
}

// ── 4. Key Vault Secrets User ─────────────────────────────────────────────────

resource kvSecretsUserAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, identityPrincipalId, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalId: identityPrincipalId
    principalType: 'ServicePrincipal'
    description: 'Allows managed identity to read device token verifier hash from Key Vault'
  }
}

// ── 5. Cognitive Services OpenAI User ────────────────────────────────────────

resource openAIUserAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(openAIAccount.id, identityPrincipalId, cognitiveServicesOpenAIUserRoleId)
  scope: openAIAccount
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      cognitiveServicesOpenAIUserRoleId
    )
    principalId: identityPrincipalId
    principalType: 'ServicePrincipal'
    description: 'Allows managed identity to call the Azure OpenAI inference API'
  }
}
