// modules/storage.bicep
// StorageV2 Standard_LRS with:
//   - Blob container `uploads` (captured device images)
//   - Table storage service + table `approvals` (approval state records)
//   - Lifecycle policy: delete blobs after 7 days (aligns with 7-day approval window)
//
// Access is via user-assigned managed identity:
//   Storage Blob Data Contributor  — read/write images
//   Storage Table Data Contributor — read/write approval records
// No storage account keys are used by the application.

@description('Azure region for all resources')
param location string

@description('Short unique suffix for globally unique storage account name')
param suffix string

@description('Resource tags applied to all resources in this module')
param tags object

@description('Name of the blob container for device image uploads')
param uploadsContainerName string = 'uploads'

@description('Name of the Table Storage table for approval records')
param approvalTableName string = 'approvals'

// Storage account name: lowercase alphanumeric only, 3–24 chars
var storageAccountName = 'stark3${replace(toLower(suffix), '-', '')}'

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false // No anonymous blob access ever
    allowSharedKeyAccess: false // Managed identity authentication only
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Enabled' // Container App accesses over internet (no VNet injection)
    encryption: {
      services: {
        blob: { enabled: true }
        table: { enabled: true }
      }
      keySource: 'Microsoft.Storage'
    }
  }
}

// ── Blob Service ──────────────────────────────────────────────────────────────

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 7
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: 7
    }
  }
}

// ── Uploads Container ─────────────────────────────────────────────────────────

resource uploadsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: uploadsContainerName
  properties: {
    publicAccess: 'None' // Images served only through authenticated API endpoint
    metadata: {}
  }
}

// ── Lifecycle Policy (delete blobs after 7 days) ──────────────────────────────

resource lifecyclePolicy 'Microsoft.Storage/storageAccounts/managementPolicies@2023-01-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    policy: {
      rules: [
        {
          name: 'delete-uploads-after-7-days'
          enabled: true
          type: 'Lifecycle'
          definition: {
            filters: {
              blobTypes: ['blockBlob']
              prefixMatch: ['${uploadsContainerName}/']
            }
            actions: {
              baseBlob: {
                delete: {
                  daysAfterModificationGreaterThan: 7
                }
              }
            }
          }
        }
      ]
    }
  }
  dependsOn: [uploadsContainer]
}

// ── Table Service ─────────────────────────────────────────────────────────────

resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

resource approvalTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-01-01' = {
  parent: tableService
  name: approvalTableName
}

// ── Outputs ───────────────────────────────────────────────────────────────────

@description('Name of the storage account')
output storageAccountName string = storageAccount.name

@description('Resource ID of the storage account')
output storageAccountId string = storageAccount.id

@description('Blob service primary endpoint')
output blobEndpoint string = storageAccount.properties.primaryEndpoints.blob

@description('Table service primary endpoint')
output tableEndpoint string = storageAccount.properties.primaryEndpoints.table

@description('Name of the uploads blob container')
output uploadsContainerName string = uploadsContainer.name

@description('Name of the approval Table Storage table')
output approvalTableName string = approvalTable.name
