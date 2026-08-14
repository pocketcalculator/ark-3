// modules/containerApp.bicep
// Container App Environment (Consumption) + Container App.
//
// ── Bootstrap image ──────────────────────────────────────────────────────────
// The Container App is initially deployed with a public placeholder image.
// ACR admin is disabled; the real app image is pushed post-deploy via CI:
//
//   1. Build and push to ACR:
//        az acr build --registry <acrLoginServer> --image ark3-api:latest apps/backend
//   2. Link managed identity to ACR (one-time, post-role-assignment):
//        az containerapp registry set \
//          --name <containerAppName> -g <rgName> \
//          --server <acrLoginServer> \
//          --identity <identityResourceId>
//   3. Update container image:
//        az containerapp update \
//          --name <containerAppName> -g <rgName> \
//          --image <acrLoginServer>/ark3-api:latest
//   CI pipelines repeat steps 1 and 3 on every merge to main.
//
// ── Easy Auth v2 (Microsoft Entra) ───────────────────────────────────────────
// Easy Auth protects all paths EXCEPT /api/device/upload and /api/health.
// The exclusion list uses the Container Apps authConfig `excludedPaths` feature.
//
// ⚠️  Easy Auth requires a registered Entra app (client ID + tenant ID).
//     These are PARAMETERS — never embed actual IDs in source control.
//     Provide them at deploy time or post-deploy via:
//       az containerapp auth microsoft update \
//         --name <caName> -g <rgName> \
//         --client-id <clientId> --tenant-id <tenantId>
//
//     Required app registration settings (human setup):
//       - Redirect URI: https://<containerApp.fqdn>/.auth/login/aad/callback
//       - Implicit grant: ID tokens enabled
//       - Supported account types: Single tenant (your org only)
//       - Client secret: NOT needed for Easy Auth v2 (uses OIDC discovery)
//
//     Leave easyAuthEnabled = false until app registration is complete to avoid
//     locking out all access before credentials are configured.
//
// ── Key Vault secret reference ────────────────────────────────────────────────
// The device-token verifier secret is read at runtime via the Azure SDK using
// the managed identity — NOT via Container Apps `secretRef` pattern. This avoids
// requiring the secret to exist at deploy time. The app receives:
//   AZURE_KEY_VAULT_URI          → Key Vault URI
//   ARK3_DEVICE_TOKEN_SECRET_NAME → secret name to retrieve at startup

@description('Azure region for all resources')
param location string

@description('Short unique suffix')
param suffix string

@description('Resource tags applied to all resources')
param tags object

@description('Resource ID of the user-assigned managed identity')
param identityId string

@description('Client ID of the user-assigned managed identity — used as AZURE_CLIENT_ID env var for DefaultAzureCredential')
param identityClientId string

@description('Log Analytics workspace customer ID')
param logAnalyticsCustomerId string

@description('Log Analytics primary shared key (marked @secure() at call site)')
@secure()
param logAnalyticsPrimarySharedKey string

@description('Application Insights connection string')
param appInsightsConnectionString string

@description('Application Insights instrumentation key')
param appInsightsInstrumentationKey string

@description('Storage account name (env var AZURE_STORAGE_ACCOUNT_NAME)')
param storageAccountName string

@description('Table approvals name')
param approvalTableName string

@description('Key Vault URI (env var AZURE_KEY_VAULT_URI)')
param keyVaultUri string

@description('Azure OpenAI endpoint (env var ARK3_OPENAI_ENDPOINT)')
param visionEndpoint string

@description('Azure OpenAI model deployment name (env var ARK3_OPENAI_DEPLOYMENT_NAME)')
param visionModelDeploymentName string

@description('Azure OpenAI API version (env var ARK3_OPENAI_API_VERSION)')
param openaiApiVersion string = '2026-03-17'

@description('Azure subscription ID — supply as parameter, never hard-code')
@secure()
param subscriptionId string

@description('Human-readable subscription display label (env var ARK3_AZURE_SUBSCRIPTION_DISPLAY_LABEL)')
param subscriptionDisplayLabel string = ''

@description('Comma-separated RG allowlist (env var ARK3_RG_ALLOWLIST). Required in production.')
param rgAllowlist string = ''

@description('CORS allowed origin — must match the Container App public URL (env var ARK3_CORS_ORIGIN)')
param corsOrigin string

@description('Azure tenant ID — supply as parameter, never hard-code')
@secure()
param tenantId string

@description('Entra app registration client ID for Easy Auth — supply as parameter, never hard-code. Set to empty string to skip Easy Auth configuration (pre-registration).')
param easyAuthClientId string = ''

@description('Bootstrap container image. Replaced by CI after first real build. Default is MCR hello-world.')
param containerImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('Container app target port')
param targetPort int = 3000

@description('Minimum replicas (0 = scale to zero; increase to 1 to avoid cold starts in testing)')
param minReplicas int = 0

@description('Maximum replicas')
param maxReplicas int = 3

// Easy Auth is only configured when a client ID has been provided.
var easyAuthEnabled = !empty(easyAuthClientId)

// ── Container Apps Environment ────────────────────────────────────────────────

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-ark3-${suffix}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsCustomerId
        sharedKey: logAnalyticsPrimarySharedKey
      }
    }
    zoneRedundant: false // Consumption plan, dev environment
  }
}

// ── Container App ─────────────────────────────────────────────────────────────

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-ark3-${suffix}'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identityId}': {}
    }
  }
  properties: {
    environmentId: environment.id
    configuration: {
      ingress: {
        external: true
        targetPort: targetPort
        transport: 'auto'
        allowInsecure: false
      }
      // No `registries` block here — see bootstrap image note above.
      // CI wires the ACR link post-deploy via `az containerapp registry set`.
    }
    template: {
      containers: [
        {
          name: 'ark3-api'
          image: containerImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            // ── Azure context ──────────────────────────────────────────────
            {
              name: 'ARK3_AZURE_SUBSCRIPTION_ID'
              value: subscriptionId
            }
            {
              name: 'ARK3_AZURE_SUBSCRIPTION_DISPLAY_LABEL'
              value: subscriptionDisplayLabel
            }
            {
              name: 'AZURE_TENANT_ID'
              value: tenantId
            }
            // ── Managed identity client ID (for DefaultAzureCredential) ────
            // Set to the UAMI client ID so DefaultAzureCredential selects it.
            {
              name: 'AZURE_CLIENT_ID'
              value: identityClientId
            }
            // ── Vision model ───────────────────────────────────────────────
            {
              name: 'ARK3_OPENAI_ENDPOINT'
              value: visionEndpoint
            }
            {
              name: 'ARK3_OPENAI_DEPLOYMENT_NAME'
              value: visionModelDeploymentName
            }
            {
              name: 'ARK3_OPENAI_API_VERSION'
              value: openaiApiVersion
            }
            // ── Storage ────────────────────────────────────────────────────
            {
              name: 'ARK3_STORAGE_ACCOUNT_NAME'
              value: storageAccountName
            }
            // ── Table Storage ──────────────────────────────────────────────
            {
              name: 'ARK3_STORAGE_TABLE_NAME'
              value: approvalTableName
            }
            // ── Key Vault ──────────────────────────────────────────────────
            {
              name: 'ARK3_KEYVAULT_URL'
              value: keyVaultUri
            }
            {
              name: 'ARK3_DEVICE_TOKEN_SECRET_NAME'
              value: 'device-token-verifier'
            }
            // ── Resource group allowlist ───────────────────────────────────
            {
              name: 'ARK3_RG_ALLOWLIST'
              value: rgAllowlist
            }
            // ── CORS / same-origin UI ──────────────────────────────────────
            {
              name: 'ARK3_CORS_ORIGIN'
              value: corsOrigin
            }
            // ── Application Insights ───────────────────────────────────────
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: appInsightsConnectionString
            }
            {
              name: 'APPINSIGHTS_INSTRUMENTATIONKEY'
              value: appInsightsInstrumentationKey
            }
            // ── App / Server ───────────────────────────────────────────────
            {
              name: 'PORT'
              value: '${targetPort}'
            }
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'ARK3_AUTH_BYPASS'
              value: 'false'
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '10'
              }
            }
          }
        ]
      }
    }
  }
}

// ── Easy Auth v2 (Microsoft Entra) ────────────────────────────────────────────
// Only deployed when easyAuthClientId is provided. All paths are protected
// except /api/device/upload and /api/health (device + health check bypass).
//
// ⚠️ Human setup required before enabling:
//    1. Register an Entra app (single-tenant).
//    2. Add redirect URI: https://<fqdn>/.auth/login/aad/callback
//    3. Enable ID token implicit grant.
//    4. Provide client ID + tenant ID as parameters to this module.
//    5. After deploying, verify authentication at /.auth/me.

resource authConfig 'Microsoft.App/containerApps/authConfigs@2024-03-01' = if (easyAuthEnabled) {
  parent: containerApp
  name: 'current'
  properties: {
    globalValidation: {
      unauthenticatedClientAction: 'RedirectToLoginPage'
      redirectToProvider: 'azureactivedirectory'
      // Exclude device upload endpoint (per-device bearer token auth instead)
      // and health check endpoint (public monitoring)
      excludedPaths: [
        '/api/device/upload'
        '/api/health'
      ]
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          // ⚠️ tenantId and clientId must be supplied as parameters — never literals.
          // These are placeholders populated by Bicep parameter injection at deploy time.
          openIdIssuer: 'https://sts.windows.net/${tenantId}/v2.0'
          clientId: easyAuthClientId
        }
        validation: {
          allowedAudiences: [
            'api://${easyAuthClientId}'
          ]
        }
      }
    }
    login: {
      preserveUrlFragmentsForLogins: false
      tokenStore: {
        enabled: true
      }
    }
    platform: {
      enabled: true
      runtimeVersion: '~1'
    }
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────

@description('Name of the Container App')
output containerAppName string = containerApp.name

@description('Resource ID of the Container App')
output containerAppId string = containerApp.id

@description('Fully qualified domain name of the Container App (public ingress)')
output containerAppFqdn string = containerApp.properties.configuration.ingress.fqdn

@description('Name of the Container Apps Environment')
output environmentName string = environment.name

@description('Resource ID of the Container Apps Environment')
output environmentId string = environment.id

@description('Whether Easy Auth was configured in this deployment')
output easyAuthConfigured bool = easyAuthEnabled
