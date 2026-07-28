import type { FormalWriteMetadata } from "@edu-agent/contracts";

export interface CourseRunRecord {
  courseRunRef: string;
  tenantRef: string;
  curriculumFrameworkRef: string;
  subject: string;
  gradeLevel: string;
  academicTerm: string;
  metadata: FormalWriteMetadata & { owner: "education" };
}

export interface LearningObjectiveRecord {
  objectiveRef: string;
  courseRunRef: string;
  title: string;
  description: string;
  knowledgeConceptRefs: readonly string[];
  competencyRefs: readonly string[];
  metadata: FormalWriteMetadata & { owner: "education" };
}

export interface LearningInteractionProfileRecord {
  profileRef: string;
  profileVersion: number;
  scopeRef: string;
  participationMode: string;
  supportLimit: number;
  answerReleaseBoundary: string;
  policyVersionRef: string;
  promptVersionRef: string;
  evidenceRuleVersionRef: string;
  profilePayload: Record<string, unknown>;
  contentHash: string;
  validFrom: string;
  metadata: FormalWriteMetadata & { owner: "education" };
}

export interface AttemptRecord {
  attemptRef: string;
  courseRunRef: string;
  objectiveRef: string;
  learnerRef: string;
  submittedAt: string;
  responseSummary: Record<string, unknown>;
  metadata: FormalWriteMetadata & { owner: "education" };
}

export interface EvidenceObservationRecord {
  observationRef: string;
  attemptRef: string;
  objectiveRef: string;
  observerType: string;
  observationType: string;
  observationValue: Record<string, unknown>;
  observedAt: string;
  sourceRef: string;
  metadata: FormalWriteMetadata & { owner: "education" };
}

export interface EvidenceClaimRecord {
  claimRef: string;
  objectiveRef: string;
  claimType: string;
  claimValue: Record<string, unknown>;
  confidence: number;
  validFrom: string;
  expiresAt?: string;
  status: "candidate" | "confirmed" | "superseded";
  metadata: FormalWriteMetadata & { owner: "education" };
}

export interface EvidenceClaimObservationRecord {
  claimRef: string;
  observationRef: string;
  relationType: "supports" | "contradicts";
  metadata: FormalWriteMetadata & { owner: "education" };
}

export interface TeachingPlanAlignmentRecord {
  alignmentRef: string;
  teachingPlanArtifactRef: string;
  courseRunRef: string;
  objectiveRef: string;
  validationStatus: "draft" | "validated" | "rejected";
  validationResult: Record<string, unknown>;
  metadata: FormalWriteMetadata & { owner: "education" };
}

export interface EducationOutboxRecord {
  outboxRef: string;
  eventName: string;
  aggregateRef: string;
  payload: Record<string, unknown>;
  metadata: FormalWriteMetadata & { owner: "education" };
}

export interface SyntheticEducationSlice {
  courseRun: CourseRunRecord;
  objective: LearningObjectiveRecord;
  profile: LearningInteractionProfileRecord;
  attempt: AttemptRecord;
  observation: EvidenceObservationRecord;
  claim: EvidenceClaimRecord;
  claimObservation: EvidenceClaimObservationRecord;
  teachingPlanAlignment: TeachingPlanAlignmentRecord;
  outbox: EducationOutboxRecord;
}

export interface LearningEvidenceView {
  observationRef: string;
  attemptRef: string;
  learnerRef: string;
  objectiveRef: string;
  objectiveTitle: string;
  observationType: string;
  observationValue: Record<string, unknown>;
  observedAt: string;
  sourceRef: string;
  claimRef: string | null;
  claimType: string | null;
  claimValue: Record<string, unknown> | null;
  confidence: number | null;
  claimStatus: string | null;
  relationType: string | null;
}
