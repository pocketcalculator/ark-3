import { ResourceManagementClient } from "@azure/arm-resources";
import { DefaultAzureCredential } from "@azure/identity";
import { ApiError } from "../errors.js";

export interface ResolvedResourceGroup {
  /** Canonical casing as returned by Azure. */
  readonly name: string;
  /** Canonical ARM resource group ID. */
  readonly id: string;
  readonly tags: Record<string, string>;
}

export interface ArmProvider {
  /** Case-insensitive lookup within the single configured subscription. */
  lookupResourceGroup(nameInsensitive: string): Promise<ResolvedResourceGroup | null>;
  deleteResourceGroup(canonicalId: string): Promise<void>;
}

function normalizeTags(tags: { [propertyName: string]: string } | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (tags !== undefined) {
    for (const [key, value] of Object.entries(tags)) {
      out[key] = value;
    }
  }
  return out;
}

/** Production ARM provider backed by @azure/arm-resources. */
export class AzureArmProvider implements ArmProvider {
  private readonly client: ResourceManagementClient;

  public constructor(subscriptionId: string) {
    this.client = new ResourceManagementClient(
      new DefaultAzureCredential(),
      subscriptionId,
    );
  }

  public async lookupResourceGroup(
    nameInsensitive: string,
  ): Promise<ResolvedResourceGroup | null> {
    const target = nameInsensitive.toLowerCase();
    const matches: ResolvedResourceGroup[] = [];
    for await (const group of this.client.resourceGroups.list()) {
      if (
        group.name !== undefined &&
        group.id !== undefined &&
        group.name.toLowerCase() === target
      ) {
        matches.push({
          name: group.name,
          id: group.id,
          tags: normalizeTags(group.tags),
        });
      }
    }
    if (matches.length === 0) {
      return null;
    }
    if (matches.length > 1) {
      throw new ApiError(
        "RG_AMBIGUOUS",
        `Multiple resource groups match "${nameInsensitive}"`,
      );
    }
    const [only] = matches;
    return only ?? null;
  }

  public async deleteResourceGroup(canonicalId: string): Promise<void> {
    const name = parseRgNameFromId(canonicalId);
    await this.client.resourceGroups.beginDeleteAndWait(name);
  }
}

function parseRgNameFromId(canonicalId: string): string {
  const match = /\/resourceGroups\/([^/]+)$/.exec(canonicalId);
  if (match === null || match[1] === undefined) {
    throw new ApiError("VALIDATION_FAILED", `Invalid canonical RG id: ${canonicalId}`);
  }
  return match[1];
}

/**
 * Local/dev ARM provider. Resolves against a fixed in-memory set and NEVER
 * performs live deletion — deleteResourceGroup always throws.
 */
export class FakeArmProvider implements ArmProvider {
  private readonly groups: ResolvedResourceGroup[];

  public constructor(groups: readonly ResolvedResourceGroup[]) {
    this.groups = [...groups];
  }

  public lookupResourceGroup(
    nameInsensitive: string,
  ): Promise<ResolvedResourceGroup | null> {
    const target = nameInsensitive.toLowerCase();
    const matches = this.groups.filter(
      (group) => group.name.toLowerCase() === target,
    );
    if (matches.length === 0) {
      return Promise.resolve(null);
    }
    if (matches.length > 1) {
      throw new ApiError(
        "RG_AMBIGUOUS",
        `Multiple resource groups match "${nameInsensitive}"`,
      );
    }
    const [only] = matches;
    return Promise.resolve(only ?? null);
  }

  public deleteResourceGroup(): Promise<void> {
    throw new Error("FATAL: Deletion is disabled in local/test mode");
  }
}
