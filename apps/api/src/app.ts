import express, {
  type Application,
  type NextFunction,
  type Request,
  type Response
} from "express";
import {
  IngressEnvelopeSchema,
  type ActingContext,
  type TenantContext
} from "@edu-agent/contracts";
import { ZodError } from "zod";

import type { Gate1AContainer } from "./composition/gate1a-container.js";
import {
  AuthorizationDeniedError,
  IdempotencyConflictError,
  NotFoundError
} from "./platform/errors.js";

function contextsFromRequest(request: Request): {
  tenant: TenantContext;
  acting: ActingContext;
} {
  const tenantRef = String(
    request.header("x-demo-tenant") ?? "tenant:demo-school"
  );
  const actorRef = String(
    request.header("x-demo-actor") ?? "user:teacher-001"
  );
  return {
    tenant: {
      tenantRef,
      dataMode: "synthetic"
    },
    acting: {
      actorRef,
      tenantRef,
      roleRefs: ["role:math-teacher"],
      authenticationMethod: "demo-token"
    }
  };
}

export function createApp(container: Gate1AContainer): Application {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));

  app.get("/api/health", (_request, response) => {
    response.json({
      status: "ok",
      gate: "1A",
      modelProvider: "mock",
      externalNetworkUsed: false
    });
  });

  app.post(
    "/api/v1/commands/walking-skeleton",
    async (request, response, next) => {
      try {
        const contexts = contextsFromRequest(request);
        const result =
          await container.services.walkingSkeleton.executeCommand({
            rawEnvelope: request.body,
            ...contexts
          });
        response.status(result.replayed ? 200 : 201).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/api/v1/queries/artifact",
    (request, response, next) => {
      try {
        const contexts = contextsFromRequest(request);
        const result =
          container.services.walkingSkeleton.executeQuery({
            rawEnvelope: request.body,
            ...contexts
          });
        response.json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  app.post("/api/v1/ingress", (request, response, next) => {
    try {
      const envelope = IngressEnvelopeSchema.parse(request.body);
      switch (envelope.kind) {
        case "DomainEvent":
          response.status(403).json({
            code: "DOMAIN_EVENT_EXTERNAL_WRITE_FORBIDDEN",
            message:
              "DomainEvent can only be replayed from a committed module outbox."
          });
          return;
        case "ObservationEvent":
          response.status(202).json({
            status: "candidate-only",
            agentStarted: false,
            formalStateChanged: false,
            envelopeId: envelope.envelopeId
          });
          return;
        case "WorkflowSignal":
          response.status(404).json({
            code: "WORKFLOW_INSTANCE_NOT_FOUND",
            workflowInstanceRef: envelope.workflowInstanceRef
          });
          return;
        case "Query":
        case "Command":
          response.status(422).json({
            code: "USE_TYPED_ENDPOINT",
            kind: envelope.kind
          });
          return;
      }
    } catch (error) {
      next(error);
    }
  });

  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction
    ) => {
      if (error instanceof ZodError) {
        response.status(400).json({
          code: "INVALID_ENVELOPE",
          issues: error.issues
        });
        return;
      }
      if (error instanceof AuthorizationDeniedError) {
        response.status(403).json({
          code: error.code,
          message: error.message
        });
        return;
      }
      if (error instanceof IdempotencyConflictError) {
        response.status(409).json({
          code: error.code,
          message: error.message
        });
        return;
      }
      if (error instanceof NotFoundError) {
        response.status(404).json({
          code: error.code,
          message: error.message
        });
        return;
      }
      response.status(500).json({
        code: "INTERNAL_ERROR",
        message: "The Gate 1A request failed safely."
      });
    }
  );

  return app;
}
