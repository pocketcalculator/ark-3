import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApprovalNonceSchema } from "@ark-3/contracts";
import type { AppDeps } from "../context.js";
import { ApiError } from "../errors.js";
import { ApprovalService } from "../services/approvalService.js";
import { requireAuth, enforceCsrf, noStore } from "./guards.js";

interface IdParams {
  readonly id: string;
}

const RejectBodySchema = z.object({
  nonce: ApprovalNonceSchema,
  version: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export function registerRejectRoute(app: FastifyInstance, deps: AppDeps): void {
  const service = new ApprovalService(deps);

  app.post<{ Params: IdParams }>(
    "/api/reject/:id",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
    const auth = requireAuth(request, deps);
    enforceCsrf(request, deps);

    const parsed = RejectBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ApiError("VALIDATION_FAILED", "Invalid reject request body");
    }

    const result = await service.reject(request.params.id, {
      nonce: parsed.data.nonce,
      version: parsed.data.version,
      ...(parsed.data.reason !== undefined ? { reason: parsed.data.reason } : {}),
      actorId: auth.actorId,
      correlationId: auth.correlationId,
    });

    noStore(reply);
    return reply.send(result);
    },
  );
}
