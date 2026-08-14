// modules/roleAssignmentsSandboxRG.bicep
// Assigns the custom RG deletion role to the managed identity, scoped exclusively
// to the sandbox target resource group.
//
// ⚠️ This module is deployed with scope: sandboxRg in main.bicep.
//    The role assignment grants NO permissions outside this resource group.
//    It does NOT grant subscription-wide Contributor or any write access
//    to child resources within the sandbox RG.
//
// The custom role ID is passed from the roleAssignments.bicep output because
// custom role definitions are subscription-scope resources.

@description('Principal ID of the user-assigned managed identity')
param identityPrincipalId string

@description('Resource ID of the custom RG deletion role definition (output from roleAssignments module)')
param rgDeletionRoleId string

@description('Name of this sandbox resource group (used in deterministic GUID seed)')
param sandboxRgName string

// ── Sandbox RG Deletion Assignment ───────────────────────────────────────────

resource sandboxDeletionAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  // Scope is implicitly this resource group (module is deployed at sandboxRg scope)
  name: guid(sandboxRgName, identityPrincipalId, 'ark3-rg-deletion')
  properties: {
    roleDefinitionId: rgDeletionRoleId
    principalId: identityPrincipalId
    principalType: 'ServicePrincipal'
    description: 'Allows managed identity to delete the sandbox target resource group. Scoped only to this RG — no subscription-wide permissions granted.'
  }
}
