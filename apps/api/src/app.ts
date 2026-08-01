import express, {
  type Application,
  type NextFunction,
  type Request,
  type Response
} from "express";
import { pipeline } from "node:stream/promises";
import {
  apiRoutes,
  AssignmentActionRequestSchema,
  ApproveTeachingPlanRequestSchema,
  CalendarEventActionRequestSchema,
  CancelModelInvocationRequestSchema,
  CreateCalendarEventRequestSchema,
  CreateLessonPreparationTaskRequestSchema,
  CreateTeacherTodoRequestSchema,
  CreateAssignmentRequestSchema,
  CreateAdjustmentTaskRequestSchema,
  CreateModelInvocationRequestSchema,
  CreateTeacherCopilotTaskRequestSchema,
  IngressEnvelopeSchema,
  LinkTeacherTodoResourceRequestSchema,
  LessonPreparationTaskActionRequestSchema,
  RetryModelInvocationRequestSchema,
  FileAssetListQuerySchema,
  FileBindingRequestSchema,
  FileLifecycleRequestSchema,
  FileUploadMetadataSchema,
  FileVersionUploadMetadataSchema,
  ConfirmGradeRequestSchema,
  ReopenGradeRequestSchema,
  SaveGradeDraftRequestSchema,
  ScheduleTodoRequestSchema,
  SyntheticSubmissionImportRequestSchema,
  TeachingPlanDocxExportRequestSchema,
  SuggestionDispositionRequestSchema,
  TaskResourceSelectionRequestSchema,
  TeacherCalendarListQuerySchema,
  TeacherTodoActionRequestSchema,
  TeacherTodoListQuerySchema,
  TeacherTodoPreferenceRequestSchema,
  TodoAgentHandoffRequestSchema,
  UpdateCalendarEventRequestSchema,
  UpdateAssignmentDraftRequestSchema,
  UpdateTeacherTodoRequestSchema,
  WorkProjectionPreferenceRequestSchema,
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
  InvalidFileError,
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

function fileMetadataHeader(request: Request): unknown {
  const encoded = request.header("x-edu-file-metadata");
  if (!encoded || encoded.length > 12_000) {
    throw new InvalidFileError(
      "FILE_METADATA_REQUIRED",
      "x-edu-file-metadata header is required."
    );
  }
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new InvalidFileError(
      "FILE_METADATA_INVALID",
      "x-edu-file-metadata must be base64url-encoded JSON."
    );
  }
}

function expectedContentLength(request: Request): number | undefined {
  const raw = request.header("content-length");
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new InvalidFileError(
      "INVALID_CONTENT_LENGTH",
      "Content-Length must be a positive integer."
    );
  }
  return value;
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
        mode:
          product?.services.modelInvocations.settings
            .requestedMode ?? "mock"
      });
    }
  );

  if (product) {
    const preparation = product.services.lessonPreparation;
    const assignments = product.services.assignments;
    const files = product.services.files;
    const workbench = product.services.teacherWorkbench;
    const modelInvocations =
      product.services.modelInvocations;
    const withProductContext = async (request: Request) =>
      productContextsFromRequest(
        request,
        product,
        demoIdentity
      );

    app.get(
      apiRoutes.teacher.todos,
      markRoute("product.teacher.todos.list"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await workbench.listTodos({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            query: TeacherTodoListQuerySchema.parse(request.query)
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.todos,
      markRoute("product.teacher.todos.create"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const result = await workbench.createTodo({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            request: CreateTeacherTodoRequestSchema.parse(request.body)
          });
          response.status(result.replayed ? 200 : 201).json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.todoPattern,
      markRoute("product.teacher.todos.detail"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await workbench.getTodo({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            todoRef: routeParameter(request.params["todoRef"])
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.put(
      apiRoutes.teacher.todoPattern,
      markRoute("product.teacher.todos.update"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await workbench.updateTodo({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            todoRef: routeParameter(request.params["todoRef"]),
            request: UpdateTeacherTodoRequestSchema.parse(request.body)
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    for (const action of ["complete", "reopen", "cancel"] as const) {
      const path = action === "complete"
        ? apiRoutes.teacher.todoCompletePattern
        : action === "reopen"
          ? apiRoutes.teacher.todoReopenPattern
          : apiRoutes.teacher.todoCancelPattern;
      app.post(
        path,
        markRoute(`product.teacher.todos.${action}`),
        async (request, response, next) => {
          try {
            const contexts = await withProductContext(request);
            response.json(await workbench.transitionTodo({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              todoRef: routeParameter(request.params["todoRef"]),
              action,
              request: TeacherTodoActionRequestSchema.parse(request.body)
            }));
          } catch (error) {
            next(error);
          }
        }
      );
    }

    app.post(
      apiRoutes.teacher.todoPreferencePattern,
      markRoute("product.teacher.todos.preference"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await workbench.updateTodoPreference({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            todoRef: routeParameter(request.params["todoRef"]),
            request: TeacherTodoPreferenceRequestSchema.parse(request.body)
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.todoResourcesPattern,
      markRoute("product.teacher.todos.resource-link"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const result = await workbench.linkTodoResource({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            todoRef: routeParameter(request.params["todoRef"]),
            request: LinkTeacherTodoResourceRequestSchema.parse(request.body)
          });
          response.status(result.replayed ? 200 : 201).json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.todoSchedulePattern,
      markRoute("product.teacher.todos.schedule"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const result = await workbench.scheduleTodo({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            todoRef: routeParameter(request.params["todoRef"]),
            request: ScheduleTodoRequestSchema.parse(request.body)
          });
          response.status(result.replayed ? 200 : 201).json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.todoAgentHandoffPattern,
      markRoute("product.teacher.todos.agent-handoff"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const result = await workbench.handoffTodoToAgent({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            todoRef: routeParameter(request.params["todoRef"]),
            request: TodoAgentHandoffRequestSchema.parse(request.body)
          });
          response.status(result.replayed ? 200 : 201).json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.calendarEvents,
      markRoute("product.teacher.calendar.list"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await workbench.listCalendar({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            query: TeacherCalendarListQuerySchema.parse(request.query)
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.calendarEvents,
      markRoute("product.teacher.calendar.create"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const result = await workbench.createCalendarEvent({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            request: CreateCalendarEventRequestSchema.parse(request.body)
          });
          response.status(result.replayed ? 200 : 201).json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.calendarEventPattern,
      markRoute("product.teacher.calendar.detail"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await workbench.getCalendarEvent({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            eventRef: routeParameter(request.params["eventRef"])
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.put(
      apiRoutes.teacher.calendarEventPattern,
      markRoute("product.teacher.calendar.update"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await workbench.updateCalendarEvent({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            eventRef: routeParameter(request.params["eventRef"]),
            request: UpdateCalendarEventRequestSchema.parse(request.body)
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    for (const action of ["complete", "cancel"] as const) {
      const path = action === "complete"
        ? apiRoutes.teacher.calendarEventCompletePattern
        : apiRoutes.teacher.calendarEventCancelPattern;
      app.post(
        path,
        markRoute(`product.teacher.calendar.${action}`),
        async (request, response, next) => {
          try {
            const contexts = await withProductContext(request);
            response.json(await workbench.transitionCalendarEvent({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              eventRef: routeParameter(request.params["eventRef"]),
              action,
              request: CalendarEventActionRequestSchema.parse(request.body)
            }));
          } catch (error) {
            next(error);
          }
        }
      );
    }

    app.get(
      apiRoutes.teacher.workbenchOverview,
      markRoute("product.teacher.workbench.overview"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const timezone = typeof request.query["timezone"] === "string"
            ? request.query["timezone"]
            : undefined;
          response.json(await workbench.getOverview({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            ...(timezone ? { timezone } : {})
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.workbenchActionItems,
      markRoute("product.teacher.workbench.action-items"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await workbench.listActionItems({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            includeDeferred: request.query["includeDeferred"] === "true"
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.workbenchProjectionPattern,
      markRoute("product.teacher.workbench.projection-detail"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await workbench.getProjection({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            projectionRef: routeParameter(request.params["projectionRef"])
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.workbenchProjectionPreferencePattern,
      markRoute("product.teacher.workbench.projection-preference"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await workbench.updateProjectionPreference({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            projectionRef: routeParameter(request.params["projectionRef"]),
            request: WorkProjectionPreferenceRequestSchema.parse(request.body)
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.files,
      markRoute("product.teacher.files.list"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await files.list({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              query: FileAssetListQuerySchema.parse(request.query)
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.files,
      markRoute("product.teacher.files.upload"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const contentLength = expectedContentLength(request);
          const result = await files.upload({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            metadata: FileUploadMetadataSchema.parse(fileMetadataHeader(request)),
            content: request,
            ...(contentLength === undefined
              ? {}
              : { expectedSizeBytes: contentLength })
          });
          response.status(result.replayed ? 200 : 201).json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.filePattern,
      markRoute("product.teacher.files.detail"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await files.get({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            assetRef: routeParameter(request.params["assetRef"])
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.fileVersionsPattern,
      markRoute("product.teacher.files.version-create"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const contentLength = expectedContentLength(request);
          const result = await files.createVersion({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            assetRef: routeParameter(request.params["assetRef"]),
            metadata: FileVersionUploadMetadataSchema.parse(fileMetadataHeader(request)),
            content: request,
            ...(contentLength === undefined
              ? {}
              : { expectedSizeBytes: contentLength })
          });
          response.status(result.replayed ? 200 : 201).json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    const sendFileContent = async (
      request: Request,
      response: Response,
      next: NextFunction,
      versionRef?: string
    ) => {
      try {
        const contexts = await withProductContext(request);
        const content = await files.getContent({
          tenantRef: contexts.tenant.tenantRef,
          actorRef: contexts.acting.actorRef,
          assetRef: routeParameter(request.params["assetRef"]),
          ...(versionRef ? { versionRef } : {})
        });
        response.setHeader("content-type", content.version.mimeType);
        response.setHeader("content-length", String(content.version.sizeBytes));
        response.setHeader("cache-control", "private, no-store");
        response.setHeader("x-content-type-options", "nosniff");
        response.setHeader(
          "content-disposition",
          `attachment; filename="download${content.version.extension}"; filename*=UTF-8''${encodeURIComponent(content.version.originalFileName)}`
        );
        await pipeline(content.stream, response);
      } catch (error) {
        next(error);
      }
    };

    app.get(
      apiRoutes.teacher.fileCurrentContentPattern,
      markRoute("product.teacher.files.content-current"),
      (request, response, next) => sendFileContent(request, response, next)
    );
    app.get(
      apiRoutes.teacher.fileVersionContentPattern,
      markRoute("product.teacher.files.content-version"),
      (request, response, next) =>
        sendFileContent(
          request,
          response,
          next,
          routeParameter(request.params["versionRef"])
        )
    );

    for (const nextStatus of ["deleted", "active"] as const) {
      app.post(
        nextStatus === "deleted"
          ? apiRoutes.teacher.fileDeletePattern
          : apiRoutes.teacher.fileRestorePattern,
        markRoute(`product.teacher.files.${nextStatus === "deleted" ? "delete" : "restore"}`),
        async (request, response, next) => {
          try {
            const contexts = await withProductContext(request);
            const result = await files.changeLifecycle({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              assetRef: routeParameter(request.params["assetRef"]),
              request: FileLifecycleRequestSchema.parse(request.body),
              nextStatus
            });
            response.status(result.replayed ? 200 : 201).json(result);
          } catch (error) {
            next(error);
          }
        }
      );
    }

    app.post(
      apiRoutes.teacher.fileBindingsPattern,
      markRoute("product.teacher.files.binding-add"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const result = await files.addBinding({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            assetRef: routeParameter(request.params["assetRef"]),
            request: FileBindingRequestSchema.parse(request.body)
          });
          response.status(result.replayed ? 200 : 201).json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.teachingPlanDocxExportPattern,
      markRoute("product.teacher.teaching-plan.export-docx"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const result = await files.exportApprovedTeachingPlan({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            revisionRef: routeParameter(request.params["revisionRef"]),
            request: TeachingPlanDocxExportRequestSchema.parse(request.body)
          });
          response.status(result.replayed ? 200 : 201).json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.modelProviderAvailability,
      markRoute("product.model-provider.availability"),
      async (request, response, next) => {
        try {
          await withProductContext(request);
          response.json(
            modelInvocations.getAvailability()
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.modelProviderCapabilities,
      markRoute("product.model-provider.capabilities"),
      async (request, response, next) => {
        try {
          await withProductContext(request);
          response.json(
            await modelInvocations.getCapabilities()
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.modelUsageSummary,
      markRoute("product.model-provider.usage"),
      async (request, response, next) => {
        try {
          await withProductContext(request);
          response.json(
            await modelInvocations.getUsageSummary()
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.modelInvocations,
      markRoute("product.model-invocations.create"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const result =
            await modelInvocations.createInvocation({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              request:
                CreateModelInvocationRequestSchema.parse(
                  request.body
                )
            });
          response
            .status(result.replayed ? 200 : 202)
            .json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.modelInvocationPattern,
      markRoute("product.model-invocations.detail"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await modelInvocations.getInvocation({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              modelExecutionRef: routeParameter(
                request.params["modelExecutionRef"]
              )
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.modelInvocationCancelPattern,
      markRoute("product.model-invocations.cancel"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await modelInvocations.cancelInvocation({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              modelExecutionRef: routeParameter(
                request.params["modelExecutionRef"]
              ),
              request:
                CancelModelInvocationRequestSchema.parse(
                  request.body
                )
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.modelInvocationRetryPattern,
      markRoute("product.model-invocations.retry"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const result =
            await modelInvocations.retryInvocation({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              modelExecutionRef: routeParameter(
                request.params["modelExecutionRef"]
              ),
              request:
                RetryModelInvocationRequestSchema.parse(
                  request.body
                )
            });
          response
            .status(result.replayed ? 200 : 202)
            .json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.courseRuns,
      markRoute("product.teacher.course-runs.list"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await preparation.listCourseRuns({
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
      apiRoutes.teacher.courseRunPattern,
      markRoute("product.teacher.course-runs.detail"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await preparation.getCourseRun({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              courseRunRef: routeParameter(
                request.params["courseRunRef"]
              )
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.courseRunUnitsPattern,
      markRoute("product.teacher.curriculum-units.list"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await preparation.listUnits({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              courseRunRef: routeParameter(
                request.params["courseRunRef"]
              )
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.unitPattern,
      markRoute("product.teacher.curriculum-units.detail"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await preparation.getUnit({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              unitRef: routeParameter(request.params["unitRef"])
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.unitLessonsPattern,
      markRoute("product.teacher.lessons.list"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await preparation.listLessons({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              unitRef: routeParameter(request.params["unitRef"])
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.lessonPattern,
      markRoute("product.teacher.lessons.detail"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await preparation.getLesson({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              lessonRef: routeParameter(
                request.params["lessonRef"]
              )
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.lessonPreparationSummary,
      markRoute("product.teacher.lesson-preparation.summary"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await preparation.getSummary({
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
      apiRoutes.teacher.preparationTasks,
      markRoute("product.teacher.lesson-preparation.tasks.list"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await preparation.listTasks({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.preparationTasks,
      markRoute("product.teacher.lesson-preparation.tasks.create"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const result = await preparation.createTask({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            request: CreateLessonPreparationTaskRequestSchema.parse(
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
      apiRoutes.teacher.preparationTaskPattern,
      markRoute("product.teacher.lesson-preparation.tasks.detail"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await preparation.getTask({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              taskRef: routeParameter(request.params["taskRef"])
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    const preparationActions = [
      {
        path: apiRoutes.teacher.preparationTaskStartPattern,
        action: "start" as const
      },
      {
        path: apiRoutes.teacher.preparationTaskReopenPattern,
        action: "reopen" as const
      },
      {
        path: apiRoutes.teacher.preparationTaskCompletePattern,
        action: "complete" as const
      },
      {
        path: apiRoutes.teacher.preparationTaskCancelPattern,
        action: "cancel" as const
      }
    ];
    for (const actionRoute of preparationActions) {
      app.post(
        actionRoute.path,
        markRoute(
          `product.teacher.lesson-preparation.tasks.${actionRoute.action}`
        ),
        async (request, response, next) => {
          try {
            const contexts = await withProductContext(request);
            const result = await preparation.transitionTask({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              taskRef: routeParameter(request.params["taskRef"]),
              action: actionRoute.action,
              request:
                LessonPreparationTaskActionRequestSchema.parse(
                  request.body
                )
            });
            response
              .status(result.replayed ? 200 : 201)
              .json(result);
          } catch (error) {
            next(error);
          }
        }
      );
    }

    app.get(
      apiRoutes.teacher.preparationTaskHistoryPattern,
      markRoute("product.teacher.lesson-preparation.history"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await preparation.getHistory({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              taskRef: routeParameter(request.params["taskRef"])
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.taskWorkingSetPattern,
      markRoute("product.teacher.lesson-preparation.working-set"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await preparation.getWorkingSet({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              taskRef: routeParameter(request.params["taskRef"])
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    for (const method of ["post", "delete"] as const) {
      app[method](
        apiRoutes.teacher.taskResourceSelectionsPattern,
        markRoute(
          `product.teacher.lesson-preparation.resource-${method}`
        ),
        async (request, response, next) => {
          try {
            const contexts = await withProductContext(request);
            const parsed =
              TaskResourceSelectionRequestSchema.parse(
                request.body
              );
            const expectedPurpose =
              method === "post"
                ? "lesson-preparation.context.add"
                : "lesson-preparation.context.remove";
            if (parsed.purpose !== expectedPurpose) {
              throw new AuthorizationDeniedError(
                "Resource-selection method and purpose do not match."
              );
            }
            const result =
              await preparation.updateResourceSelection({
                tenantRef: contexts.tenant.tenantRef,
                actorRef: contexts.acting.actorRef,
                taskRef: routeParameter(
                  request.params["taskRef"]
                ),
                operation:
                  method === "post" ? "add" : "remove",
                request: parsed
              });
            response
              .status(result.replayed ? 200 : 201)
              .json(result);
          } catch (error) {
            next(error);
          }
        }
      );
    }

    app.get(
      apiRoutes.teacher.taskAuthorizedContextPlanPattern,
      markRoute(
        "product.teacher.lesson-preparation.authorized-context-plan"
      ),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await preparation.getLatestAuthorizedContextPlan({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              taskRef: routeParameter(request.params["taskRef"])
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.taskContextManifestPattern,
      markRoute(
        "product.teacher.lesson-preparation.context-manifest"
      ),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await preparation.getLatestContextManifest({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              taskRef: routeParameter(request.params["taskRef"])
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.lessonTeachingPlansPattern,
      markRoute("product.teacher.lessons.teaching-plans"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await preparation.getLessonTeachingPlans({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              lessonRef: routeParameter(
                request.params["lessonRef"]
              )
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.assignments,
      markRoute("product.teacher.assignments.list"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const lessonQuery = request.query["lessonRef"];
          response.json(
            await assignments.listAssignments({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              ...(typeof lessonQuery === "string" && lessonQuery
                ? { lessonRef: lessonQuery }
                : {})
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.assignments,
      markRoute("product.teacher.assignments.create"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const result = await assignments.createAssignment({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            request: CreateAssignmentRequestSchema.parse(request.body)
          });
          response.status(result.replayed ? 200 : 201).json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.assignmentPattern,
      markRoute("product.teacher.assignments.detail"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await assignments.getAssignment({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              assignmentRef: routeParameter(
                request.params["assignmentRef"]
              )
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.assignmentVersionsPattern,
      markRoute("product.teacher.assignments.versions"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const detail = await assignments.getAssignment({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            assignmentRef: routeParameter(
              request.params["assignmentRef"]
            )
          });
          response.json({ items: detail.versionHistory });
        } catch (error) {
          next(error);
        }
      }
    );

    app.put(
      apiRoutes.teacher.assignmentPattern,
      markRoute("product.teacher.assignments.update-draft"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const result = await assignments.updateDraft({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            assignmentRef: routeParameter(
              request.params["assignmentRef"]
            ),
            request: UpdateAssignmentDraftRequestSchema.parse(
              request.body
            )
          });
          response.status(result.replayed ? 200 : 201).json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    const assignmentActions = [
      {
        path: apiRoutes.teacher.assignmentPublishPattern,
        action: "publish" as const
      },
      {
        path: apiRoutes.teacher.assignmentClosePattern,
        action: "close" as const
      },
      {
        path: apiRoutes.teacher.assignmentArchivePattern,
        action: "archive" as const
      }
    ];
    for (const actionRoute of assignmentActions) {
      app.post(
        actionRoute.path,
        markRoute(
          `product.teacher.assignments.${actionRoute.action}`
        ),
        async (request, response, next) => {
          try {
            const contexts = await withProductContext(request);
            const result = await assignments.transitionAssignment({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              assignmentRef: routeParameter(
                request.params["assignmentRef"]
              ),
              action: actionRoute.action,
              request: AssignmentActionRequestSchema.parse(request.body)
            });
            response.status(result.replayed ? 200 : 201).json(result);
          } catch (error) {
            next(error);
          }
        }
      );
    }

    app.post(
      apiRoutes.teacher.assignmentSyntheticSubmissionsPattern,
      markRoute("product.teacher.assignments.synthetic-submissions"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const result = await assignments.importSyntheticSubmissions({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            assignmentRef: routeParameter(
              request.params["assignmentRef"]
            ),
            request: SyntheticSubmissionImportRequestSchema.parse(
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
      apiRoutes.teacher.assignmentSubmissionsPattern,
      markRoute("product.teacher.assignments.submissions"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await assignments.listSubmissions({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              assignmentRef: routeParameter(
                request.params["assignmentRef"]
              )
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.assignmentGradingQueuePattern,
      markRoute("product.teacher.assignments.grading-queue"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await assignments.getGradingQueue({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              assignmentRef: routeParameter(
                request.params["assignmentRef"]
              )
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.submissionPattern,
      markRoute("product.teacher.submissions.detail"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await assignments.getSubmission({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              submissionRef: routeParameter(
                request.params["submissionRef"]
              )
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.submissionGradeDraftPattern,
      markRoute("product.teacher.grading.save-draft"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const result = await assignments.saveGradeDraft({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            submissionRef: routeParameter(
              request.params["submissionRef"]
            ),
            request: SaveGradeDraftRequestSchema.parse(request.body)
          });
          response.status(result.replayed ? 200 : 201).json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.gradeDecisionConfirmPattern,
      markRoute("product.teacher.grading.confirm"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const result = await assignments.confirmGrade({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            gradeDecisionRef: routeParameter(
              request.params["gradeDecisionRef"]
            ),
            request: ConfirmGradeRequestSchema.parse(request.body)
          });
          response.status(result.replayed ? 200 : 201).json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.gradeDecisionReopenPattern,
      markRoute("product.teacher.grading.reopen"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const result = await assignments.reopenGrade({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            gradeDecisionRef: routeParameter(
              request.params["gradeDecisionRef"]
            ),
            request: ReopenGradeRequestSchema.parse(request.body)
          });
          response.status(result.replayed ? 200 : 201).json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.gradeDecisionHistoryPattern,
      markRoute("product.teacher.grading.history"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await assignments.getGradeHistory({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              submissionRef: routeParameter(
                request.params["submissionRef"]
              )
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.assignmentAnalyticsPattern,
      markRoute("product.teacher.assignments.analytics"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await assignments.getAnalytics({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              assignmentRef: routeParameter(
                request.params["assignmentRef"]
              )
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.assignmentEvidencePattern,
      markRoute("product.teacher.assignments.evidence"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await assignments.listAssignmentEvidence({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              assignmentRef: routeParameter(
                request.params["assignmentRef"]
              )
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.courseRunEnrollmentsPattern,
      markRoute("product.teacher.course-runs.enrollments"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await assignments.listEnrollments({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              courseRunRef: routeParameter(
                request.params["courseRunRef"]
              )
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.learnerEvidencePattern,
      markRoute("product.teacher.learners.evidence"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await assignments.getLearnerEvidence({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              courseRunRef: routeParameter(
                request.params["courseRunRef"]
              ),
              learnerRef: routeParameter(
                request.params["learnerRef"]
              )
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.assignmentAdjustmentPattern,
      markRoute("product.teacher.assignments.adjust-next-lesson"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const parsed = CreateAdjustmentTaskRequestSchema.parse(
            request.body
          );
          const routeAssignmentRef = routeParameter(
            request.params["assignmentRef"]
          );
          if (parsed.assignmentRef !== routeAssignmentRef) {
            throw new DomainConflictError(
              "ASSIGNMENT_ROUTE_PAYLOAD_CONFLICT",
              "路由与请求中的 Assignment 不一致。"
            );
          }
          const result = await assignments.createAdjustmentTask({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            request: parsed
          });
          response.status(result.replayed ? 200 : 201).json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.assignmentOverview,
      markRoute("product.teacher.assignments.overview"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await assignments.getOverview({
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
      if (error instanceof InvalidFileError) {
        (response.locals as RouteResponseLocals).safeErrorCode =
          error.code;
        response.status(error.status).json({
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
