import { createHash, randomUUID } from "node:crypto";

import {
  AcceptNextLessonActionRequestSchema,
  GenerateNextLessonActionsRequestSchema,
  GenerateNextLessonActionsResultSchema,
  NextLessonActionListSchema,
  NextLessonActionMutationResultSchema,
  RejectNextLessonActionRequestSchema,
  UpdateNextLessonActionRequestSchema,
  type NextLessonActionCandidate
} from "@edu-agent/contracts";

import {
  loadNextLessonAdjustmentSkill,
  nextLessonAdjustmentSkillRef,
  type NextLessonAdjustmentContextBuildResult,
  type NextLessonAdjustmentEvaluation,
  type NextLessonAdjustmentSkillInput,
  type NextLessonAdjustmentSkillOutput
} from "../../../agent/skills/index.js";
import type { VersionedSkillRegistry } from "../../../agent/skills/skill-registry.js";

export interface NextLessonOptimizationContext {
  readonly tenantRef: string;
  readonly actorRef: string;
  readonly reflectionRef: string;
}

export type NextLessonOptimizationSourceSnapshot = Omit<
  NextLessonAdjustmentSkillInput,
  "teacherAdjustment" | "generatedAt"
>;

export interface NextLessonOptimizationSourceReader {
  load(
    context: NextLessonOptimizationContext,
    reflectionRevisionRef: string,
    targetLessonRef: string
  ): Promise<NextLessonOptimizationSourceSnapshot>;
}

export interface NextLessonActionStore {
  saveGenerated(input: {
    readonly context: NextLessonOptimizationContext;
    readonly request: ReturnType<typeof GenerateNextLessonActionsRequestSchema.parse>;
    readonly requestFingerprint: string;
    readonly queryRunRef: string;
    readonly agentRunRef: string;
    readonly contextManifestRef: string;
    readonly runtimeContext: NextLessonAdjustmentContextBuildResult;
    readonly output: NextLessonAdjustmentSkillOutput;
    readonly evaluation: NextLessonAdjustmentEvaluation;
    readonly skill: {
      readonly id: string;
      readonly version: string;
      readonly ref: string;
      readonly contentHash: string;
      readonly promptBundleRef: string;
      readonly promptBundleVersion: number;
    };
  }): Promise<ReturnType<typeof GenerateNextLessonActionsResultSchema.parse>>;
  list(context: NextLessonOptimizationContext): Promise<NextLessonActionCandidate[]>;
  get(input: {
    readonly tenantRef: string;
    readonly actorRef: string;
    readonly candidateRef: string;
  }): Promise<NextLessonActionCandidate>;
  update(input: {
    readonly tenantRef: string;
    readonly actorRef: string;
    readonly candidateRef: string;
    readonly request: ReturnType<typeof UpdateNextLessonActionRequestSchema.parse>;
    readonly requestFingerprint: string;
  }): Promise<ReturnType<typeof NextLessonActionMutationResultSchema.parse>>;
  reject(input: {
    readonly tenantRef: string;
    readonly actorRef: string;
    readonly candidateRef: string;
    readonly request: ReturnType<typeof RejectNextLessonActionRequestSchema.parse>;
    readonly requestFingerprint: string;
  }): Promise<ReturnType<typeof NextLessonActionMutationResultSchema.parse>>;
  accept(input: {
    readonly tenantRef: string;
    readonly actorRef: string;
    readonly candidateRef: string;
    readonly request: ReturnType<typeof AcceptNextLessonActionRequestSchema.parse>;
    readonly requestFingerprint: string;
    readonly target: { readonly targetRef: string; readonly deepLink: string };
  }): Promise<ReturnType<typeof NextLessonActionMutationResultSchema.parse>>;
}

export interface NextLessonActionTargetPort {
  create(input: {
    readonly context: NextLessonOptimizationContext;
    readonly candidate: NextLessonActionCandidate;
    readonly stableIdempotencyKey: string;
  }): Promise<{ readonly targetRef: string; readonly deepLink: string }>;
}

export class NextLessonOptimizationService {
  constructor(
    private readonly sources: NextLessonOptimizationSourceReader,
    private readonly store: NextLessonActionStore,
    private readonly targets: NextLessonActionTargetPort,
    private readonly skills: VersionedSkillRegistry,
    private readonly clock: () => Date = () => new Date()
  ) {}

  async generate(input: {
    readonly context: NextLessonOptimizationContext;
    readonly request: unknown;
  }) {
    const request = GenerateNextLessonActionsRequestSchema.parse(input.request);
    const skill = loadNextLessonAdjustmentSkill(
      this.skills,
      nextLessonAdjustmentSkillRef
    );
    const source = await this.sources.load(
      input.context,
      request.reflectionRevisionRef,
      request.targetLessonRef
    );
    const runtimeContext = skill.buildContext({
      ...source,
      teacherAdjustment: request.teacherAdjustment,
      generatedAt: this.clock().toISOString()
    });
    if (!runtimeContext.evaluation.passed) {
      throw new Error(
        "Next lesson context authorization, tenant scope, or budget evaluation failed."
      );
    }
    const output = skill.generate(runtimeContext.input);
    const validation = skill.validate({
      output,
      sources: runtimeContext.manifest.sourceRefs,
      targetLessonRef: request.targetLessonRef
    });
    const evaluation = skill.evaluate({ context: runtimeContext, validation });
    if (!validation.valid || !evaluation.passed) {
      throw new Error(
        validation.valid
          ? "Next lesson action evaluation failed."
          : `Next lesson action validation failed: ${validation.issues.join(" ")}`
      );
    }
    return this.store.saveGenerated({
      context: input.context,
      request,
      requestFingerprint: sha256(request),
      queryRunRef: `query-run:${randomUUID()}`,
      agentRunRef: `agent-run:${randomUUID()}`,
      contextManifestRef: `context-manifest:${randomUUID()}`,
      runtimeContext,
      output: validation.output,
      evaluation,
      skill: {
        id: skill.manifest.id,
        version: skill.manifest.version,
        ref: skill.manifest.ref,
        contentHash: skill.manifest.contentHash,
        promptBundleRef: skill.manifest.promptBundleRef,
        promptBundleVersion: skill.manifest.promptBundleVersion
      }
    });
  }

  async list(context: NextLessonOptimizationContext) {
    const items = await this.store.list(context);
    const revisionRef = items[0]?.sourceReflectionRevisionRef;
    return NextLessonActionListSchema.parse({
      reflectionRef: context.reflectionRef,
      reflectionRevisionRef: revisionRef ?? null,
      items
    });
  }

  get(input: {
    readonly tenantRef: string;
    readonly actorRef: string;
    readonly candidateRef: string;
  }) {
    return this.store.get(input);
  }

  update(input: {
    readonly tenantRef: string;
    readonly actorRef: string;
    readonly candidateRef: string;
    readonly request: unknown;
  }) {
    const request = UpdateNextLessonActionRequestSchema.parse(input.request);
    return this.store.update({
      ...input,
      request,
      requestFingerprint: sha256({ candidateRef: input.candidateRef, ...request })
    });
  }

  reject(input: {
    readonly tenantRef: string;
    readonly actorRef: string;
    readonly candidateRef: string;
    readonly request: unknown;
  }) {
    const request = RejectNextLessonActionRequestSchema.parse(input.request);
    return this.store.reject({
      ...input,
      request,
      requestFingerprint: sha256({ candidateRef: input.candidateRef, ...request })
    });
  }

  async accept(input: {
    readonly context: Omit<NextLessonOptimizationContext, "reflectionRef">;
    readonly candidateRef: string;
    readonly request: unknown;
  }) {
    const request = AcceptNextLessonActionRequestSchema.parse(input.request);
    const candidate = await this.store.get({
      ...input.context,
      candidateRef: input.candidateRef
    });
    if (candidate.status === "accepted") {
      return NextLessonActionMutationResultSchema.parse({
        replayed: true,
        candidate
      });
    }
    const context = {
      ...input.context,
      reflectionRef: candidate.sourceReflectionRef
    };
    const target = await this.targets.create({
      context,
      candidate,
      stableIdempotencyKey: `next-action:${candidate.candidateRef}:formal-target`
    });
    return this.store.accept({
      ...input.context,
      candidateRef: input.candidateRef,
      request,
      requestFingerprint: sha256({
        candidateRef: input.candidateRef,
        ...request,
        target
      }),
      target
    });
  }
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
