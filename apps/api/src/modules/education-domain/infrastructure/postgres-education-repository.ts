import type { FormalWriteReceipt } from "@edu-agent/contracts";

import type {
  PostgresClient,
  SqlExecutor
} from "../../../platform/postgres/types.js";
import {
  createReceipt,
  formalMetadataValues,
  toPostgresJson
} from "../../../platform/postgres/write-context.js";
import type {
  LearningEvidenceView,
  LearningInteractionProfileRecord,
  SyntheticEducationSlice
} from "../domain/gate1b.js";

export class PostgresEducationRepository {
  async insertSyntheticSlice(
    client: PostgresClient,
    slice: SyntheticEducationSlice
  ): Promise<readonly FormalWriteReceipt[]> {
    await client.query(
      `INSERT INTO education.course_run (
         course_run_ref,
         tenant_ref,
         curriculum_framework_ref,
         subject,
         grade_level,
         academic_term,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12, $13
       )`,
      [
        slice.courseRun.courseRunRef,
        slice.courseRun.tenantRef,
        slice.courseRun.curriculumFrameworkRef,
        slice.courseRun.subject,
        slice.courseRun.gradeLevel,
        slice.courseRun.academicTerm,
        ...formalMetadataValues(slice.courseRun.metadata)
      ]
    );
    await client.query(
      `INSERT INTO education.learning_objective (
         objective_ref,
         course_run_ref,
         title,
         description,
         knowledge_concept_refs,
         competency_refs,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12, $13
       )`,
      [
        slice.objective.objectiveRef,
        slice.objective.courseRunRef,
        slice.objective.title,
        slice.objective.description,
        toPostgresJson(slice.objective.knowledgeConceptRefs),
        toPostgresJson(slice.objective.competencyRefs),
        ...formalMetadataValues(slice.objective.metadata)
      ]
    );
    const profileReceipt = await this.insertProfile(
      client,
      slice.profile
    );
    await client.query(
      `INSERT INTO education.attempt (
         attempt_ref,
         course_run_ref,
         objective_ref,
         learner_ref,
         submitted_at,
         response_summary,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12, $13
       )`,
      [
        slice.attempt.attemptRef,
        slice.attempt.courseRunRef,
        slice.attempt.objectiveRef,
        slice.attempt.learnerRef,
        slice.attempt.submittedAt,
        toPostgresJson(slice.attempt.responseSummary),
        ...formalMetadataValues(slice.attempt.metadata)
      ]
    );
    await client.query(
      `INSERT INTO education.evidence_observation (
         observation_ref,
         attempt_ref,
         objective_ref,
         observer_type,
         observation_type,
         observation_value,
         observed_at,
         source_ref,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13, $14, $15
       )`,
      [
        slice.observation.observationRef,
        slice.observation.attemptRef,
        slice.observation.objectiveRef,
        slice.observation.observerType,
        slice.observation.observationType,
        toPostgresJson(slice.observation.observationValue),
        slice.observation.observedAt,
        slice.observation.sourceRef,
        ...formalMetadataValues(slice.observation.metadata)
      ]
    );
    await client.query(
      `INSERT INTO education.evidence_claim (
         claim_ref,
         objective_ref,
         claim_type,
         claim_value,
         confidence,
         valid_from,
         expires_at,
         status,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13, $14, $15
       )`,
      [
        slice.claim.claimRef,
        slice.claim.objectiveRef,
        slice.claim.claimType,
        toPostgresJson(slice.claim.claimValue),
        slice.claim.confidence,
        slice.claim.validFrom,
        slice.claim.expiresAt ?? null,
        slice.claim.status,
        ...formalMetadataValues(slice.claim.metadata)
      ]
    );
    await client.query(
      `INSERT INTO education.evidence_claim_observation (
         claim_ref,
         observation_ref,
         relation_type,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3,
         $4, $5, $6, $7, $8, $9, $10
       )`,
      [
        slice.claimObservation.claimRef,
        slice.claimObservation.observationRef,
        slice.claimObservation.relationType,
        ...formalMetadataValues(slice.claimObservation.metadata)
      ]
    );
    await this.insertTeachingPlanAlignment(
      client,
      slice.teachingPlanAlignment
    );
    await client.query(
      `INSERT INTO education.outbox_record (
         outbox_ref,
         event_name,
         aggregate_ref,
         payload,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6, $7, $8, $9, $10, $11
       )`,
      [
        slice.outbox.outboxRef,
        slice.outbox.eventName,
        slice.outbox.aggregateRef,
        toPostgresJson(slice.outbox.payload),
        ...formalMetadataValues(slice.outbox.metadata)
      ]
    );

    return [
      createReceipt({
        writeRef: slice.courseRun.courseRunRef,
        recordType: "CourseRun",
        metadata: slice.courseRun.metadata
      }),
      createReceipt({
        writeRef: slice.objective.objectiveRef,
        recordType: "LearningObjective",
        metadata: slice.objective.metadata
      }),
      profileReceipt,
      createReceipt({
        writeRef: slice.attempt.attemptRef,
        recordType: "Attempt",
        metadata: slice.attempt.metadata
      }),
      createReceipt({
        writeRef: slice.observation.observationRef,
        recordType: "EvidenceObservation",
        metadata: slice.observation.metadata
      }),
      createReceipt({
        writeRef: slice.claim.claimRef,
        recordType: "EvidenceClaim",
        metadata: slice.claim.metadata
      }),
      createReceipt({
        writeRef: `${slice.claimObservation.claimRef}:${slice.claimObservation.observationRef}`,
        recordType: "EvidenceClaimObservation",
        metadata: slice.claimObservation.metadata
      }),
      createReceipt({
        writeRef: slice.teachingPlanAlignment.alignmentRef,
        recordType: "TeachingPlanAlignment",
        metadata: slice.teachingPlanAlignment.metadata
      }),
      createReceipt({
        writeRef: slice.outbox.outboxRef,
        recordType: "OutboxRecord",
        metadata: slice.outbox.metadata
      })
    ];
  }

  async insertProfile(
    client: PostgresClient,
    profile: LearningInteractionProfileRecord
  ): Promise<FormalWriteReceipt> {
    await client.query(
      `INSERT INTO education.learning_interaction_profile (
         profile_ref,
         profile_version,
         scope_ref,
         participation_mode,
         support_limit,
         answer_release_boundary,
         policy_version_ref,
         prompt_version_ref,
         evidence_rule_version_ref,
         profile_payload,
         content_hash,
         valid_from,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, $19
       )`,
      [
        profile.profileRef,
        profile.profileVersion,
        profile.scopeRef,
        profile.participationMode,
        profile.supportLimit,
        profile.answerReleaseBoundary,
        profile.policyVersionRef,
        profile.promptVersionRef,
        profile.evidenceRuleVersionRef,
        toPostgresJson(profile.profilePayload),
        profile.contentHash,
        profile.validFrom,
        ...formalMetadataValues(profile.metadata)
      ]
    );
    return createReceipt({
      writeRef: `${profile.profileRef}@${profile.profileVersion}`,
      recordType: "LearningInteractionProfile",
      metadata: profile.metadata
    });
  }

  async insertTeachingPlanAlignment(
    client: PostgresClient,
    alignment: SyntheticEducationSlice["teachingPlanAlignment"]
  ): Promise<void> {
    await client.query(
      `INSERT INTO education.teaching_plan_alignment (
         alignment_ref,
         teaching_plan_artifact_ref,
         course_run_ref,
         objective_ref,
         validation_status,
         validation_result,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12, $13
       )`,
      [
        alignment.alignmentRef,
        alignment.teachingPlanArtifactRef,
        alignment.courseRunRef,
        alignment.objectiveRef,
        alignment.validationStatus,
        toPostgresJson(alignment.validationResult),
        ...formalMetadataValues(alignment.metadata)
      ]
    );
  }

  async getProfile(
    executor: SqlExecutor,
    profileRef: string,
    profileVersion: number
  ): Promise<LearningInteractionProfileRecord | undefined> {
    const result = await executor.query<{
      profile_ref: string;
      profile_version: number;
      scope_ref: string;
      participation_mode: string;
      support_limit: number;
      answer_release_boundary: string;
      policy_version_ref: string;
      prompt_version_ref: string;
      evidence_rule_version_ref: string;
      profile_payload: Record<string, unknown>;
      content_hash: string;
      valid_from: Date;
      actor_ref: string;
      purpose: string;
      owner_module: "education";
      idempotency_key: string;
      authorization_decision_ref: string;
      audit_ref: string;
      created_at: Date;
    }>(
      `SELECT *
         FROM education.learning_interaction_profile
        WHERE profile_ref = $1
          AND profile_version = $2`,
      [profileRef, profileVersion]
    );
    const row = result.rows[0];
    if (!row) {
      return undefined;
    }
    return {
      profileRef: row.profile_ref,
      profileVersion: row.profile_version,
      scopeRef: row.scope_ref,
      participationMode: row.participation_mode,
      supportLimit: row.support_limit,
      answerReleaseBoundary: row.answer_release_boundary,
      policyVersionRef: row.policy_version_ref,
      promptVersionRef: row.prompt_version_ref,
      evidenceRuleVersionRef: row.evidence_rule_version_ref,
      profilePayload: row.profile_payload,
      contentHash: row.content_hash,
      validFrom: row.valid_from.toISOString(),
      metadata: {
        actorRef: row.actor_ref,
        purpose: row.purpose,
        owner: row.owner_module,
        idempotencyKey: row.idempotency_key,
        authorizationDecisionRef: row.authorization_decision_ref,
        auditRef: row.audit_ref,
        createdAt: row.created_at.toISOString()
      }
    };
  }

  async readLearningEvidenceView(
    executor: SqlExecutor,
    observationRef: string
  ): Promise<LearningEvidenceView | undefined> {
    const result = await executor.query<{
      observation_ref: string;
      attempt_ref: string;
      learner_ref: string;
      objective_ref: string;
      objective_title: string;
      observation_type: string;
      observation_value: Record<string, unknown>;
      observed_at: Date;
      source_ref: string;
      claim_ref: string | null;
      claim_type: string | null;
      claim_value: Record<string, unknown> | null;
      confidence: string | null;
      claim_status: string | null;
      relation_type: string | null;
    }>(
      `SELECT *
         FROM education.learning_evidence_view
        WHERE observation_ref = $1`,
      [observationRef]
    );
    const row = result.rows[0];
    return row
      ? {
          observationRef: row.observation_ref,
          attemptRef: row.attempt_ref,
          learnerRef: row.learner_ref,
          objectiveRef: row.objective_ref,
          objectiveTitle: row.objective_title,
          observationType: row.observation_type,
          observationValue: row.observation_value,
          observedAt: row.observed_at.toISOString(),
          sourceRef: row.source_ref,
          claimRef: row.claim_ref,
          claimType: row.claim_type,
          claimValue: row.claim_value,
          confidence:
            row.confidence === null ? null : Number(row.confidence),
          claimStatus: row.claim_status,
          relationType: row.relation_type
        }
      : undefined;
  }
}
