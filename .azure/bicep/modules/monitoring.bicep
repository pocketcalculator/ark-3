// modules/monitoring.bicep
// Log Analytics Workspace + Application Insights.
// All Container Apps log traffic flows here; App Insights provides custom event telemetry.

@description('Azure region for all resources')
param location string

@description('Short unique suffix for globally unique names')
param suffix string

@description('Resource tags applied to all resources in this module')
param tags object

// ── Log Analytics Workspace ───────────────────────────────────────────────────

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: 'log-ark3-${suffix}'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 90
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    publicNetworkAccessForIngestion: 'Enabled' // Device uploads traverse public internet
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// ── Application Insights ──────────────────────────────────────────────────────

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-ark3-${suffix}'
  location: location
  kind: 'web'
  tags: tags
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
    RetentionInDays: 90
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────

@description('Resource ID of the Log Analytics workspace')
output logAnalyticsId string = logAnalytics.id

@description('Customer ID (workspace ID) used to link Container App environment')
output logAnalyticsCustomerId string = logAnalytics.properties.customerId

@description('Primary shared key for Container App environment log wiring')
@secure()
output logAnalyticsPrimarySharedKey string = logAnalytics.listKeys().primarySharedKey

@description('Application Insights connection string (non-secret endpoint metadata)')
output appInsightsConnectionString string = appInsights.properties.ConnectionString

@description('Application Insights instrumentation key')
output appInsightsInstrumentationKey string = appInsights.properties.InstrumentationKey

@description('Resource ID of Application Insights')
output appInsightsId string = appInsights.id

@description('Name of the Log Analytics workspace')
output logAnalyticsName string = logAnalytics.name

@description('Name of the Application Insights component')
output appInsightsName string = appInsights.name
