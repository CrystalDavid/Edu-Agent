import { createHash, randomUUID } from "node:crypto";

import {
  AdoptMaterialBundleItemRequestSchema,
  AdoptMaterialBundleItemResultSchema,
  GenerateMaterialBundleRequestSchema,
  GenerateMaterialBundleResultSchema,
  MaterialKindSchema,
  type MaterialBundleProjection,
  type MaterialContentDraft,
  type MaterialKind
} from "@edu-agent/contracts";

import {
  loadMaterialGenerationSkill,
  materialGenerationSkillRef,
  type MaterialGenerationContextBuildResult,
  type MaterialGenerationEvaluation,
  type MaterialGenerationSkillInput
} from "../../../agent/skills/index.js";
import type { VersionedSkillRegistry } from "../../../agent/skills/skill-registry.js";

export interface MaterialGenerationContext {
  readonly tenantRef: string;
  readonly actorRef: string;
  readonly lessonRef: string;
}

export type MaterialGenerationSourceSnapshot = Omit<
  MaterialGenerationSkillInput,
  "requestedKinds" | "teacherAdjustment" | "generatedAt"
>;

export interface MaterialGenerationSourceReader {
  load(
    context: MaterialGenerationContext,
    expectedApprovedTeachingPlanRevisionRef: string
  ): Promise<MaterialGenerationSourceSnapshot>;
}

export interface MaterialGenerationRunStore {
  saveGenerated(input: {
    readonly context: MaterialGenerationContext;
    readonly request: ReturnType<typeof GenerateMaterialBundleRequestSchema.parse>;
    readonly requestFingerprint: string;
    readonly queryRunRef: string;
    readonly agentRunRef: string;
    readonly contextManifestRef: string;
    readonly runtimeContext: MaterialGenerationContextBuildResult;
    readonly drafts: readonly MaterialContentDraft[];
    readonly evaluation: MaterialGenerationEvaluation;
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
    readonly agentRunRef: string;
    readonly contextManifestRef: string;
    readonly contextManifestHash: string;
    readonly drafts: readonly MaterialContentDraft[];
  }>;
}

export interface MaterialBundleArtifactPort {
  getMaterialBundle(input: MaterialGenerationContext): Promise<MaterialBundleProjection>;
  publishMaterialDrafts(input: {
    readonly context: MaterialGenerationContext;
    readonly purpose: "material-bundle.generate";
    readonly idempotencyKey: string;
    readonly expectedApprovedTeachingPlanRevisionRef: string;
    readonly expectedAssetVersions: Readonly<Partial<Record<MaterialKind, number>>>;
    readonly agentRunRef: string;
    readonly skillRef: string;
    readonly contextManifestHash: string;
    readonly drafts: readonly MaterialContentDraft[];
  }): Promise<{
    readonly replayed: boolean;
    readonly generatedVersionRefs: readonly string[];
    readonly bundle: MaterialBundleProjection;
  }>;
  adoptMaterial(input: {
    readonly context: MaterialGenerationContext;
    readonly kind: MaterialKind;
    readonly request: ReturnType<typeof AdoptMaterialBundleItemRequestSchema.parse>;
  }): Promise<{
    readonly replayed: boolean;
    readonly bundle: MaterialBundleProjection;
  }>;
}

export class MaterialGenerationService {
  constructor(
    private readonly sources: MaterialGenerationSourceReader,
    private readonly runs: MaterialGenerationRunStore,
    private readonly artifacts: MaterialBundleArtifactPort,
    private readonly skills: VersionedSkillRegistry,
    private readonly clock: () => Date = () => new Date()
  ) {}

  get(context: MaterialGenerationContext): Promise<MaterialBundleProjection> {
    return this.artifacts.getMaterialBundle(context);
  }

  async generate(input: {
    readonly context: MaterialGenerationContext;
    readonly request: unknown;
  }) {
    const request = GenerateMaterialBundleRequestSchema.parse(input.request);
    const skill = loadMaterialGenerationSkill(
      this.skills,
      materialGenerationSkillRef
    );
    const source = await this.sources.load(
      input.context,
      request.expectedApprovedTeachingPlanRevisionRef
    );
    const runtimeContext = skill.buildContext({
      ...source,
      requestedKinds: request.kinds,
      teacherAdjustment: request.teacherAdjustment,
      generatedAt: this.clock().toISOString()
    });
    if (!runtimeContext.evaluation.passed) {
      throw new Error("Material context authorization or budget evaluation failed.");
    }
    const output = skill.generate(runtimeContext.input);
    const validation = skill.validate({
      output,
      requestedKinds: runtimeContext.input.requestedKinds,
      sources: runtimeContext.manifest.sourceRefs
    });
    const evaluation = skill.evaluate({ context: runtimeContext, validation });
    if (!validation.valid || !evaluation.passed) {
      throw new Error(
        validation.valid
          ? "Material generation evaluation failed."
          : `Material generation validation failed: ${validation.issues.join(" ")}`
      );
    }
    const stored = await this.runs.saveGenerated({
      context: input.context,
      request,
      requestFingerprint: sha256({
        lessonRef: input.context.lessonRef,
        ...request
      }),
      queryRunRef: `query-run:${randomUUID()}`,
      agentRunRef: `agent-run:${randomUUID()}`,
      contextManifestRef: `context-manifest:${randomUUID()}`,
      runtimeContext,
      drafts: validation.output.drafts,
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
    const published = await this.artifacts.publishMaterialDrafts({
      context: input.context,
      purpose: request.purpose,
      idempotencyKey: `${request.idempotencyKey}:artifact`,
      expectedApprovedTeachingPlanRevisionRef:
        request.expectedApprovedTeachingPlanRevisionRef,
      expectedAssetVersions: request.expectedAssetVersions,
      agentRunRef: stored.agentRunRef,
      skillRef: skill.manifest.ref,
      contextManifestHash: stored.contextManifestHash,
      drafts: stored.drafts
    });
    return GenerateMaterialBundleResultSchema.parse({
      replayed: stored.replayed && published.replayed,
      agentRunRef: stored.agentRunRef,
      generatedVersionRefs: published.generatedVersionRefs,
      bundle: published.bundle
    });
  }

  async adopt(input: {
    readonly context: MaterialGenerationContext;
    readonly kind: unknown;
    readonly request: unknown;
  }) {
    const kind = MaterialKindSchema.parse(input.kind);
    const request = AdoptMaterialBundleItemRequestSchema.parse(input.request);
    const result = await this.artifacts.adoptMaterial({
      context: input.context,
      kind,
      request
    });
    return AdoptMaterialBundleItemResultSchema.parse(result);
  }
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
