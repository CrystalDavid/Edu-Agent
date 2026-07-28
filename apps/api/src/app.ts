import express, {
  type Application,
  type NextFunction,
  type Request,
  type Response
} from "express";
import {
  apiRoutes,
  CreateTeacherCopilotTaskRequestSchema,
  IngressEnvelopeSchema,
  SuggestionDispositionRequestSchema,
  type ActingContext,
  type TenantContext
} from "@edu-agent/contracts";
import { ZodError } from "zod";

import type { Gate1AContainer } from "./composition/gate1a-container.js";
import type { Gate2Container } from "./composition/gate2-container.js";
import {
  AuthorizationDeniedError,
  IdempotencyConflictError,
  NotFoundError
} from "./platform/errors.js";

type RouteResponseLocals = {
  routeId?: string;
  safeErrorCode?: string;
};

function markRoute(routeId: string) {
  return (
    _request: Request,
    response: Response<unknown, RouteResponseLocals>,
    next: NextFunction
  ): void => {
    response.locals.routeId = routeId;
    next();
  };
}

function requestPath(request: Request): string {
  return request.originalUrl.split("?")[0] ?? request.path;
}

function routeParameter(
  value: string | string[] | undefined
): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

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

export function createApp(
  container: Gate1AContainer,
  gate2?: Gate2Container
): Application {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));

  app.use((request, response, next) => {
    const diagnosticsEnabled =
      process.env.LOCAL_DEMO_DIAGNOSTICS === "true";
    if (diagnosticsEnabled) {
      response.on("finish", () => {
        const locals =
          response.locals as RouteResponseLocals;
        const safeCode =
          locals.safeErrorCode ??
          (response.statusCode < 400 ? "OK" : "UNCLASSIFIED_ERROR");
        process.stdout.write(
          [
            `API received: ${request.method} ${requestPath(request)}`,
            `Matched route: ${locals.routeId ?? "NONE"}`,
            `Response: ${response.statusCode} ${safeCode}`
          ].join("\n") + "\n"
        );
      });
    }
    next();
  });

  app.get(
    apiRoutes.health,
    markRoute("health"),
    (_request, response) => {
      response.json({
        status: "ok",
        service: "edu-agent-api",
        mode: "mock"
      });
    }
  );

  if (gate2) {
    app.get(
      apiRoutes.demo.bootstrap,
      markRoute("demo.bootstrap"),
      async (request, response, next) => {
        try {
          const contexts = contextsFromRequest(request);
          const result = await gate2.services.read.getWorkspace({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef
          });
          response.json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.demo.createTeacherCopilotTask,
      markRoute("demo.teacher-copilot.create-task"),
      async (request, response, next) => {
        try {
          const contexts = contextsFromRequest(request);
          const result =
            await gate2.services.teacherCopilot.createTask({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              request:
                CreateTeacherCopilotTaskRequestSchema.parse(
                  request.body
                )
            });
          response.status(result.replayed ? 200 : 201).json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.demo.suggestionDispositionPattern,
      markRoute("demo.suggestion.disposition"),
      async (request, response, next) => {
        try {
          const contexts = contextsFromRequest(request);
          const result =
            await gate2.services.teacherCopilot.disposition({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              proposalRevisionRef:
                routeParameter(
                  request.params["proposalRevisionRef"]
                ),
              request: SuggestionDispositionRequestSchema.parse(
                request.body
              )
            });
          response.status(result.replayed ? 200 : 201).json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.demo.runExplanationPattern,
      markRoute("demo.run.explanation"),
      async (request, response, next) => {
        try {
          const contexts = contextsFromRequest(request);
          const result =
            await gate2.services.read.getRunExplanation({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              taskRef: routeParameter(request.params["taskRef"])
            });
          response.json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.demo.teachingPlanRevisionPattern,
      markRoute("demo.teaching-plan.revision"),
      async (request, response, next) => {
        try {
          const contexts = contextsFromRequest(request);
          const result =
            await gate2.services.read.getTeachingPlanRevision({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              revisionRef: routeParameter(
                request.params["revisionRef"]
              )
            });
          response.json(result);
        } catch (error) {
          next(error);
        }
      }
    );
  }

  app.post(
    apiRoutes.walkingSkeleton.command,
    markRoute("walking-skeleton.command"),
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
    apiRoutes.walkingSkeleton.artifactQuery,
    markRoute("walking-skeleton.artifact-query"),
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

  app.post(
    apiRoutes.walkingSkeleton.ingress,
    markRoute("walking-skeleton.ingress"),
    (request, response, next) => {
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
    }
  );

  app.use("/api", (request, response) => {
    const code = "API_ROUTE_NOT_FOUND";
    (response.locals as RouteResponseLocals).safeErrorCode = code;
    response.status(404).json({
      code,
      message: "请求的 API 路由不存在。",
      method: request.method,
      path: requestPath(request)
    });
  });

  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction
    ) => {
      if (error instanceof ZodError) {
        (response.locals as RouteResponseLocals).safeErrorCode =
          "INVALID_ENVELOPE";
        response.status(400).json({
          code: "INVALID_ENVELOPE",
          issues: error.issues
        });
        return;
      }
      if (error instanceof AuthorizationDeniedError) {
        (response.locals as RouteResponseLocals).safeErrorCode =
          error.code;
        response.status(403).json({
          code: error.code,
          message: error.message
        });
        return;
      }
      if (error instanceof IdempotencyConflictError) {
        (response.locals as RouteResponseLocals).safeErrorCode =
          error.code;
        response.status(409).json({
          code: error.code,
          message: error.message
        });
        return;
      }
      if (error instanceof NotFoundError) {
        (response.locals as RouteResponseLocals).safeErrorCode =
          error.code;
        response.status(404).json({
          code: error.code,
          message: error.message
        });
        return;
      }
      (response.locals as RouteResponseLocals).safeErrorCode =
        "INTERNAL_ERROR";
      response.status(500).json({
        code: "INTERNAL_ERROR",
        message: gate2
          ? "Gate 2 请求已安全失败。"
          : "The Gate 1A request failed safely."
      });
    }
  );

  return app;
}
