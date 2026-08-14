import { ResourceGroupNameSchema } from "@ark-3/contracts";
import { ApiError } from "../errors.js";
import type { ArmProvider, ResolvedResourceGroup } from "../providers/arm.js";

export const DISPOSABLE_TAG_KEY = "ark3-disposable";
export const DISPOSABLE_TAG_VALUE = "true";

export interface ValidateRgOptions {
  readonly name: string;
  readonly allowlist: readonly string[];
  readonly arm: ArmProvider;
}

/**
 * Full server-side resource group validation gate chain:
 *   1. naming grammar (contracts schema)
 *   2. exact case-insensitive ARM lookup (zero → NOT_FOUND, many → AMBIGUOUS)
 *   3. allowlist membership (case-insensitive)
 *   4. disposability tag presence
 *
 * Returns the canonical, Azure-cased resolution on success.
 */
export async function validateResourceGroup(
  options: ValidateRgOptions,
): Promise<ResolvedResourceGroup> {
  const grammar = ResourceGroupNameSchema.safeParse(options.name);
  if (!grammar.success) {
    throw new ApiError(
      "RG_NAME_INVALID",
      "Proposed resource group name fails Azure naming grammar",
    );
  }

  const resolved = await options.arm.lookupResourceGroup(grammar.data);
  if (resolved === null) {
    throw new ApiError(
      "RG_NOT_FOUND",
      `No resource group named "${grammar.data}" exists in the subscription`,
    );
  }

  const allowlisted = options.allowlist.some(
    (entry) => entry.toLowerCase() === resolved.name.toLowerCase(),
  );
  if (!allowlisted) {
    throw new ApiError(
      "RG_NOT_ALLOWLISTED",
      `Resource group "${resolved.name}" is not on the deletion allowlist`,
    );
  }

  if (resolved.tags[DISPOSABLE_TAG_KEY] !== DISPOSABLE_TAG_VALUE) {
    throw new ApiError(
      "RG_NOT_DISPOSABLE",
      `Resource group "${resolved.name}" is missing the ${DISPOSABLE_TAG_KEY}=${DISPOSABLE_TAG_VALUE} tag`,
    );
  }

  return resolved;
}
