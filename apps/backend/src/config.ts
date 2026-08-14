/**
 * Strict configuration loader.
 *
 * Destructive behaviour has NO permissive defaults: in production every Azure
 * resource identifier and the CORS origin are required, and the auth bypass is
 * rejected outright unless the process is unambiguously a local development run.
 */

export type NodeEnv = "development" | "production" | "test";

export type BlobStorageProviderKind = "azure" | "azurite" | "memory";

export interface Config {
  readonly nodeEnv: NodeEnv;
  readonly port: number;
  readonly azureSubscriptionId: string;
  readonly azureSubscriptionDisplayLabel: string;
  readonly rgAllowlist: readonly string[];
  readonly openaiEndpoint: string;
  readonly openaiDeploymentName: string;
  readonly openaiApiVersion: string;
  readonly storageAccountName: string;
  readonly storageTableName: string;
  readonly keyvaultUrl: string;
  readonly deviceTokenSecretName: string;
  readonly authBypass: boolean;
  readonly dailyDeletionCap: number;
  readonly deviceRateLimitRpm: number;
  readonly corsOrigin: string;
  readonly approverRole: string;
  readonly blobStorageProvider: BlobStorageProviderKind;
  readonly azuriteConnectionString: string | undefined;
}

export type EnvSource = Record<string, string | undefined>;

function readNodeEnv(env: EnvSource): NodeEnv {
  const raw = env["NODE_ENV"];
  if (raw === "production" || raw === "development" || raw === "test") {
    return raw;
  }
  return "development";
}

function readInt(env: EnvSource, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    throw new Error(`Invalid integer for ${name}: "${raw}"`);
  }
  return parsed;
}

function readBlobProvider(env: EnvSource): BlobStorageProviderKind {
  const raw = env["ARK3_BLOB_STORAGE_PROVIDER"];
  if (raw === "azure" || raw === "azurite" || raw === "memory") {
    return raw;
  }
  return "azure";
}

function parseAllowlist(raw: string | undefined): string[] {
  if (raw === undefined) {
    return [];
  }
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function loadConfig(env: EnvSource = process.env): Config {
  const nodeEnv = readNodeEnv(env);
  const isProduction = nodeEnv === "production";

  const authBypass = env["ARK3_AUTH_BYPASS"] === "true";

  // Production safety: the bypass must never be reachable outside a local
  // development run. Any managed-identity indicator or non-dev NODE_ENV is a
  // hard failure when bypass is requested.
  if (authBypass) {
    if (nodeEnv !== "development") {
      throw new Error(
        `ARK3_AUTH_BYPASS=true is only permitted when NODE_ENV=development (got NODE_ENV=${nodeEnv})`,
      );
    }
    if (env["IDENTITY_ENDPOINT"] !== undefined || env["MSI_ENDPOINT"] !== undefined) {
      throw new Error(
        "ARK3_AUTH_BYPASS=true refused: a managed identity endpoint is present, indicating a hosted environment",
      );
    }
  }

  const requiredInProduction: string[] = [];
  const requireProd = (name: string, value: string | undefined): string => {
    if (isProduction && (value === undefined || value.trim() === "")) {
      requiredInProduction.push(name);
    }
    return value ?? "";
  };

  const azureSubscriptionId = requireProd(
    "ARK3_AZURE_SUBSCRIPTION_ID",
    env["ARK3_AZURE_SUBSCRIPTION_ID"],
  );
  const azureSubscriptionDisplayLabel = requireProd(
    "ARK3_AZURE_SUBSCRIPTION_DISPLAY_LABEL",
    env["ARK3_AZURE_SUBSCRIPTION_DISPLAY_LABEL"],
  );
  const openaiEndpoint = requireProd(
    "ARK3_OPENAI_ENDPOINT",
    env["ARK3_OPENAI_ENDPOINT"],
  );
  const openaiDeploymentName = requireProd(
    "ARK3_OPENAI_DEPLOYMENT_NAME",
    env["ARK3_OPENAI_DEPLOYMENT_NAME"],
  );
  const storageAccountName = requireProd(
    "ARK3_STORAGE_ACCOUNT_NAME",
    env["ARK3_STORAGE_ACCOUNT_NAME"],
  );
  const keyvaultUrl = requireProd("ARK3_KEYVAULT_URL", env["ARK3_KEYVAULT_URL"]);
  const corsOrigin = requireProd("ARK3_CORS_ORIGIN", env["ARK3_CORS_ORIGIN"]);

  const rgAllowlist = parseAllowlist(env["ARK3_RG_ALLOWLIST"]);
  if (isProduction && rgAllowlist.length === 0) {
    requiredInProduction.push("ARK3_RG_ALLOWLIST");
  }

  if (requiredInProduction.length > 0) {
    throw new Error(
      `Missing required production configuration: ${requiredInProduction.join(", ")}`,
    );
  }

  return {
    nodeEnv,
    port: readInt(env, "PORT", 3000),
    azureSubscriptionId,
    azureSubscriptionDisplayLabel,
    rgAllowlist,
    openaiEndpoint,
    openaiDeploymentName,
    openaiApiVersion: env["ARK3_OPENAI_API_VERSION"] ?? "2026-03-17",
    storageAccountName,
    storageTableName: env["ARK3_STORAGE_TABLE_NAME"] ?? "approvals",
    keyvaultUrl,
    deviceTokenSecretName:
      env["ARK3_DEVICE_TOKEN_SECRET_NAME"] ?? "ark3-device-token-hash",
    authBypass,
    dailyDeletionCap: readInt(env, "ARK3_DAILY_DELETION_CAP", 10),
    deviceRateLimitRpm: readInt(env, "ARK3_DEVICE_RATE_LIMIT_RPM", 10),
    corsOrigin,
    approverRole: env["ARK3_APPROVER_ROLE"] ?? "approver",
    blobStorageProvider: readBlobProvider(env),
    azuriteConnectionString: env["AZURITE_CONNECTION_STRING"],
  };
}

/** Fields safe to log at startup (secret values and connection strings excluded). */
export function redactConfigForLog(config: Config): Record<string, unknown> {
  return {
    nodeEnv: config.nodeEnv,
    port: config.port,
    azureSubscriptionDisplayLabel: config.azureSubscriptionDisplayLabel,
    rgAllowlistCount: config.rgAllowlist.length,
    openaiEndpoint: config.openaiEndpoint,
    openaiDeploymentName: config.openaiDeploymentName,
    openaiApiVersion: config.openaiApiVersion,
    storageAccountName: config.storageAccountName,
    storageTableName: config.storageTableName,
    keyvaultUrlConfigured: config.keyvaultUrl.length > 0,
    deviceTokenSecretName: config.deviceTokenSecretName,
    authBypass: config.authBypass,
    dailyDeletionCap: config.dailyDeletionCap,
    deviceRateLimitRpm: config.deviceRateLimitRpm,
    corsOrigin: config.corsOrigin,
    blobStorageProvider: config.blobStorageProvider,
  };
}
