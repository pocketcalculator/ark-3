import type { FastifyInstance } from "fastify";
import { PendingListSchema, type ApprovalItem } from "@ark-3/contracts";
import type { AppDeps } from "../context.js";
import type { ApprovalRecord } from "../providers/approvalState.js";
import { requireAuth, noStore } from "./guards.js";

function toApprovalItem(record: ApprovalRecord): ApprovalItem {
  return {
    id: record.id,
    imageRoute: `/api/images/${record.imageId}`,
    proposedName: record.proposedName,
    canonicalRgId: record.canonicalRgId,
    subscriptionDisplayLabel: record.subscriptionDisplayLabel,
    tags: record.tags,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    nonce: record.nonce,
    version: record.version,
  };
}

export function registerPendingRoute(app: FastifyInstance, deps: AppDeps): void {
  app.get("/api/pending", async (request, reply) => {
    requireAuth(request, deps);
    const records = await deps.store.listPending();
    const items = records.map(toApprovalItem);
    const body = PendingListSchema.parse({ items, total: items.length });
    noStore(reply);
    return reply.send(body);
  });
}
