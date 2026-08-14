// modules/identity.bicep
// Creates the user-assigned managed identity used by all backend-to-Azure access paths.
// This module must be deployed before any module that references the identity principalId.

@description('Azure region for all resources')
param location string

@description('Short unique suffix derived from subscription + RG, e.g. uniqueString()')
param suffix string

@description('Resource tags applied to all resources in this module')
param tags object

// ── User-Assigned Managed Identity ───────────────────────────────────────────

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-ark3-${suffix}'
  location: location
  tags: tags
}

// ── Outputs ──────────────────────────────────────────────────────────────────

@description('Resource ID of the user-assigned managed identity')
output identityId string = identity.id

@description('Client ID of the user-assigned managed identity (used in app env vars)')
output identityClientId string = identity.properties.clientId

@description('Principal ID of the user-assigned managed identity (used in role assignments)')
output identityPrincipalId string = identity.properties.principalId

@description('Name of the user-assigned managed identity')
output identityName string = identity.name
