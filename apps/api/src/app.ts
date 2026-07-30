import express, {
  type Application,
  type NextFunction,
  type Request,
  type Response
} from "express";
import {
  apiRoutes,
  ApproveTeachingPlanRequestSchema,
  CreateTeacherCopilotTaskRequestSchema,
  IngressEnvelopeSchema,
  SuggestionDispositionRequestSchema,
  type ActingContext,
  type TenantContext
} from "@edu-agent/contracts";
import { ZodError } from "zod";

import type {
  ProductContainer
} from "./composition/product-container.js";
import type {
  TestContainer
} from "./composition/test-container.js";
import {
  strictDemoIdentityPolicy,
  type DemoIdentityPolicy
} from "./platform/demo-identity.js";
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
  DomainConflictError,
  IdempotencyConflictError,
  NotFoundError
} from "./platform/errors.js";

type RouteResponseLocals = {
  routeId?: string;
  safeErrorCode?: string;
};

export interface CreateAppOptions {
  product?: ProductContainer;
  test?: TestContainer;
  demoIdentity?: DemoIdentityPolicy;
  exposeInternalTestRoutes?: boolean;
}

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

function contextsFromHeaders(
  tenantRef: string,
  actorRef: string
): {
  tenant: TenantContext;
  acting: ActingContext;
} {
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

function strictContextsFromRequest(request: Request): {
  tenant: TenantContext;
  acting: ActingContext;
} {
  const tenantRef = request.header("x-demo-tenant");
  const actorRef = request.header("x-demo-actor");
  if (!tenantRef || !actorRef) {
    throw new AuthenticationRequiredError(
      "Both x-demo-tenant and x-demo-actor are required."
    );
  }
  return contextsFromHeaders(
    tenantRef,
    actorRef
  );
}

async function productContextsFromRequest(
  request: Request,
  product: ProductContainer,
  policy: DemoIdentityPolicy
): Promise<{
  tenant: TenantContext;
  acting: ActingContext;
}> {
  const tenantRef = request.header("x-demo-tenant");
  const actorRef = request.header("x-demo-actor");
  if (tenantRef && actorRef) {
    return contextsFromHeaders(
      tenantRef,
      actorRef
    );
  }
  if (tenantRef || actorRef) {
    throw new AuthenticationRequiredError(
      "Partial demo identity is not accepted; provide both identity headers."
    );
  }
  if (!policy.allowBypass) {
    throw new AuthenticationRequiredError(
      "Demo identity headers are required. Local bypass is disabled."
    );
  }

  const tenant = "tenant:demo-school";
  const actor = "user:teacher-001";
  await product.services.demoIdentityAudit.recordInjection({
    actorRef: actor,
    method: request.method,
    path: requestPath(request),
    purpose: "local.demo.identity-injection"
  });
  return contextsFromHeaders(tenant, actor);
}

export function createApp(
  options: CreateAppOptions
): Application {
  const product = options.product;
  const test = options.test;
  const demoIdentity =
    options.demoIdentity ?? strictDemoIdentityPolicy;
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
          (response.statusCode < 400
            ? "OK"
            : "UNCLASSIFIED_ERROR");
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

  if (product) {
    app.get(
      apiRoutes.demo.bootstrap,
      markRoute("product.demo.bootstrap"),
      async (request, response, next) => {
        try {
          const contexts = await productContextsFromRequest(
            request,
            product,
            demoIdentity
          );
          const result = await product.services.read.getWorkspace({
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
      markRoute("product.teacher-copilot.create-task"),
      async (request, response, next) => {
        try {
          const contexts = await productContextsFromRequest(
            request,
            product,
            demoIdentity
          );
          const result =
            await product.services.teacherCopilot.createTask({
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

    app.get(
      apiRoutes.demo.pendingProposals,
      markRoute("product.teacher-copilot.proposals.pending"),
      async (request, response, next) => {
        try {
          const contexts = await productContextsFromRequest(
            request,
            product,
            demoIdentity
          );
          response.json(
            await product.services.read.listPendingProposals({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.demo.proposalDetailPattern,
      markRoute("product.teacher-copilot.proposal.detail"),
      async (request, response, next) => {
        try {
          const contexts = await productContextsFromRequest(
            request,
            product,
            demoIdentity
          );
          response.json(
            await product.services.read.getProposalDetail({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              proposalRevisionRef: routeParameter(
                request.params["proposalRevisionRef"]
              )
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.demo.suggestionDispositionPattern,
      markRoute("product.suggestion.disposition"),
      async (request, response, next) => {
        try {
          const contexts = await productContextsFromRequest(
            request,
            product,
            demoIdentity
          );
          const result =
            await product.services.teacherCopilot.disposition({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              proposalRevisionRef:
                routeParameter(
                  request.params["proposalRevisionRef"]
                ),
              request:
                SuggestionDispositionRequestSchema.parse(
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
      markRoute("product.run.explanation"),
      async (request, response, next) => {
        try {
          const contexts = await productContextsFromRequest(
            request,
            product,
            demoIdentity
          );
          const result =
            await product.services.read.getRunExplanation({
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
      markRoute("product.teaching-plan.revision"),
      async (request, response, next) => {
        try {
          const contexts = await productContextsFromRequest(
            request,
            product,
            demoIdentity
          );
          const result =
            await product.services.read.getTeachingPlanRevision({
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

    app.post(
      apiRoutes.demo.approveTeachingPlanPattern,
      markRoute("product.teaching-plan.approve"),
      async (request, response, next) => {
        try {
          const contexts = await productContextsFromRequest(
            request,
            product,
            demoIdentity
          );
          const result =
            await product.services.teacherCopilot.approveTeachingPlan({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              inReviewRevisionRef: routeParameter(
                request.params["revisionRef"]
              ),
              request: ApproveTeachingPlanRequestSchema.parse(
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
      apiRoutes.demo.currentApprovedTeachingPlan,
      markRoute("product.teaching-plan.current-approved"),
      async (request, response, next) => {
        try {
          const contexts = await productContextsFromRequest(
            request,
            product,
            demoIdentity
          );
          response.json(
            await product.services.read.getCurrentApprovedTeachingPlan({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.demo.currentInReviewTeachingPlan,
      markRoute("product.teaching-plan.current-in-review"),
      async (request, response, next) => {
        try {
          const contexts = await productContextsFromRequest(
            request,
            product,
            demoIdentity
          );
          response.json(
            await product.services.read.getCurrentInReviewTeachingPlan({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.demo.teachingPlanDrafts,
      markRoute("product.teaching-plan.drafts"),
      async (request, response, next) => {
        try {
          const contexts = await productContextsFromRequest(
            request,
            product,
            demoIdentity
          );
          response.json(
            await product.services.read.listTeachingPlanDrafts({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.demo.teachingPlanHistory,
      markRoute("product.teaching-plan.history"),
      async (request, response, next) => {
        try {
          const contexts = await productContextsFromRequest(
            request,
            product,
            demoIdentity
          );
          response.json(
            await product.services.read.listTeachingPlanHistory({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );
  }

  if (test && options.exposeInternalTestRoutes) {
    app.post(
      apiRoutes.walkingSkeleton.command,
      markRoute("internal-test.walking-skeleton.command"),
      async (request, response, next) => {
        try {
          const contexts = strictContextsFromRequest(request);
          const result =
            await test.services.walkingSkeleton.executeCommand({
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
      markRoute(
        "internal-test.walking-skeleton.artifact-query"
      ),
      (request, response, next) => {
        try {
          const contexts = strictContextsFromRequest(request);
          const result =
            test.services.walkingSkeleton.executeQuery({
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
      markRoute("internal-test.walking-skeleton.ingress"),
      (request, response, next) => {
        try {
          const envelope = IngressEnvelopeSchema.parse(
            request.body
          );
          switch (envelope.kind) {
            case "DomainEvent":
              response.status(403).json({
                code:
                  "DOMAIN_EVENT_EXTERNAL_WRITE_FORBIDDEN",
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
                workflowInstanceRef:
                  envelope.workflowInstanceRef
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
  }

  app.use("/api", (request, response) => {
    const code = "API_ROUTE_NOT_FOUND";
    (response.locals as RouteResponseLocals).safeErrorCode =
      code;
    response.status(404).json({
      code,
      message: "The requested API route does not exist.",
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
      if (error instanceof AuthenticationRequiredError) {
        (response.locals as RouteResponseLocals).safeErrorCode =
          error.code;
        response.status(401).json({
          code: error.code,
          message: error.message
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
      if (error instanceof DomainConflictError) {
        (response.locals as RouteResponseLocals).safeErrorCode =
          error.code;
        response.status(409).json({
          code: error.code,
          message: error.message,
          details: error.details
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
        message: product
          ? "The PostgreSQL product request failed safely."
          : "The internal test request failed safely."
      });
    }
  );

  return app;
}
