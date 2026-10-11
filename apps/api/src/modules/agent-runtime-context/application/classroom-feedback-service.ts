import { createHash, randomUUID } from "node:crypto";

import {
  GenerateClassroomFeedbackRequestSchema,
  GenerateClassroomFeedbackResultSchema,
  LatestClassroomFeedbackResultSchema,
  type ClassroomFeedbackRunView,
  type LessonDeliveryDetail
} from "@edu-agent/contracts";

import {
  classroomReflectionSkillRef,
  loadClassroomReflectionSkill,
  type ClassroomReflectionContextBuildResult,
  type ClassroomReflectionEvaluation,
  type ClassroomReflectionSkillInput,
  type ClassroomReflectionSkillOutput
} from "../../../agent/skills/index.js";
import type { VersionedSkillRegistry } from "../../../agent/skills/skill-registry.js";

export interface ClassroomFeedbackContext {
  readonly tenantRef: string;
  readonly actorRef: string;
  readonly lessonRef: string;
}

export type ClassroomFeedbackSourceSnapshot = Omit<
  ClassroomReflectionSkillInput,
  "teacherFeedback" | "generatedAt"
>;

export interface ClassroomFeedbackSourceReader {
  load(
    context: ClassroomFeedbackContext,
    expectedApprovedTeachingPlanRevisionRef: string
  ): Promise<ClassroomFeedbackSourceSnapshot>;
}

export interface ClassroomFeedbackRunStore {
  saveClassroomFeedback(input: {
    readonly context: ClassroomFeedbackContext;
    readonly request: ReturnType<typeof GenerateClassroomFeedbackRequestSchema.parse>;
    readonly requestFingerprint: string;
    readonly queryRunRef: string;
    readonly agentRunRef: string;
    readonly contextManifestRef: string;
    readonly runtimeContext: ClassroomReflectionContextBuildResult;
    readonly output: ClassroomReflectionSkillOutput;
    readonly evaluation: ClassroomReflectionEvaluation;
    readonly skill: {
      readonly id: string;
      readonly version: string;
      readonly ref: string;
      readonly contentHash: string;
      readonly promptBundleRef: string;
      readonly promptBundleVersion: number;
    };
  }): Promise<{
    readonly replayed: boolean;
    readonly view: ClassroomFeedbackRunView;
    readonly output: ClassroomReflectionSkillOutput;
  }>;
  findLatestClassroomFeedback(
    context: ClassroomFeedbackContext
  ): Promise<ClassroomFeedbackRunView | null>;
}

export interface ClassroomFeedbackDeliveryPort {
  createDraft(input: {
    readonly context: ClassroomFeedbackContext;
    readonly courseRunRef: string;
    readonly idempotencyKey: string;
    readonly output: ClassroomReflectionSkillOutput;
  }): Promise<{
    readonly replayed: boolean;
    readonly delivery: LessonDeliveryDetail;
  }>;
}

export class ClassroomFeedbackService {
  constructor(
    private readonly sources: ClassroomFeedbackSourceReader,
    private readonly runs: ClassroomFeedbackRunStore,
    private readonly deliveries: ClassroomFeedbackDeliveryPort,
    private readonly skills: VersionedSkillRegistry,
    private readonly clock: () => Date = () => new Date()
  ) {}

  async generate(input: {
    readonly context: ClassroomFeedbackContext;
    readonly request: unknown;
  }) {
    const request = GenerateClassroomFeedbackRequestSchema.parse(input.request);
    if (
      request.lessonRef !== input.context.lessonRef ||
      request.courseRunRef.trim().length === 0
    ) {
      throw new Error("Classroom feedback request does not match its route context.");
    }
    const skill = loadClassroomReflectionSkill(
      this.skills,
      classroomReflectionSkillRef
    );
    const source = await this.sources.load(
      input.context,
      request.expectedApprovedTeachingPlanRevisionRef
    );
    if (source.lesson.courseRunRef !== request.courseRunRef) {
      throw new Error("Classroom feedback CourseRun does not match the lesson.");
    }
    const runtimeContext = skill.buildContext({
      ...source,
      teacherFeedback: {
        overall: request.overall,
        pace: request.pace,
        studentResponse: request.studentResponse,
        abnormalSections: request.abnormalSections,
        note: request.note
      },
      generatedAt: this.clock().toISOString()
    });
    if (!runtimeContext.evaluation.passed) {
      throw new Error(
        "Classroom feedback context authorization or budget evaluation failed."
      );
    }
    const output = skill.generate(runtimeContext.input);
    const validation = skill.validate({
      output,
      sources: runtimeContext.manifest.sourceRefs,
      expectedTeachingPlanRevisionRef:
        request.expectedApprovedTeachingPlanRevisionRef
    });
    const evaluation = skill.evaluate({ context: runtimeContext, validation });
    if (!validation.valid || !evaluation.passed) {
      throw new Error(
        validation.valid
          ? "Classroom feedback evaluation failed."
          : `Classroom feedback validation failed: ${validation.issues.join(" ")}`
      );
    }
    const stored = await this.runs.saveClassroomFeedback({
      context: input.context,
      request,
      requestFingerprint: sha256({
        ...request
      }),
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
    const delivery = await this.deliveries.createDraft({
      context: input.context,
      courseRunRef: request.courseRunRef,
      idempotencyKey: `${request.idempotencyKey}:delivery`,
      output: stored.output
    });
    return GenerateClassroomFeedbackResultSchema.parse({
      ...stored.view,
      replayed: stored.replayed && delivery.replayed,
      delivery: delivery.delivery
    });
  }

  async latest(context: ClassroomFeedbackContext) {
    return LatestClassroomFeedbackResultSchema.parse({
      item: await this.runs.findLatestClassroomFeedback(context)
    });
  }
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
