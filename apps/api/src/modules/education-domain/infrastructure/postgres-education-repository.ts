import type {
  EvidenceClaimViewSchema,
  EvidenceObservationViewSchema,
  FormalWriteMetadata,
  FormalWriteReceipt
} from "@edu-agent/contracts";
import type { z } from "zod";

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

type EducationMetadata = FormalWriteMetadata & { owner: "education" };
type EvidenceObservationView = z.infer<
  typeof EvidenceObservationViewSchema
>;
type EvidenceClaimView = z.infer<typeof EvidenceClaimViewSchema>;

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
         class_name,
         academic_term,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12, $13, $14
       )`,
      [
        slice.courseRun.courseRunRef,
        slice.courseRun.tenantRef,
        slice.courseRun.curriculumFrameworkRef,
        slice.courseRun.subject,
        slice.courseRun.gradeLevel,
        slice.courseRun.className ?? "未命名班级",
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

  async insertAdditionalEvidenceBundle(
    client: PostgresClient,
    input: {
      attempt: {
        attemptRef: string;
        courseRunRef: string;
        objectiveRef: string;
        learnerRef: string;
        submittedAt: string;
        responseSummary: Record<string, unknown>;
        metadata: EducationMetadata;
      };
      observation: {
        observationRef: string;
        attemptRef: string;
        objectiveRef: string;
        observerType: string;
        observationType: string;
        observationValue: Record<string, unknown>;
        observedAt: string;
        sourceRef: string;
        metadata: EducationMetadata;
      };
      claim: {
        claimRef: string;
        objectiveRef: string;
        claimType: string;
        claimValue: Record<string, unknown>;
        confidence: number;
        validFrom: string;
        expiresAt?: string;
        status: "candidate" | "confirmed" | "superseded";
        metadata: EducationMetadata;
      };
      relation: {
        claimRef: string;
        observationRef: string;
        relationType: "supports" | "contradicts";
        metadata: EducationMetadata;
      };
      outbox: {
        outboxRef: string;
        eventName: string;
        aggregateRef: string;
        payload: Record<string, unknown>;
        metadata: EducationMetadata;
      };
    }
  ): Promise<readonly FormalWriteReceipt[]> {
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
        input.attempt.attemptRef,
        input.attempt.courseRunRef,
        input.attempt.objectiveRef,
        input.attempt.learnerRef,
        input.attempt.submittedAt,
        toPostgresJson(input.attempt.responseSummary),
        ...formalMetadataValues(input.attempt.metadata)
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
        input.observation.observationRef,
        input.observation.attemptRef,
        input.observation.objectiveRef,
        input.observation.observerType,
        input.observation.observationType,
        toPostgresJson(input.observation.observationValue),
        input.observation.observedAt,
        input.observation.sourceRef,
        ...formalMetadataValues(input.observation.metadata)
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
        input.claim.claimRef,
        input.claim.objectiveRef,
        input.claim.claimType,
        toPostgresJson(input.claim.claimValue),
        input.claim.confidence,
        input.claim.validFrom,
        input.claim.expiresAt ?? null,
        input.claim.status,
        ...formalMetadataValues(input.claim.metadata)
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
        input.relation.claimRef,
        input.relation.observationRef,
        input.relation.relationType,
        ...formalMetadataValues(input.relation.metadata)
      ]
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
        input.outbox.outboxRef,
        input.outbox.eventName,
        input.outbox.aggregateRef,
        toPostgresJson(input.outbox.payload),
        ...formalMetadataValues(input.outbox.metadata)
      ]
    );
    return [
      createReceipt({
        writeRef: input.attempt.attemptRef,
        recordType: "Attempt",
        metadata: input.attempt.metadata
      }),
      createReceipt({
        writeRef: input.observation.observationRef,
        recordType: "EvidenceObservation",
        metadata: input.observation.metadata
      }),
      createReceipt({
        writeRef: input.claim.claimRef,
        recordType: "EvidenceClaim",
        metadata: input.claim.metadata
      }),
      createReceipt({
        writeRef: `${input.relation.claimRef}:${input.relation.observationRef}`,
        recordType: "EvidenceClaimObservation",
        metadata: input.relation.metadata
      }),
      createReceipt({
        writeRef: input.outbox.outboxRef,
        recordType: "OutboxRecord",
        metadata: input.outbox.metadata
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

  async getTeacherCopilotContext(
    executor: SqlExecutor,
    input: {
      tenantRef: string;
      courseRunRef: string;
    }
  ): Promise<
    | {
        courseRun: {
          courseRunRef: string;
          subject: string;
          gradeLevel: string;
          className: string;
          academicTerm: string;
        };
        objective: {
          objectiveRef: string;
          title: string;
          description: string;
        };
        profile: LearningInteractionProfileRecord;
        teachingPlanArtifactRef: string;
        observations: EvidenceObservationView[];
        claims: EvidenceClaimView[];
      }
    | undefined
  > {
    const header = await executor.query<{
      course_run_ref: string;
      subject: string;
      grade_level: string;
      class_name: string;
      academic_term: string;
      objective_ref: string;
      objective_title: string;
      objective_description: string;
      profile_ref: string;
      profile_version: number;
      teaching_plan_artifact_ref: string;
    }>(
      `SELECT
         course.course_run_ref,
         course.subject,
         course.grade_level,
         course.class_name,
         course.academic_term,
         objective.objective_ref,
         objective.title AS objective_title,
         objective.description AS objective_description,
         profile.profile_ref,
         profile.profile_version,
         alignment.teaching_plan_artifact_ref
       FROM education.course_run AS course
       JOIN education.learning_objective AS objective
         ON objective.course_run_ref = course.course_run_ref
       JOIN education.learning_interaction_profile AS profile
         ON profile.scope_ref = course.course_run_ref
       JOIN education.teaching_plan_alignment AS alignment
         ON alignment.course_run_ref = course.course_run_ref
        AND alignment.objective_ref = objective.objective_ref
       WHERE course.tenant_ref = $1
         AND course.course_run_ref = $2
       ORDER BY profile.profile_version DESC
       LIMIT 1`,
      [input.tenantRef, input.courseRunRef]
    );
    const headerRow = header.rows[0];
    if (!headerRow) {
      return undefined;
    }
    const profile = await this.getProfile(
      executor,
      headerRow.profile_ref,
      headerRow.profile_version
    );
    if (!profile) {
      return undefined;
    }

    const observationRows = await executor.query<{
      observation_ref: string;
      attempt_ref: string;
      response_summary: Record<string, unknown>;
      observation_type: string;
      observation_value: Record<string, unknown>;
      observed_at: Date;
      source_ref: string;
    }>(
      `SELECT
         observation.observation_ref,
         observation.attempt_ref,
         attempt.response_summary,
         observation.observation_type,
         observation.observation_value,
         observation.observed_at,
         observation.source_ref
       FROM education.evidence_observation AS observation
       JOIN education.attempt AS attempt
         ON attempt.attempt_ref = observation.attempt_ref
       JOIN education.course_run AS course
         ON course.course_run_ref = attempt.course_run_ref
       WHERE course.tenant_ref = $1
         AND course.course_run_ref = $2
       ORDER BY observation.observed_at`,
      [input.tenantRef, input.courseRunRef]
    );
    const observations: EvidenceObservationView[] =
      observationRows.rows.map((row) => {
        const assistance = row.observation_value["assistance"] as
          | {
              level?: unknown;
              description?: unknown;
              answerReleased?: unknown;
            }
          | undefined;
        const unknowns = row.observation_value["unknowns"];
        return {
          observationRef: row.observation_ref,
          attemptRef: row.attempt_ref,
          learnerLabel: String(
            row.response_summary["learnerLabel"] ?? "合成学生"
          ),
          observationType: row.observation_type,
          summary: String(
            row.observation_value["summary"] ?? "无摘要"
          ),
          observedAt: row.observed_at.toISOString(),
          sourceRef: row.source_ref,
          assistance: {
            level: String(assistance?.level ?? "未知"),
            description: String(
              assistance?.description ?? "未记录"
            ),
            answerReleased:
              assistance?.answerReleased === true
          },
          unknowns: Array.isArray(unknowns)
            ? unknowns.map(String)
            : ["未记录其他未知项"]
        };
      });

    const claimRows = await executor.query<{
      claim_ref: string;
      claim_type: string;
      claim_value: Record<string, unknown>;
      status: "candidate" | "confirmed" | "superseded";
      valid_from: Date;
      expires_at: Date | null;
      observation_refs: string[];
    }>(
      `SELECT
         claim.claim_ref,
         claim.claim_type,
         claim.claim_value,
         claim.status,
         claim.valid_from,
         claim.expires_at,
         array_remove(
           array_agg(relation.observation_ref),
           NULL
         ) AS observation_refs
       FROM education.evidence_claim AS claim
       JOIN education.learning_objective AS objective
         ON objective.objective_ref = claim.objective_ref
       JOIN education.course_run AS course
         ON course.course_run_ref = objective.course_run_ref
       LEFT JOIN education.evidence_claim_observation AS relation
         ON relation.claim_ref = claim.claim_ref
       WHERE course.tenant_ref = $1
         AND course.course_run_ref = $2
       GROUP BY claim.claim_ref
       ORDER BY claim.valid_from`,
      [input.tenantRef, input.courseRunRef]
    );
    const claims: EvidenceClaimView[] = claimRows.rows.map((row) => ({
      claimRef: row.claim_ref,
      claimType: row.claim_type,
      summary: String(row.claim_value["summary"] ?? "无摘要"),
      status: row.status,
      confidenceExplanation: String(
        row.claim_value["confidenceExplanation"] ??
          "现有证据不足，需教师复核。"
      ),
      validFrom: row.valid_from.toISOString(),
      expiresAt: row.expires_at?.toISOString() ?? null,
      supportingObservationRefs: row.observation_refs
    }));

    return {
      courseRun: {
        courseRunRef: headerRow.course_run_ref,
        subject: headerRow.subject,
        gradeLevel: headerRow.grade_level,
        className: headerRow.class_name,
        academicTerm: headerRow.academic_term
      },
      objective: {
        objectiveRef: headerRow.objective_ref,
        title: headerRow.objective_title,
        description: headerRow.objective_description
      },
      profile,
      teachingPlanArtifactRef:
        headerRow.teaching_plan_artifact_ref,
      observations,
      claims
    };
  }
}
