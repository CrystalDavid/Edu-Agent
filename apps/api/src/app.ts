import express, {
  type Application,
  type NextFunction,
  type Request,
  type Response
} from "express";
import { pipeline } from "node:stream/promises";
import {
  apiRoutes,
  ApproveTeachingPlanRequestSchema,
  CancelModelInvocationRequestSchema,
  CreateLessonPreparationTaskRequestSchema,
  CreateModelInvocationRequestSchema,
  CreateTeacherCopilotTaskRequestSchema,
  IngressEnvelopeSchema,
  LessonPreparationTaskActionRequestSchema,
  RetryModelInvocationRequestSchema,
  FileAssetListQuerySchema,
  FileBindingRequestSchema,
  FileLifecycleRequestSchema,
  FileUploadMetadataSchema,
  FileVersionUploadMetadataSchema,
  TeachingPlanDocxExportRequestSchema,
  SuggestionDispositionRequestSchema,
  TaskResourceSelectionRequestSchema,
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
    const files = product.services.files;
    const modelInvocations =
      product.services.modelInvocations;
    const withProductContext = async (request: Request) =>
      productContextsFromRequest(
        request,
        product,
        demoIdentity
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
