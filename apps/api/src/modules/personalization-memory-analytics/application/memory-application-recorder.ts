export interface MemoryApplicationOwner {
  readonly tenantRef: string;
  readonly teacherRef: string;
}

export type MemoryApplicationDecision =
  | "selected"
  | "injected"
  | "excluded"
  | "overridden";

export type MemoryApplicationReasonCode =
  | "active_confirmed_preference"
  | "duplicate_key"
  | "token_budget"
  | "skill_not_allowed"
  | "current_instruction_override"
  | "expired"
  | "revoked"
  | "superseded";

export type PreferenceApplicationDecisionSource =
  | "selected_active_confirmed"
  | "injected_active_confirmed"
  | "excluded_duplicate_key"
  | "excluded_token_budget";

export interface MemoryApplicationDecisionMapping {
  readonly decision: MemoryApplicationDecision;
  readonly reasonCode: MemoryApplicationReasonCode;
}

export type SuggestionDispositionForMemoryOutcome =
  | "accepted"
  | "accepted_with_changes"
  | "rejected"
  | "deferred";

export type MemoryApplicationOutcomeStatus =
  | "adopted"
  | "edited"
  | "rejected"
  | "deferred"
  | "unknown";

export interface MemoryApplicationSelection {
  readonly owner: MemoryApplicationOwner;
  readonly conversationRef: string;
  readonly turnRef: string;
  readonly taskRef: string;
  readonly agentRunRef: string;
  readonly modelExecutionRef: string | null;
  readonly skillRef: string;
  readonly useCase: string;
  readonly scopeHash: string;
  readonly preferenceRef: string;
  readonly preferenceVersion: number;
  readonly preferenceContentHash: string;
  readonly packRef: string;
  readonly packContentHash: string;
  readonly decision: MemoryApplicationDecision;
  readonly reasonCode: MemoryApplicationReasonCode;
  readonly targetFields: readonly string[];
  readonly estimatedTokens: number;
  readonly policyVersion: string;
  readonly idempotencyKey: string;
  readonly authorizationDecisionRef: string;
  readonly auditRef: string;
}

export interface MemoryApplicationOutcome {
  readonly owner: MemoryApplicationOwner;
  readonly sourceEventRef: string;
  readonly agentRunRef: string;
  readonly outcomeStatus: MemoryApplicationOutcomeStatus;
  readonly resultingRevisionRef: string | null;
  readonly policyVersion: string;
  readonly idempotencyKey: string;
}

export interface MemoryApplicationRecorder {
  recordSelection(input: MemoryApplicationSelection): Promise<void>;
  recordOutcome(input: MemoryApplicationOutcome): Promise<void>;
}

export interface RecordedMemoryApplication extends MemoryApplicationSelection {
  readonly applicationRef: string;
  readonly retentionPolicyVersion: string;
  readonly retentionUntil: string;
  readonly contentHash: string;
  readonly createdAt: string;
}

export interface RecordedMemoryApplicationOutcome {
  readonly outcomeRef: string;
  readonly applicationRef: string;
  readonly owner: MemoryApplicationOwner;
  readonly sourceEventRef: string;
  readonly agentRunRef: string;
  readonly outcomeStatus: MemoryApplicationOutcomeStatus;
  readonly resultingRevisionRef: string | null;
  readonly policyVersion: string;
  readonly idempotencyKey: string;
  readonly authorizationDecisionRef: string;
  readonly auditRef: string;
  readonly contentHash: string;
  readonly createdAt: string;
}

export function mapPreferenceApplicationDecision(
  source: PreferenceApplicationDecisionSource
): MemoryApplicationDecisionMapping {
  switch (source) {
    case "selected_active_confirmed":
      return Object.freeze({
        decision: "selected",
        reasonCode: "active_confirmed_preference"
      });
    case "injected_active_confirmed":
      return Object.freeze({
        decision: "injected",
        reasonCode: "active_confirmed_preference"
      });
    case "excluded_duplicate_key":
      return Object.freeze({
        decision: "excluded",
        reasonCode: "duplicate_key"
      });
    case "excluded_token_budget":
      return Object.freeze({
        decision: "excluded",
        reasonCode: "token_budget"
      });
  }
}

export function mapSuggestionDispositionToMemoryOutcome(
  disposition: SuggestionDispositionForMemoryOutcome
): MemoryApplicationOutcomeStatus {
  switch (disposition) {
    case "accepted":
      return "adopted";
    case "accepted_with_changes":
      return "edited";
    case "rejected":
      return "rejected";
    case "deferred":
      return "deferred";
  }
}
