import { createHash, randomUUID } from "node:crypto";

import {
  DecideLessonBriefRequestSchema,
  GenerateLessonBriefRequestSchema,
  LessonBriefSnapshotSchema,
  LessonBriefStateSchema,
  type DecideLessonBriefRequest,
  type LessonBriefSnapshot,
  type LessonBriefState
} from "@edu-agent/contracts";

import {
  lessonAnalysisSkillRef,
  loadLessonAnalysisSkill,
  type LessonAnalysisSkillInput,
  type VersionedSkillRegistry
} from "../../../agent/skills/index.js";

export interface LessonBriefContext {
  readonly tenantRef: string;
  readonly actorRef: string;
  readonly lessonRef: string;
}

export interface LessonBriefSourceReader {
  load(
    context: LessonBriefContext
  ): Promise<Omit<LessonAnalysisSkillInput, "teacherAdjustment" | "generatedAt">>;
}

export interface LessonBriefRunStore {
  getLatest(context: LessonBriefContext): Promise<LessonBriefSnapshot | null>;
  saveGenerated(input: {
    readonly context: LessonBriefContext;
    readonly request: {
      readonly purpose: "lesson-brief.generate";
      readonly idempotencyKey: string;
      readonly teacherAdjustment: string | null;
    };
    readonly requestFingerprint: string;
    readonly queryRunRef: string;
    readonly agentRunRef: string;
    readonly contextManifestRef: string;
    readonly brief: LessonBriefSnapshot;
    readonly contextManifest: {
      readonly resourceRefs: readonly string[];
      readonly evidenceRefs: readonly string[];
      readonly sourceRefs: readonly unknown[];
      readonly missingInformation: readonly string[];
      readonly excludedInformation: readonly string[];
      readonly requestedFieldMask: readonly string[];
      readonly estimatedTokens: number;
      readonly contentHash: string;
    };
    readonly skill: {
      readonly id: string;
      readonly version: string;
      readonly ref: string;
      readonly contentHash: string;
      readonly promptBundleRef: string;
      readonly promptBundleVersion: number;
    };
    readonly evaluation: unknown;
    readonly requestSummary: {
      readonly courseRunRef: string;
      readonly learningObjectiveRefs: readonly string[];
    };
  }): Promise<{ replayed: boolean; brief: LessonBriefSnapshot }>;
  decide(input: {
    readonly context: LessonBriefContext;
    readonly agentRunRef: string;
    readonly request: DecideLessonBriefRequest;
    readonly requestFingerprint: string;
  }): Promise<{
    replayed: boolean;
    brief: LessonBriefSnapshot;
    workingSet: {
      taskRef: string;
      version: number;
      sourceResourceRefs: string[];
    } | null;
  }>;
}

export class LessonBriefService {
  constructor(
    private readonly sources: LessonBriefSourceReader,
    private readonly runs: LessonBriefRunStore,
    private readonly skills: VersionedSkillRegistry,
    private readonly clock: () => Date = () => new Date()
  ) {}

  async get(context: LessonBriefContext): Promise<LessonBriefState> {
    return LessonBriefStateSchema.parse({
      lessonRef: context.lessonRef,
      current: await this.runs.getLatest(context)
    });
  }

  async generate(input: {
    readonly context: LessonBriefContext;
    readonly request: unknown;
  }) {
    const request = GenerateLessonBriefRequestSchema.parse(input.request);
    const skill = loadLessonAnalysisSkill(this.skills, lessonAnalysisSkillRef);
    const generatedAt = this.clock().toISOString();
    const sourceInput = await this.sources.load(input.context);
    const context = skill.buildContext({
      ...sourceInput,
      teacherAdjustment: request.teacherAdjustment,
      generatedAt
    });
    if (!context.evaluation.passed) {
      throw new Error("Lesson Brief context authorization failed.");
    }
    const output = skill.generate(context.input);
    const validation = skill.validate({
      output,
      sources: context.manifest.sourceRefs
    });
    const evaluation = skill.evaluate({ context, validation });
    if (!validation.valid || !evaluation.passed) {
      throw new Error(
        validation.valid
          ? "Lesson Brief evaluation failed."
          : `Lesson Brief validation failed: ${validation.issues.join(" ")}`
      );
    }
    const queryRunRef = `query-run:${randomUUID()}`;
    const agentRunRef = `agent-run:${randomUUID()}`;
    const contextManifestRef = `context-manifest:${randomUUID()}`;
    const sourceVersionVector = Object.fromEntries(
      context.manifest.sourceRefs.map((source) => [
        `${source.kind}:${source.ref}`,
        source.version
      ])
    );
    const content = {
      lessonRef: input.context.lessonRef,
      sourceRefs: context.manifest.sourceRefs,
      sourceVersionVector,
      objectiveSummaries: validation.output.objectiveSummaries,
      teachingFocusCandidates: validation.output.teachingFocusCandidates,
      difficultyCandidates: validation.output.difficultyCandidates,
      classEvidenceSummary: validation.output.classEvidenceSummary,
      suggestedAttentionPoints: validation.output.suggestedAttentionPoints,
      knownGaps: [
        ...new Set([
          ...validation.output.knownGaps,
          ...context.manifest.missingInformation
        ])
      ],
      generatedBySkillRef: "lesson-analysis@1" as const,
      agentRunRef,
      contextManifestRef,
      contextManifestHash: context.manifest.contentHash,
      teacherAdjustment: request.teacherAdjustment,
      generatedAt
    };
    const brief = LessonBriefSnapshotSchema.parse({
      ...content,
      status: "waiting_for_teacher",
      contentHash: sha256(content),
      disposition: null
    });
    return this.runs.saveGenerated({
      context: input.context,
      request,
      requestFingerprint: sha256({
        lessonRef: input.context.lessonRef,
        ...request
      }),
      queryRunRef,
      agentRunRef,
      contextManifestRef,
      brief,
      contextManifest: context.manifest,
      skill: {
        id: skill.manifest.id,
        version: skill.manifest.version,
        ref: skill.manifest.ref,
        contentHash: skill.manifest.contentHash,
        promptBundleRef: skill.manifest.promptBundleRef,
        promptBundleVersion: skill.manifest.promptBundleVersion
      },
      evaluation,
      requestSummary: {
        courseRunRef: context.input.lesson.courseRunRef,
        learningObjectiveRefs: context.input.objectives.map(
          (objective) => objective.objectiveRef
        )
      }
    });
  }

  async decide(input: {
    readonly context: LessonBriefContext;
    readonly agentRunRef: string;
    readonly request: unknown;
  }) {
    const request = DecideLessonBriefRequestSchema.parse(input.request);
    return this.runs.decide({
      context: input.context,
      agentRunRef: input.agentRunRef,
      request,
      requestFingerprint: sha256({
        lessonRef: input.context.lessonRef,
        agentRunRef: input.agentRunRef,
        ...request
      })
    });
  }
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
