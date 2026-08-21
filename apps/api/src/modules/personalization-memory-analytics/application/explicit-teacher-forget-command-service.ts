import type {
  ApplyExplicitForgetResult,
  ExplicitForgetSelectionOption,
  ExplicitTeacherForgetCommandInterpretation
} from "@edu-agent/contracts";

export type ForgetCommandInterpretation = Extract<
  ExplicitTeacherForgetCommandInterpretation,
  { readonly intent: "forget" }
>;

export interface ExplicitTeacherForgetCommandService {
  applyExplicitForget(input: {
    readonly tenantRef: string;
    readonly actorRef: string;
    readonly allowedCourseRunRefs: readonly string[];
    readonly courseRunRef: string;
    readonly command: ForgetCommandInterpretation;
    readonly purpose: "personalization.explicit-forget.apply";
    readonly idempotencyKey: string;
  }): Promise<ApplyExplicitForgetResult>;
  confirmExplicitForget(input: {
    readonly tenantRef: string;
    readonly actorRef: string;
    readonly allowedCourseRunRefs: readonly string[];
    readonly courseRunRef: string;
    readonly command: ForgetCommandInterpretation;
    readonly allowedPreferenceRefs: readonly string[];
    readonly selections: readonly {
      readonly preferenceRef: string;
      readonly expectedVersion: number;
    }[];
    readonly purpose: "personalization.explicit-forget.confirm";
    readonly idempotencyKey: string;
  }): Promise<ApplyExplicitForgetResult>;
  resolveExplicitForgetOptions(input: {
    readonly tenantRef: string;
    readonly actorRef: string;
    readonly preferenceRefs: readonly string[];
  }): Promise<readonly ExplicitForgetSelectionOption[]>;
}
