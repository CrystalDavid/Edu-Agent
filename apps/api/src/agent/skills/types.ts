export type SkillLifecycleStatus =
  | "draft"
  | "published"
  | "deprecated";

export interface SkillSchema<TValue> {
  readonly ref: string;
  parse(value: unknown): TValue;
  safeParse(value: unknown):
    | { readonly success: true; readonly data: TValue }
    | { readonly success: false; readonly error: unknown };
}

export interface SkillContextPolicy {
  readonly version: string;
  readonly purpose: string;
  readonly requiredResourceKinds: readonly string[];
  readonly allowedFieldGroups: readonly string[];
  readonly evidencePolicy: "authorized_refs_only";
  readonly missingInformationPolicy: "explicit";
}

export interface SkillManifest {
  readonly id: string;
  readonly version: string;
  readonly ref: string;
  readonly status: SkillLifecycleStatus;
  readonly purpose: string;
  readonly inputSchemaRef: string;
  readonly outputSchemaRef: string;
  readonly promptBundleRef: string;
  readonly promptBundleVersion: number;
  readonly promptBundleContentHash: string;
  readonly contextPolicy: SkillContextPolicy;
  readonly toolPolicy: {
    readonly mode: "disabled" | "explicit";
    readonly allowedTools: readonly string[];
  };
  readonly memoryPolicy: {
    readonly mode: "disabled" | "authorized_context_only";
  };
  readonly budgetPolicy: {
    readonly source: "runtime_context_and_model_budget";
    readonly mayIncreaseRuntimeBudget: false;
  };
  readonly approvalPolicy: {
    readonly outputKind: "proposal" | "draft";
    readonly humanApprovalRequired: true;
  };
  readonly evaluationPolicy: {
    readonly version: string;
    readonly dimensions: readonly [
      "contract",
      "policy",
      "quality",
      "operation"
    ];
    readonly qualityBlocksProposal: false;
  };
  readonly contentHash: string;
}

export interface SkillVersionBase {
  readonly manifest: SkillManifest;
}

export interface RuntimeSkillBinding {
  readonly skillId: string;
  readonly skillVersion: string;
  readonly skillRef: string;
  readonly contentHash: string;
  readonly purpose: string;
  readonly status: SkillLifecycleStatus;
}

export interface RuntimeSkillLoaderPort {
  loadPublishedBinding(skillRef: string): RuntimeSkillBinding;
  loadHistoricalBinding(skillRef: string): RuntimeSkillBinding;
}
