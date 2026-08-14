// modules/keyvault.bicep
// Key Vault (Standard SKU, RBAC authorization mode, soft-delete enabled).
//
// IMPORTANT — No secret resources are created by this template.
// The device-token verifier hash is generated out-of-band and stored post-deploy:
//
//   Post-deploy secret creation order:
//   1. Generate a device token and compute its verifier hash (see docs/device-token-ops.md).
//   2. Store ONLY the verifier hash in Key Vault:
//        az keyvault secret set \
//          --vault-name <kvName> \
//          --name "device-token-verifier" \
//          --value "<sha256-hash>"
//   3. The Container App reads the secret via its Key Vault URI env var and the
//      managed identity's Key Vault Secrets User role (assigned in roleAssignments.bicep).
//
// Container Apps Key Vault secret reference requires the secret to exist before
// the Container App can resolve it. Use the `secretUri` environment variable pattern
// rather than the Container Apps `secrets` + `secretRef` pattern, so the app starts
// with a placeholder env var and resolves the secret at runtime via the SDK.

@description('Azure region for all resources')
param location string

@description('Short unique suffix for globally unique Key Vault name')
param suffix string

@description('Resource tags applied to all resources in this module')
param tags object

var kvName = 'kv-ark3-${suffix}'

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: kvName
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true // RBAC mode — access policies NOT used
    enableSoftDelete: true
    softDeleteRetentionInDays: 7 // Minimum; appropriate for dev/test environment
    enablePurgeProtection: false // Not required for dev; set true before production use
    publicNetworkAccess: 'Enabled' // Container App accesses over internet (no VNet)
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

// ── Diagnostic Settings (to Log Analytics) ────────────────────────────────────
// Wired by main.bicep after monitoring module outputs are available.
// The diagnosticSettingsId output lets callers add a diagnostic settings resource.

// ── Outputs ───────────────────────────────────────────────────────────────────

@description('Name of the Key Vault')
output keyVaultName string = keyVault.name

@description('Resource ID of the Key Vault')
output keyVaultId string = keyVault.id

@description('URI of the Key Vault (used in AZURE_KEY_VAULT_URI env var)')
output keyVaultUri string = keyVault.properties.vaultUri
