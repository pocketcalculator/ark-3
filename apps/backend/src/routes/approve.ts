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

const ApproveBodySchema = z.object({
  nonce: ApprovalNonceSchema,
  version: z.string().min(1),
});

export function registerApproveRoute(app: FastifyInstance, deps: AppDeps): void {
  const service = new ApprovalService(deps);

  app.post<{ Params: IdParams }>("/api/approve/:id", async (request, reply) => {
    const auth = requireAuth(request, deps);
    enforceCsrf(request, deps);

    const parsed = ApproveBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ApiError("VALIDATION_FAILED", "Invalid approve request body");
    }

    const result = await service.approve(request.params.id, {
      nonce: parsed.data.nonce,
      version: parsed.data.version,
      actorId: auth.actorId,
      correlationId: auth.correlationId,
    });

    noStore(reply);
    return reply.send(result);
  });
}
