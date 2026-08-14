import { SecretClient } from "@azure/keyvault-secrets";
import { DefaultAzureCredential } from "@azure/identity";

export interface SecretProvider {
  getSecret(name: string): Promise<string>;
}

/** Production secret provider backed by Azure Key Vault with managed identity. */
export class AzureKeyVaultSecretProvider implements SecretProvider {
  private readonly client: SecretClient;

  public constructor(vaultUrl: string) {
    this.client = new SecretClient(vaultUrl, new DefaultAzureCredential());
  }

  public async getSecret(name: string): Promise<string> {
    const secret = await this.client.getSecret(name);
    if (secret.value === undefined) {
      throw new Error(`Key Vault secret "${name}" has no value`);
    }
    return secret.value;
  }
}

/** Local-only secret provider reading from process.env. Never used in production. */
export class EnvSecretProvider implements SecretProvider {
  private readonly env: Record<string, string | undefined>;

  public constructor(env: Record<string, string | undefined> = process.env) {
    this.env = env;
  }

  public async getSecret(name: string): Promise<string> {
    const value = this.env[name];
    if (value === undefined) {
      throw new Error(`Environment secret "${name}" is not set`);
    }
    return Promise.resolve(value);
  }
}
