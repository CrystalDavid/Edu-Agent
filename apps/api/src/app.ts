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
  CreateTeacherConversationRequestSchema,
  AppendTeacherConversationTurnRequestSchema,
  ConfirmMemoryCandidateReplacementRequestSchema,
  DispatchTeacherConversationTurnRequestSchema,
  CloseTeacherConversationRequestSchema,
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
  AmendLessonDeliveryRequestSchema,
  ConfirmClassroomObservationRequestSchema,
  ClassroomObservationListQuerySchema,
  ConfirmLessonDeliveryRequestSchema,
  ConfirmReflectionRequestSchema,
  CreateClassroomObservationRequestSchema,
  CreateLessonDeliveryRequestSchema,
  CreateReflectionDraftRequestSchema,
  CreateReflectionFollowUpRequestSchema,
  GenerateReflectionRequestSchema,
  LocalCredentialLoginRequestSchema,
  LocalLoginRequestSchema,
  LocalSmsChallengeSchema,
  RequestLocalSmsCodeSchema,
  RefreshSessionRequestSchema,
  SwitchWorkspaceRequestSchema,
  RevokeSessionRequestSchema,
  CreateMemberRequestSchema,
  UpdateMemberStatusRequestSchema,
  UpdateMemberRolesRequestSchema,
  UpdateMemberCourseAccessRequestSchema,
  CreateDataGovernanceRequestSchema,
  CreateMemoryCandidateRequestSchema,
  ReviewMemoryCandidateRequestSchema,
  UpdateTeacherPreferenceRequestSchema,
  UpdateTeacherPreferenceScopeRequestSchema,
  RevokeTeacherPreferenceRequestSchema,
  GenerateLessonBriefRequestSchema,
  DecideLessonBriefRequestSchema,
  GenerateMaterialBundleRequestSchema,
  GenerateClassroomFeedbackRequestSchema,
  GenerateNextLessonActionsRequestSchema,
  UpdateNextLessonActionRequestSchema,
  AcceptNextLessonActionRequestSchema,
  RejectNextLessonActionRequestSchema,
  AdoptMaterialBundleItemRequestSchema,
  SupersedeClassroomObservationRequestSchema,
  UpdateClassroomObservationDraftRequestSchema,
  UpdateLessonDeliveryDraftRequestSchema,
  UpdateReflectionDraftRequestSchema,
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
  NotFoundError,
  ServiceUnavailableError
} from "./platform/errors.js";
import type {
  ProductResourceRefs,
  ResolvedProductIdentity
} from "./modules/identity-governance-audit/application/identity-context-facade.js";

type RouteResponseLocals = {
  routeId?: string;
  safeErrorCode?: string;
  identity?: ResolvedProductIdentity;
};

const requestIdentities = new WeakMap<Request, ResolvedProductIdentity>();

const resourceRefKeys = {
  courseRunRef: "courseRunRefs",
  courseRunRefs: "courseRunRefs",
  unitRef: "unitRefs",
  unitRefs: "unitRefs",
  lessonRef: "lessonRefs",
  lessonRefs: "lessonRefs",
  assignmentRef: "assignmentRefs",
  assignmentRefs: "assignmentRefs",
  learnerRef: "learnerRefs",
  learnerRefs: "learnerRefs",
  deliveryRef: "deliveryRefs",
  deliveryRefs: "deliveryRefs",
  observationRef: "observationRefs",
  observationRefs: "observationRefs",
  reflectionRef: "reflectionRefs",
  reflectionRefs: "reflectionRefs",
  taskRef: "taskRefs",
  taskRefs: "taskRefs",
  preparationTaskRef: "taskRefs",
  preparationTaskRefs: "taskRefs"
} as const satisfies Record<string, keyof ProductResourceRefs>;

function collectProductResourceRefs(request: Request): ProductResourceRefs {
  const collected = new Map<keyof ProductResourceRefs, Set<string>>();
  const visit = (value: unknown, depth = 0): void => {
    if (depth > 8 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const target = resourceRefKeys[key as keyof typeof resourceRefKeys];
      if (target) {
        const values = Array.isArray(nested) ? nested : [nested];
        const bucket = collected.get(target) ?? new Set<string>();
        for (const item of values) {
          if (typeof item === "string" && item) bucket.add(item);
        }
        collected.set(target, bucket);
      }
      visit(nested, depth + 1);
    }
  };
  visit(request.params);
  visit(request.query);
  visit(request.body);
  return Object.fromEntries(
    [...collected].map(([key, values]) => [key, [...values]])
  ) as ProductResourceRefs;
}

export interface CreateAppOptions {
  product?: ProductContainer;
  test?: TestContainer;
  demoIdentity?: DemoIdentityPolicy;
  allowTestIdentityHeaders?: boolean;
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

function parseCookies(request: Request): Record<string, string> {
  const raw = request.header("cookie");
  if (!raw) return {};
  const result: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      result[name] = decodeURIComponent(value);
    } catch {
      // Invalid Cookie values are ignored and fail closed as missing.
    }
  }
  return result;
}

function clientLabel(request: Request): string {
  const value = request.header("user-agent")?.replace(/[\r\n]/gu, " ").trim();
  return value ? value.slice(0, 160) : "Unknown browser";
}

function clientFingerprint(request: Request): string {
  return [
    request.ip,
    request.header("user-agent") ?? "unknown"
  ].join("|");
}

function isSafeMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function safeReturnTo(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/overview";
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
  policy: DemoIdentityPolicy,
  allowTestIdentityHeaders =
    product.services.identity.settings.allowTestIdentityHeaders ||
    policy.applicationEnvironment === "test",
  validateProductResources = true,
  requireTeacherProductAccess = true
): Promise<ResolvedProductIdentity> {
  const finalize = async (
    identity: ResolvedProductIdentity
  ): Promise<ResolvedProductIdentity> => {
    if (!isSafeMethod(request.method)) {
      const origin = request.header("origin");
      if (
        origin &&
        !product.services.identity.settings.allowedWebOrigins.includes(origin)
      ) {
        throw new AuthorizationDeniedError("Request Origin is not allowed.");
      }
      product.services.identity.verifyCsrf(
        identity,
        request.header("x-csrf-token")
      );
    }
    requestIdentities.set(request, identity);
    if (validateProductResources) {
      await product.services.identity.assertResourceAccess(
        identity,
        collectProductResourceRefs(request)
      );
    }
    return identity;
  };
  const tenantRef = request.header("x-demo-tenant");
  const actorRef = request.header("x-demo-actor");
  if (tenantRef && actorRef) {
    if (!allowTestIdentityHeaders) {
      throw new AuthenticationRequiredError(
        "Browser-supplied identity headers are not accepted."
      );
    }
    return finalize(await product.services.identity.resolveFixtureIdentity({
      tenantRef,
      actorRef
    }));
  }
  if (tenantRef || actorRef) {
    throw new AuthenticationRequiredError(
      "Partial test identity is not accepted."
    );
  }

  const cookies = parseCookies(request);
  const settings = product.services.identity.settings;
  const sessionToken = cookies[settings.sessionCookieName];
  const csrfToken = cookies[settings.csrfCookieName];
  if (sessionToken) {
    return finalize(await product.services.identity.resolveProductIdentity({
      sessionToken,
      ...(csrfToken ? { csrfToken } : {}),
      requireTeacherProductAccess
    }));
  }
  if (!policy.allowBypass) {
    throw new AuthenticationRequiredError(
      "A server authentication session is required."
    );
  }

  const identity = await product.services.identity.resolveDemoBypassIdentity();
  await product.services.demoIdentityAudit.recordInjection({
    actorRef: identity.acting.actorRef,
    method: request.method,
    path: requestPath(request),
    purpose: "local.demo.identity-injection"
  });
  return finalize(identity);
}

export function createApp(
  options: CreateAppOptions
): Application {
  const product = options.product;
  const test = options.test;
  const demoIdentity =
    options.demoIdentity ?? strictDemoIdentityPolicy;
  const allowTestIdentityHeaders =
    options.allowTestIdentityHeaders ??
    (product?.services.identity.settings.allowTestIdentityHeaders === true ||
      demoIdentity.applicationEnvironment === "test");
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
    const identity = product.services.identity;
    const identitySettings = identity.settings;
    const setSessionCookies = (
      response: Response,
      sessionToken: string,
      csrfToken: string
    ) => {
      const cookieBase = {
        secure: identitySettings.sessionSecure,
        sameSite: identitySettings.sessionSameSite,
        path: "/",
        maxAge: identitySettings.sessionTtlMs
      } as const;
      response.cookie(identitySettings.sessionCookieName, sessionToken, {
        ...cookieBase,
        httpOnly: true
      });
      response.cookie(identitySettings.csrfCookieName, csrfToken, {
        ...cookieBase,
        httpOnly: false
      });
    };
    const clearSessionCookies = (response: Response) => {
      const cookieBase = {
        secure: identitySettings.sessionSecure,
        sameSite: identitySettings.sessionSameSite,
        path: "/"
      } as const;
      response.clearCookie(identitySettings.sessionCookieName, {
        ...cookieBase,
        httpOnly: true
      });
      response.clearCookie(identitySettings.csrfCookieName, {
        ...cookieBase,
        httpOnly: false
      });
    };
    const rawSessionCookies = (request: Request) => {
      const cookies = parseCookies(request);
      return {
        sessionToken: cookies[identitySettings.sessionCookieName],
        csrfToken: cookies[identitySettings.csrfCookieName]
      };
    };
    const assertAllowedAuthOrigin = (request: Request) => {
      const origin = request.header("origin");
      if (origin && !identitySettings.allowedWebOrigins.includes(origin)) {
        throw new AuthorizationDeniedError("Request Origin is not allowed.");
      }
    };
    const requireIdentity = async (request: Request) =>
      productContextsFromRequest(
        request,
        product,
        demoIdentity,
        allowTestIdentityHeaders,
        false,
        false
      );

    app.get(
      apiRoutes.authentication.provider,
      markRoute("authentication.provider"),
      async (_request, response, next) => {
        try {
          response.json(await identity.providerAvailability());
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.authentication.session,
      markRoute("authentication.session.status"),
      async (request, response, next) => {
        try {
          assertAllowedAuthOrigin(request);
          const cookies = rawSessionCookies(request);
          const status = await identity.getSessionStatus({
            ...(cookies.sessionToken
              ? { sessionToken: cookies.sessionToken }
              : {}),
            ...(cookies.csrfToken ? { csrfToken: cookies.csrfToken } : {})
          });
          if (!status.authenticated && demoIdentity.allowBypass) {
            response.json({ ...status, demoBypassAvailable: true });
            return;
          }
          response.json(status);
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.authentication.sessionRefresh,
      markRoute("authentication.session.refresh"),
      async (request, response, next) => {
        try {
          assertAllowedAuthOrigin(request);
          const cookies = rawSessionCookies(request);
          if (!cookies.sessionToken || !cookies.csrfToken) {
            throw new AuthenticationRequiredError("A valid server session is required.");
          }
          const parsed = RefreshSessionRequestSchema.parse(request.body);
          const result = await identity.refreshSession({
            sessionToken: cookies.sessionToken,
            csrfToken: request.header("x-csrf-token") ?? "",
            expectedSessionVersion: parsed.expectedSessionVersion
          });
          setSessionCookies(response, result.sessionToken, result.csrfToken);
          response.json(result.status);
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.authentication.localLogin,
      markRoute("authentication.local.login"),
      async (request, response, next) => {
        try {
          assertAllowedAuthOrigin(request);
          const parsed = LocalLoginRequestSchema.parse(request.body);
          const result = await identity.localLogin({
            profile: parsed.profile,
            clientLabel: clientLabel(request),
            clientFingerprint: clientFingerprint(request)
          });
          setSessionCookies(response, result.sessionToken, result.csrfToken);
          response.status(201).json(result.status);
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.authentication.localSmsCode,
      markRoute("authentication.local.sms-code"),
      async (request, response, next) => {
        try {
          assertAllowedAuthOrigin(request);
          const parsed = RequestLocalSmsCodeSchema.parse(request.body);
          const result = await identity.requestLocalSmsCode(parsed.phone);
          response.status(201).json(LocalSmsChallengeSchema.parse(result));
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.authentication.localCredentialLogin,
      markRoute("authentication.local.credential-login"),
      async (request, response, next) => {
        try {
          assertAllowedAuthOrigin(request);
          const parsed = LocalCredentialLoginRequestSchema.parse(request.body);
          const fingerprint = clientFingerprint(request);
          const result = await identity.localCredentialLogin({
            request: parsed,
            clientLabel: clientLabel(request),
            ...(fingerprint ? { clientFingerprint: fingerprint } : {})
          });
          setSessionCookies(response, result.sessionToken, result.csrfToken);
          response.status(201).json(result.status);
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.authentication.oidcStart,
      markRoute("authentication.oidc.start"),
      async (request, response, next) => {
        try {
          const result = await identity.beginOidcLogin(
            safeReturnTo(request.query["returnTo"])
          );
          response.redirect(302, result.authorizationUrl);
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.authentication.oidcCallback,
      markRoute("authentication.oidc.callback"),
      async (request, response, next) => {
        try {
          const state = request.query["state"];
          if (typeof state !== "string") {
            throw new AuthenticationRequiredError("OIDC callback state is required.");
          }
          const callbackUrl = new URL(
            identitySettings.oidc?.redirectUri ??
              "http://localhost/api/v1/auth/oidc/callback"
          );
          callbackUrl.search = new URL(
            request.originalUrl,
            "http://localhost"
          ).search;
          const result = await identity.completeOidcLogin({
            currentUrl: callbackUrl,
            state,
            clientLabel: clientLabel(request),
            clientFingerprint: clientFingerprint(request)
          });
          setSessionCookies(response, result.sessionToken, result.csrfToken);
          response.redirect(302, result.returnTo);
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.authentication.logout,
      markRoute("authentication.logout"),
      async (request, response, next) => {
        try {
          assertAllowedAuthOrigin(request);
          const cookies = rawSessionCookies(request);
          await identity.logout(
            cookies.sessionToken,
            request.header("x-csrf-token")
          );
          clearSessionCookies(response);
          response.status(204).end();
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.authentication.switchWorkspace,
      markRoute("authentication.workspace.switch"),
      async (request, response, next) => {
        try {
          assertAllowedAuthOrigin(request);
          const cookies = rawSessionCookies(request);
          if (!cookies.sessionToken || !cookies.csrfToken) {
            throw new AuthenticationRequiredError("A valid server session is required.");
          }
          const parsed = SwitchWorkspaceRequestSchema.parse(request.body);
          const status = await identity.switchWorkspace({
            sessionToken: cookies.sessionToken,
            csrfToken: request.header("x-csrf-token") ?? "",
            membershipRef: parsed.membershipRef,
            expectedSessionVersion: parsed.expectedSessionVersion
          });
          response.json(status);
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.authentication.activeSessions,
      markRoute("authentication.sessions.list"),
      async (request, response, next) => {
        try {
          response.json(await identity.listSessions(await requireIdentity(request)));
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.authentication.revokeSessionPattern,
      markRoute("authentication.sessions.revoke"),
      async (request, response, next) => {
        try {
          const current = await requireIdentity(request);
          identity.verifyCsrf(current, request.header("x-csrf-token"));
          const parsed = RevokeSessionRequestSchema.parse(request.body);
          await identity.revokeSession({
            current,
            sessionRef: routeParameter(request.params["sessionRef"]),
            expectedVersion: parsed.expectedVersion
          });
          response.status(204).end();
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.organization.currentSchool,
      markRoute("organization.current"),
      async (request, response, next) => {
        try {
          response.json(await identity.getCurrentSchool(await requireIdentity(request)));
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.organization.members,
      markRoute("organization.members.list"),
      async (request, response, next) => {
        try {
          response.json(await identity.listMembers(await requireIdentity(request)));
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.organization.members,
      markRoute("organization.members.create"),
      async (request, response, next) => {
        try {
          const current = await requireIdentity(request);
          identity.verifyCsrf(current, request.header("x-csrf-token"));
          response.status(201).json(
            await identity.createMember(
              current,
              CreateMemberRequestSchema.parse(request.body)
            )
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.put(
      apiRoutes.organization.memberStatusPattern,
      markRoute("organization.members.status"),
      async (request, response, next) => {
        try {
          const current = await requireIdentity(request);
          identity.verifyCsrf(current, request.header("x-csrf-token"));
          response.json(
            await identity.updateMemberStatus(
              current,
              routeParameter(request.params["membershipRef"]),
              UpdateMemberStatusRequestSchema.parse(request.body)
            )
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.put(
      apiRoutes.organization.memberRolesPattern,
      markRoute("organization.members.roles"),
      async (request, response, next) => {
        try {
          const current = await requireIdentity(request);
          identity.verifyCsrf(current, request.header("x-csrf-token"));
          response.json(
            await identity.updateMemberRoles(
              current,
              routeParameter(request.params["membershipRef"]),
              UpdateMemberRolesRequestSchema.parse(request.body)
            )
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.put(
      apiRoutes.organization.memberCourseAccessPattern,
      markRoute("organization.members.course-access"),
      async (request, response, next) => {
        try {
          const current = await requireIdentity(request);
          identity.verifyCsrf(current, request.header("x-csrf-token"));
          response.json(
            await identity.updateMemberCourseAccess(
              current,
              routeParameter(request.params["membershipRef"]),
              UpdateMemberCourseAccessRequestSchema.parse(request.body)
            )
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.organization.securityEvents,
      markRoute("organization.security-events"),
      async (request, response, next) => {
        try {
          response.json(
            await identity.listSecurityEvents(await requireIdentity(request))
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.userGovernance.requests,
      markRoute("user-governance.requests.list"),
      async (request, response, next) => {
        try {
          response.json(
            await identity.listDataGovernanceRequests(await requireIdentity(request))
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.userGovernance.requests,
      markRoute("user-governance.requests.create"),
      async (request, response, next) => {
        try {
          const current = await requireIdentity(request);
          identity.verifyCsrf(current, request.header("x-csrf-token"));
          response.status(201).json(
            await identity.createDataGovernanceRequest(
              current,
              CreateDataGovernanceRequestSchema.parse(request.body)
            )
          );
        } catch (error) {
          next(error);
        }
      }
    );
  }

  if (product) {
    const preparation = product.services.lessonPreparation;
    const assignments = product.services.assignments;
    const files = product.services.files;
    const workbench = product.services.teacherWorkbench;
    const classroom = product.services.classroomReflection;
    const lessonJourney = product.services.lessonJourney;
    const lessonBrief = product.services.lessonBrief;
    const materialGeneration = product.services.materialGeneration;
    const classroomFeedback = product.services.classroomFeedback;
    const nextLessonOptimization = product.services.nextLessonOptimization;
    const personalization = product.services.personalization;
    const modelInvocations =
      product.services.modelInvocations;
    const conversations = product.services.conversations;
    const conversationDispatch = product.services.conversationDispatch;
    const withProductContext = async (request: Request, response?: Response) => {
      const identity = await productContextsFromRequest(
        request,
        product,
        demoIdentity,
        allowTestIdentityHeaders
      );
      if (response) {
        (response.locals as RouteResponseLocals).identity = identity;
      }
      return identity;
    };

    app.get(
      apiRoutes.teacher.personalizationState,
      markRoute("product.teacher.personalization.state"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request, response);
          response.json(await personalization.getState({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.memoryCandidates,
      markRoute("product.teacher.personalization.candidate-create"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request, response);
          const result = await personalization.createCandidate({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            allowedCourseRunRefs: contexts.acting.courseRunRefs ?? [],
            request: CreateMemoryCandidateRequestSchema.parse(request.body)
          });
          response.status(result.replayed ? 200 : 201).json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    for (const action of ["confirm", "reject"] as const) {
      app.post(
        action === "confirm"
          ? apiRoutes.teacher.memoryCandidateConfirmPattern
          : apiRoutes.teacher.memoryCandidateRejectPattern,
        markRoute(`product.teacher.personalization.candidate-${action}`),
        async (request, response, next) => {
          try {
            const contexts = await withProductContext(request, response);
            response.json(await personalization.reviewCandidate({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              candidateRef: routeParameter(request.params["candidateRef"]),
              action,
              allowedCourseRunRefs: contexts.acting.courseRunRefs ?? [],
              request: ReviewMemoryCandidateRequestSchema.parse(request.body)
            }));
          } catch (error) {
            next(error);
          }
        }
      );
    }

    app.post(
      apiRoutes.teacher.memoryCandidateConfirmReplacementPattern,
      markRoute("product.teacher.personalization.candidate-confirm-replacement"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request, response);
          response.json(await personalization.confirmCandidateReplacement({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            candidateRef: routeParameter(request.params["candidateRef"]),
            allowedCourseRunRefs: contexts.acting.courseRunRefs ?? [],
            request: ConfirmMemoryCandidateReplacementRequestSchema.parse(
              request.body
            )
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.put(
      apiRoutes.teacher.teacherPreferencePattern,
      markRoute("product.teacher.personalization.preference-update"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request, response);
          response.json(await personalization.updatePreference({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            preferenceRef: routeParameter(request.params["preferenceRef"]),
            request: UpdateTeacherPreferenceRequestSchema.parse(request.body)
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.put(
      apiRoutes.teacher.teacherPreferenceScopePattern,
      markRoute("product.teacher.personalization.preference-scope-update"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request, response);
          response.json(await personalization.updatePreferenceScope({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            preferenceRef: routeParameter(request.params["preferenceRef"]),
            allowedCourseRunRefs: contexts.acting.courseRunRefs ?? [],
            request: UpdateTeacherPreferenceScopeRequestSchema.parse(
              request.body
            )
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.teacherPreferenceRevokePattern,
      markRoute("product.teacher.personalization.preference-revoke"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request, response);
          response.json(await personalization.revokePreference({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            preferenceRef: routeParameter(request.params["preferenceRef"]),
            request: RevokeTeacherPreferenceRequestSchema.parse(request.body)
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.pendingReflections,
      markRoute("product.teacher.reflections.pending"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await classroom.getPendingReflectionQueue({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.lessonImplementationSummaryPattern,
      markRoute("product.teacher.classroom.lesson-summary"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await classroom.getLessonSummary({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            lessonRef: routeParameter(request.params["lessonRef"])
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.lessonLatestClassroomFeedbackPattern,
      markRoute("product.teacher.classroom.feedback.latest"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await classroomFeedback.latest({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            lessonRef: routeParameter(request.params["lessonRef"])
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.lessonDeliveryQuickFeedback,
      markRoute("product.teacher.classroom.feedback.generate"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const parsed = GenerateClassroomFeedbackRequestSchema.parse(
            request.body
          );
          const result = await classroomFeedback.generate({
            context: {
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              lessonRef: parsed.lessonRef
            },
            request: parsed
          });
          response.status(result.replayed ? 200 : 201).json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.lessonDeliveries,
      markRoute("product.teacher.classroom.delivery.create"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const result = await classroom.createDelivery({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            request: CreateLessonDeliveryRequestSchema.parse(request.body)
          });
          response.status(result.replayed ? 200 : 201).json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.lessonDeliveryPattern,
      markRoute("product.teacher.classroom.delivery.detail"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await classroom.getDelivery({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            deliveryRef: routeParameter(request.params["deliveryRef"])
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.put(
      apiRoutes.teacher.lessonDeliveryPattern,
      markRoute("product.teacher.classroom.delivery.update-draft"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await classroom.updateDeliveryDraft({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            deliveryRef: routeParameter(request.params["deliveryRef"]),
            request: UpdateLessonDeliveryDraftRequestSchema.parse(request.body)
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.lessonDeliveryConfirmPattern,
      markRoute("product.teacher.classroom.delivery.confirm"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await classroom.confirmDelivery({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            deliveryRef: routeParameter(request.params["deliveryRef"]),
            request: ConfirmLessonDeliveryRequestSchema.parse(request.body)
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.lessonDeliveryAmendPattern,
      markRoute("product.teacher.classroom.delivery.amend"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.status(201).json(await classroom.amendDelivery({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            deliveryRef: routeParameter(request.params["deliveryRef"]),
            request: AmendLessonDeliveryRequestSchema.parse(request.body)
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.classroomObservations,
      markRoute("product.teacher.classroom.observation.create"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const result = await classroom.createObservation({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            request: CreateClassroomObservationRequestSchema.parse(request.body)
          });
          response.status(result.replayed ? 200 : 201).json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.classroomObservations,
      markRoute("product.teacher.classroom.observation.list"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await classroom.listObservations({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            query: ClassroomObservationListQuerySchema.parse(request.query)
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.classroomObservationPattern,
      markRoute("product.teacher.classroom.observation.detail"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await classroom.getObservation({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            observationRef: routeParameter(request.params["observationRef"])
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.put(
      apiRoutes.teacher.classroomObservationPattern,
      markRoute("product.teacher.classroom.observation.update-draft"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await classroom.updateObservationDraft({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            observationRef: routeParameter(request.params["observationRef"]),
            request: UpdateClassroomObservationDraftRequestSchema.parse(request.body)
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.classroomObservationConfirmPattern,
      markRoute("product.teacher.classroom.observation.confirm"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await classroom.confirmObservation({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            observationRef: routeParameter(request.params["observationRef"]),
            request: ConfirmClassroomObservationRequestSchema.parse(request.body)
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.classroomObservationSupersedePattern,
      markRoute("product.teacher.classroom.observation.supersede"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.status(201).json(await classroom.supersedeObservation({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            observationRef: routeParameter(request.params["observationRef"]),
            request: SupersedeClassroomObservationRequestSchema.parse(request.body)
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.reflections,
      markRoute("product.teacher.reflections.create-draft"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const result = await classroom.createReflectionDraft({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            request: CreateReflectionDraftRequestSchema.parse(request.body)
          });
          response.status(result.replayed ? 200 : 201).json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.reflectionPattern,
      markRoute("product.teacher.reflections.detail"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await classroom.getReflection({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            reflectionRef: routeParameter(request.params["reflectionRef"])
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.put(
      apiRoutes.teacher.reflectionPattern,
      markRoute("product.teacher.reflections.update-draft"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await classroom.updateReflectionDraft({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            reflectionRef: routeParameter(request.params["reflectionRef"]),
            request: UpdateReflectionDraftRequestSchema.parse(request.body)
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.reflectionGeneratePattern,
      markRoute("product.teacher.reflections.generate"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const reflectionRef = routeParameter(request.params["reflectionRef"]);
          const parsed = GenerateReflectionRequestSchema.parse(request.body);
          if (parsed.reflectionRef !== reflectionRef) {
            throw new DomainConflictError(
              "REFLECTION_ROUTE_MISMATCH",
              "Reflection route and request body do not match."
            );
          }
          response.status(202).json(await modelInvocations.createReflectionInvocation({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            request: parsed
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.reflectionConfirmPattern,
      markRoute("product.teacher.reflections.confirm"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await classroom.confirmReflection({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            reflectionRef: routeParameter(request.params["reflectionRef"]),
            request: ConfirmReflectionRequestSchema.parse(request.body)
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.reflectionFollowUpsPattern,
      markRoute("product.teacher.reflections.follow-up"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.status(201).json(await classroom.createFollowUp({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            reflectionRef: routeParameter(request.params["reflectionRef"]),
            request: CreateReflectionFollowUpRequestSchema.parse(request.body)
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.reflectionNextLessonActionsPattern,
      markRoute("product.teacher.next-lesson-actions.list"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await nextLessonOptimization.list({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            reflectionRef: routeParameter(request.params["reflectionRef"])
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.reflectionNextLessonActionsGeneratePattern,
      markRoute("product.teacher.next-lesson-actions.generate"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const result = await nextLessonOptimization.generate({
            context: {
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              reflectionRef: routeParameter(request.params["reflectionRef"])
            },
            request: GenerateNextLessonActionsRequestSchema.parse(request.body)
          });
          response.status(result.replayed ? 200 : 201).json(result);
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.nextLessonActionPattern,
      markRoute("product.teacher.next-lesson-actions.detail"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await nextLessonOptimization.get({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            candidateRef: routeParameter(request.params["candidateRef"])
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.patch(
      apiRoutes.teacher.nextLessonActionPattern,
      markRoute("product.teacher.next-lesson-actions.update"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await nextLessonOptimization.update({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            candidateRef: routeParameter(request.params["candidateRef"]),
            request: UpdateNextLessonActionRequestSchema.parse(request.body)
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.nextLessonActionAcceptPattern,
      markRoute("product.teacher.next-lesson-actions.accept"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await nextLessonOptimization.accept({
            context: {
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef
            },
            candidateRef: routeParameter(request.params["candidateRef"]),
            request: AcceptNextLessonActionRequestSchema.parse(request.body)
          }));
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.nextLessonActionRejectPattern,
      markRoute("product.teacher.next-lesson-actions.reject"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(await nextLessonOptimization.reject({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            candidateRef: routeParameter(request.params["candidateRef"]),
            request: RejectNextLessonActionRequestSchema.parse(request.body)
          }));
        } catch (error) {
          next(error);
        }
      }
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
            courseRunRefs: contexts.acting.courseRunRefs ?? [],
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
            courseRunRefs: contexts.acting.courseRunRefs ?? [],
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
            courseRunRefs: contexts.acting.courseRunRefs ?? [],
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
            courseRunRefs: contexts.acting.courseRunRefs ?? [],
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
            courseRunRefs: contexts.acting.courseRunRefs ?? [],
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

    app.post(
      apiRoutes.teacher.conversations,
      markRoute("product.teacher-conversations.create"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const result = await conversations.create({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            request: CreateTeacherConversationRequestSchema.parse(
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
      apiRoutes.teacher.conversationPattern,
      markRoute("product.teacher-conversations.detail"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          response.json(
            await conversations.get({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              conversationRef: routeParameter(
                request.params["conversationRef"]
              )
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.conversationTurnsPattern,
      markRoute("product.teacher-conversations.append-turn"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const result = await conversations.appendTeacherTurn({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            conversationRef: routeParameter(
              request.params["conversationRef"]
            ),
            request: AppendTeacherConversationTurnRequestSchema.parse(
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
      apiRoutes.teacher.conversationDispatchTurnPattern,
      markRoute("product.teacher-conversations.dispatch-turn"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request, response);
          const result = await conversationDispatch.dispatch({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            conversationRef: routeParameter(
              request.params["conversationRef"]
            ),
            allowedCourseRunRefs: contexts.acting.courseRunRefs ?? [],
            request: DispatchTeacherConversationTurnRequestSchema.parse(
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
      apiRoutes.teacher.conversationClosePattern,
      markRoute("product.teacher-conversations.close"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request);
          const result = await conversations.close({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            conversationRef: routeParameter(
              request.params["conversationRef"]
            ),
            request: CloseTeacherConversationRequestSchema.parse(
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
              actorRef: contexts.acting.actorRef,
              allowedCourseRunRefs: contexts.acting.courseRunRefs ?? []
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
      apiRoutes.teacher.lessonJourneyPattern,
      markRoute("product.teacher.lessons.journey"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request, response);
          response.json(
            await lessonJourney.get({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              allowedCourseRunRefs: contexts.acting.courseRunRefs ?? [],
              lessonRef: routeParameter(request.params["lessonRef"])
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.lessonBriefPattern,
      markRoute("product.teacher.lessons.brief"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request, response);
          response.json(
            await lessonBrief.get({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              lessonRef: routeParameter(request.params["lessonRef"])
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.generateLessonBriefPattern,
      markRoute("product.teacher.lessons.brief.generate"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request, response);
          response.status(201).json(
            await lessonBrief.generate({
              context: {
                tenantRef: contexts.tenant.tenantRef,
                actorRef: contexts.acting.actorRef,
                lessonRef: routeParameter(request.params["lessonRef"])
              },
              request: GenerateLessonBriefRequestSchema.parse(request.body)
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.decideLessonBriefPattern,
      markRoute("product.teacher.lessons.brief.decide"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request, response);
          response.json(
            await lessonBrief.decide({
              context: {
                tenantRef: contexts.tenant.tenantRef,
                actorRef: contexts.acting.actorRef,
                lessonRef: routeParameter(request.params["lessonRef"])
              },
              agentRunRef: routeParameter(request.params["agentRunRef"]),
              request: DecideLessonBriefRequestSchema.parse(request.body)
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.get(
      apiRoutes.teacher.lessonMaterialBundlePattern,
      markRoute("product.teacher.lessons.material-bundle"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request, response);
          response.json(
            await materialGeneration.get({
              tenantRef: contexts.tenant.tenantRef,
              actorRef: contexts.acting.actorRef,
              lessonRef: routeParameter(request.params["lessonRef"])
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.generateLessonMaterialBundlePattern,
      markRoute("product.teacher.lessons.material-bundle.generate"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request, response);
          response.status(201).json(
            await materialGeneration.generate({
              context: {
                tenantRef: contexts.tenant.tenantRef,
                actorRef: contexts.acting.actorRef,
                lessonRef: routeParameter(request.params["lessonRef"])
              },
              request: GenerateMaterialBundleRequestSchema.parse(request.body)
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.post(
      apiRoutes.teacher.adoptLessonMaterialPattern,
      markRoute("product.teacher.lessons.material-bundle.adopt"),
      async (request, response, next) => {
        try {
          const contexts = await withProductContext(request, response);
          response.json(
            await materialGeneration.adopt({
              context: {
                tenantRef: contexts.tenant.tenantRef,
                actorRef: contexts.acting.actorRef,
                lessonRef: routeParameter(request.params["lessonRef"])
              },
              kind: routeParameter(request.params["kind"]),
              request: AdoptMaterialBundleItemRequestSchema.parse(request.body)
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
              actorRef: contexts.acting.actorRef,
              allowedCourseRunRefs: contexts.acting.courseRunRefs ?? []
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
              actorRef: contexts.acting.actorRef,
              allowedCourseRunRefs: contexts.acting.courseRunRefs ?? []
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
              allowedCourseRunRefs: contexts.acting.courseRunRefs ?? [],
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
              actorRef: contexts.acting.actorRef,
              allowedCourseRunRefs: contexts.acting.courseRunRefs ?? []
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
          const organizationName =
            contexts.status.currentWorkspace?.organizationName;
          if (!organizationName) {
            throw new NotFoundError(
              "The authenticated user has no active school workspace."
            );
          }
          const result = await product.services.read.getWorkspace({
            tenantRef: contexts.tenant.tenantRef,
            actorRef: contexts.acting.actorRef,
            actorDisplayName: contexts.status.user.displayName,
            organizationName,
            roleRefs: contexts.acting.roleRefs,
            demoIdentity: contexts.status.demoIdentity,
            courseRunRefs: contexts.acting.courseRunRefs ?? [],
            modelMode:
              product.services.modelInvocations.settings.activeProvider ===
              "volcengine-ark"
                ? "ark"
                : "mock",
            ...(contexts.acting.membershipRef
              ? { membershipRef: contexts.acting.membershipRef }
              : {})
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
              allowedCourseRunRefs: contexts.acting.courseRunRefs ?? [],
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
              allowedCourseRunRefs: contexts.acting.courseRunRefs ?? [],
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
              actorRef: contexts.acting.actorRef,
              allowedCourseRunRefs: contexts.acting.courseRunRefs ?? []
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
              actorRef: contexts.acting.actorRef,
              allowedCourseRunRefs: contexts.acting.courseRunRefs ?? []
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
              actorRef: contexts.acting.actorRef,
              allowedCourseRunRefs: contexts.acting.courseRunRefs ?? []
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
              actorRef: contexts.acting.actorRef,
              allowedCourseRunRefs: contexts.acting.courseRunRefs ?? []
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
    async (
      error: unknown,
      request: Request,
      response: Response,
      next: NextFunction
    ) => {
      if (response.headersSent) {
        next(error);
        return;
      }
      const deniedIdentity = requestIdentities.get(request);
      if (
        product &&
        deniedIdentity &&
        (error instanceof AuthorizationDeniedError || error instanceof NotFoundError)
      ) {
        await product.services.identity.recordSecurityEvent({
          eventType: "ProductAccessDenied",
          actorRef: deniedIdentity.acting.actorRef,
          organizationRef: deniedIdentity.acting.tenantRef,
          sessionRef: deniedIdentity.acting.sessionRef ?? null,
          outcome: "denied",
          safeReason: "An authenticated product resource request was denied.",
          safeDetails: {
            method: request.method,
            path: requestPath(request),
            routeId: (response.locals as RouteResponseLocals).routeId ?? "unknown"
          }
        }).catch(() => undefined);
      }
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
      if (error instanceof ServiceUnavailableError) {
        (response.locals as RouteResponseLocals).safeErrorCode =
          error.code;
        response.status(503).json({
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
