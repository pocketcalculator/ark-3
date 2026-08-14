// modules/roleAssignments.bicep
// Custom role definition (subscription scope) for sandbox RG deletion.
//
// Role assignment scoping strategy:
//   Resource-level assignments (ACR, Storage, KV, OpenAI) are made in
//   roleAssignmentsControlRG.bicep, deployed at resource-group scope.
//   The sandbox deletion assignment is made in roleAssignmentsSandboxRG.bicep,
//   deployed at sandbox RG scope.
//   This module only defines the custom role at subscription scope.
//
// Custom role grants ONLY:
//   Microsoft.Resources/subscriptions/resourceGroups/read   — validate RG before delete
//   Microsoft.Resources/subscriptions/resourceGroups/delete — execute deletion
// This is significantly narrower than Contributor.

targetScope = 'subscription'

@description('Azure subscription ID — used to scope the custom role definition')
param subscriptionId string

// ── Custom Role: RG Deletion ──────────────────────────────────────────────────

resource rgDeletionRole 'Microsoft.Authorization/roleDefinitions@2022-04-01' = {
  name: guid(subscriptionId, 'ark3-rg-deletion-custom-role')
  properties: {
    roleName: 'ark3-RGDeletion-${uniqueString(subscriptionId)}'
    description: 'Allows reading and deleting a resource group. Assigned only on the ark3 sandbox target RG — does not grant any child resource write permissions.'
    assignableScopes: [
      '/subscriptions/${subscriptionId}'
    ]
    permissions: [
      {
        actions: [
          'Microsoft.Resources/subscriptions/resourceGroups/read'
          'Microsoft.Resources/subscriptions/resourceGroups/delete'
        ]
        notActions: []
        dataActions: []
        notDataActions: []
      }
    ]
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────

@description('Resource ID of the custom RG deletion role definition')
output rgDeletionRoleId string = rgDeletionRole.id

@description('Name of the custom RG deletion role')
output rgDeletionRoleName string = rgDeletionRole.properties.roleName
