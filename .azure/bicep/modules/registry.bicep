// modules/registry.bicep
// Azure Container Registry (Basic SKU, admin credentials disabled).
//
// ACR admin is intentionally disabled. Images are pulled by the Container App
// using the user-assigned managed identity with the AcrPull role (assigned in
// roleAssignments.bicep). CI/CD pushes images using `az acr build` or
// `docker push` authenticated via `az acr login --expose-token`.
//
// Bootstrap / first-image flow (documented for operators):
//   1. Deploy IaC → Container App starts with the bootstrap public image (mcr.microsoft.com/k8se/quickstart:latest).
//   2. Build and push the real image:
//        az acr build --registry <acrName> --image ark3-api:latest apps/backend
//   3. Update the Container App image:
//        az containerapp update --name <caName> --resource-group <rgName> \
//          --image <acrName>.azurecr.io/ark3-api:latest
//   CI pipelines repeat step 2-3 on every merge to main.

@description('Azure region for all resources')
param location string

@description('Short unique suffix — must be alphanumeric (ACR name constraint)')
param suffix string

@description('Resource tags applied to all resources in this module')
param tags object

// ACR name: alphanumeric only, 5–50 chars. Strip hyphens from suffix.
var acrName = 'crark3${replace(suffix, '-', '')}'

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false // Admin disabled; pull via managed identity AcrPull role
    publicNetworkAccess: 'Enabled' // Required: Container App must reach ACR over internet (no VNet)
    zoneRedundancy: 'Disabled' // Basic SKU does not support zone redundancy
    policies: {
      exportPolicy: {
        status: 'enabled'
      }
    }
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────

@description('Resource ID of the Container Registry')
output registryId string = registry.id

@description('Name of the Container Registry (alphanumeric)')
output registryName string = registry.name

@description('Login server hostname, e.g. crark3<suffix>.azurecr.io')
output registryLoginServer string = registry.properties.loginServer
