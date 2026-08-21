import type {
  ApplyExplicitRememberResult,
  ExplicitTeacherMemoryCommandInterpretation
} from "@edu-agent/contracts";

export type RememberCommandInterpretation = Extract<
  ExplicitTeacherMemoryCommandInterpretation,
  { readonly intent: "remember" }
>;

export interface ExplicitTeacherMemoryCommandService {
  applyExplicitRemember(input: {
    readonly tenantRef: string;
    readonly actorRef: string;
    readonly allowedCourseRunRefs: readonly string[];
    readonly command: RememberCommandInterpretation;
    readonly purpose: "personalization.explicit-remember.apply";
    readonly idempotencyKey: string;
  }): Promise<ApplyExplicitRememberResult>;
}
