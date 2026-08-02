import { createHash, randomUUID } from "node:crypto";

import type {
  AuthorizationDecision,
  FormalWriteReceipt
} from "@edu-agent/contracts";
import {
  baselineTeachingPlan,
  gate2DemoRefs,
  gate2SyntheticFixture
} from "@edu-agent/test-fixtures";
import type { Pool } from "pg";

import {
  PostgresGate2ArtifactRepository
} from "../modules/artifact-collaboration/infrastructure/postgres-gate2-artifact-repository.js";
import {
  PostgresGate25EducationRepository
} from "../modules/education-domain/infrastructure/postgres-gate2-5-education-repository.js";
import {
  PostgresGate27EducationRepository
} from "../modules/education-domain/infrastructure/postgres-gate2-7-education-repository.js";
import {
  PostgresEducationRepository
} from "../modules/education-domain/infrastructure/postgres-education-repository.js";
import {
  PostgresGovernanceRepository
} from "../modules/identity-governance-audit/infrastructure/postgres-governance-repository.js";
import {
  PostgresGate25WorkRepository
} from "../modules/work-assistant-durable-execution/infrastructure/postgres-gate2-5-work-repository.js";
import {
  PostgresGate2WorkRepository
} from "../modules/work-assistant-durable-execution/infrastructure/postgres-gate2-work-repository.js";
import {
  createWriteMetadata,
  type WriteContext
} from "../platform/postgres/write-context.js";
import {
  gate25CurriculumFixture,
  gate25DemoRefs
} from "./gate2-5-demo-fixture.js";
import {
  gate27DemoRefs,
  gate27SyntheticEnrollments
} from "./gate2-7-demo-fixture.js";
import type {
  PostgresIdentityOrganizationService
} from "./postgres-identity-organization-service.js";

function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

const schoolBRefs = {
  tenantRef: "tenant:demo-school-b",
  teacherRef: "user:teacher-b-001",
  courseRunRef: "course-run:school-b-grade8-math-2026-fall",
  objectiveRef: "learning-objective:school-b-linear-function",
  followUpObjectiveRef: "learning-objective:school-b-linear-application",
  profileRef: "learning-interaction-profile:school-b-linear-function",
  attemptRef: "attempt:school-b:synthetic-001",
  learnerRef: "learner:school-b:synthetic-001",
  enrollmentRef: "enrollment:school-b:synthetic-001",
  observationRef: "evidence-observation:school-b-linear-function",
  claimRef: "evidence-claim:school-b-linear-function",
  caseRef: "case:school-b:linear-function",
  goalRef: "goal:school-b:linear-function",
  planArtifactRef: "artifact:school-b:teaching-plan",
  planRevisionRef: "artifact-revision:school-b:teaching-plan:baseline",
  unitRef: "curriculum-unit:school-b-linear-functions",
  lessonRef: "lesson:school-b-linear-function-application"
} as const;

export class Gate2DemoSeedService {
  constructor(
    private readonly pool: Pool,
    private readonly identity?: PostgresIdentityOrganizationService,
    private readonly governance =
      new PostgresGovernanceRepository(),
    private readonly work = new PostgresGate2WorkRepository(),
    private readonly artifacts =
      new PostgresGate2ArtifactRepository(),
    private readonly education = new PostgresEducationRepository(),
    private readonly gate25Education =
      new PostgresGate25EducationRepository(),
    private readonly gate27Education =
      new PostgresGate27EducationRepository(),
    private readonly gate25Work =
      new PostgresGate25WorkRepository()
  ) {}

  async seed(
    options: { includeGate25?: boolean; includeGate27?: boolean } = {}
  ): Promise<{
    replayed: boolean;
    courseRunRef: string;
    goalRef: string;
    teachingPlanArtifactRef: string;
  }> {
    await this.identity?.seedSyntheticFoundation();
    const gate24 = await this.seedGate24();
    const schoolB = await this.seedSchoolBIsolationFoundation();
    if (!options.includeGate25) {
      return {
        ...gate24,
        replayed: gate24.replayed && schoolB.replayed
      };
    }
    const gate25 = await this.seedGate25();
    const gate29Support = await this.seedGate29CurriculumSupport();
    const gate27 = options.includeGate27
      ? await this.seedGate27()
      : { replayed: true };
    return {
      ...gate24,
      replayed:
        gate24.replayed && schoolB.replayed && gate25.replayed &&
        gate29Support.replayed && gate27.replayed
    };
  }

  private async seedSchoolBIsolationFoundation(): Promise<{ replayed: boolean }> {
    const rootIdempotencyKey = "gate2-10a:school-b-isolation-foundation:v1";
    const rootKey = [
      schoolBRefs.tenantRef,
      schoolBRefs.teacherRef,
      "gate2-10a.school-b.seed",
      rootIdempotencyKey
    ].join("|");
    const decisionRef = "authorization-decision:gate2-10a-school-b-seed";
    const createdAt = "2026-09-18T07:50:00.000Z";
    const writeContext: WriteContext = {
      actorRef: schoolBRefs.teacherRef,
      purpose: "gate2-10a.school-b.seed",
      rootIdempotencyKey,
      authorizationDecisionRef: decisionRef,
      createdAt
    };
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const reservation = await this.governance.reserveIdempotency(client, {
        idempotencyRef: "idempotency:gate2-10a-school-b-seed",
        rootKey,
        requestFingerprint: hash({ fixture: "gate2-10a-school-b@1" }),
        metadata: createWriteMetadata(
          writeContext,
          "governance",
          "gate2-10a-school-b-idempotency"
        )
      });
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return { replayed: true };
      }
      const decision: AuthorizationDecision = {
        decisionRef,
        actorRef: schoolBRefs.teacherRef,
        tenantRef: schoolBRefs.tenantRef,
        purpose: writeContext.purpose,
        action: "gate2-10a.school-b.seed",
        resourceRef: schoolBRefs.courseRunRef,
        requestedFieldMask: [],
        effect: "allow",
        reasonCodes: ["synthetic-school-isolation-fixture"],
        policyVersion: "policy:gate2-10a-synthetic-school-seed@1",
        decidedAt: createdAt
      };
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "gate2-10a-school-b-authorization"
          )
        })
      ];
      const metadata = <
        TOwner extends "work" | "education" | "artifact"
      >(
        owner: TOwner,
        suffix: string
      ) => createWriteMetadata(
        writeContext,
        owner,
        `gate2-10a-school-b-${suffix}`
      );
      receipts.push(...await this.work.insertCaseAndGoal(client, {
        caseRecord: {
          caseRef: schoolBRefs.caseRef,
          tenantRef: schoolBRefs.tenantRef,
          caseType: "TeachingImprovementCase",
          title: "School B 合成教学改进案例",
          status: "active",
          metadata: metadata("work", "case")
        },
        goal: {
          goalRef: schoolBRefs.goalRef,
          tenantRef: schoolBRefs.tenantRef,
          caseRef: schoolBRefs.caseRef,
          title: "建立一次函数应用的可解释教学方案",
          status: "active",
          successCriteria: ["仅使用 School B 合成证据完成教师审阅"],
          metadata: metadata("work", "goal")
        }
      }));
      const schoolBPlan = {
        ...baselineTeachingPlan,
        objective: "学生能够用一次函数解释 School B 合成情境中的变量关系。",
        evidenceRefs: [schoolBRefs.observationRef]
      };
      receipts.push(...await this.artifacts.insertTeachingPlanSeed(client, {
        artifactRef: schoolBRefs.planArtifactRef,
        revisionRef: schoolBRefs.planRevisionRef,
        title: "School B 一次函数应用｜已批准合成教案",
        content: schoolBPlan,
        metadata: metadata("artifact", "teaching-plan"),
        outboxMetadata: metadata("artifact", "teaching-plan-outbox"),
        outboxRef: "outbox:gate2-10a-school-b-plan"
      }));
      receipts.push(...await this.education.insertSyntheticSlice(client, {
        courseRun: {
          courseRunRef: schoolBRefs.courseRunRef,
          tenantRef: schoolBRefs.tenantRef,
          curriculumFrameworkRef: "curriculum:cn-junior-math:synthetic@1",
          subject: "数学",
          gradeLevel: "八年级",
          className: "八年级 2 班（School B 合成）",
          academicTerm: "2026 秋季学期",
          metadata: metadata("education", "course-run")
        },
        objective: {
          objectiveRef: schoolBRefs.objectiveRef,
          courseRunRef: schoolBRefs.courseRunRef,
          title: "解释一次函数中的变量关系",
          description: "完全合成的 School B 教学目标。",
          knowledgeConceptRefs: ["knowledge-concept:linear-function"],
          competencyRefs: ["competency:mathematical-reasoning"],
          metadata: metadata("education", "objective")
        },
        profile: {
          profileRef: schoolBRefs.profileRef,
          profileVersion: 1,
          scopeRef: schoolBRefs.courseRunRef,
          participationMode: "teacher-copilot-review",
          supportLimit: 2,
          answerReleaseBoundary: "teacher-approval-required",
          policyVersionRef: "policy:teacher-copilot-synthetic@1",
          promptVersionRef: "prompt-bundle:teacher-copilot-slope@1",
          evidenceRuleVersionRef: "evidence-rule:slope-review@1",
          profilePayload: { synthetic: true, school: "B" },
          contentHash: hash({ synthetic: true, school: "B" }),
          validFrom: createdAt,
          metadata: metadata("education", "profile")
        },
        attempt: {
          attemptRef: schoolBRefs.attemptRef,
          courseRunRef: schoolBRefs.courseRunRef,
          objectiveRef: schoolBRefs.objectiveRef,
          learnerRef: schoolBRefs.learnerRef,
          submittedAt: createdAt,
          responseSummary: { learnerLabel: "School B 匿名学习者 B-01", synthetic: true },
          metadata: metadata("education", "attempt")
        },
        observation: {
          observationRef: schoolBRefs.observationRef,
          attemptRef: schoolBRefs.attemptRef,
          objectiveRef: schoolBRefs.objectiveRef,
          observerType: "synthetic-rule",
          observationType: "concept-explanation",
          observationValue: { summary: "合成解释仍需教师复核", synthetic: true },
          observedAt: createdAt,
          sourceRef: schoolBRefs.attemptRef,
          metadata: metadata("education", "observation")
        },
        claim: {
          claimRef: schoolBRefs.claimRef,
          objectiveRef: schoolBRefs.objectiveRef,
          claimType: "instructional-gap",
          claimValue: { summary: "School B 合成证据缺口", synthetic: true },
          confidence: 0.5,
          validFrom: createdAt,
          status: "candidate",
          metadata: metadata("education", "claim")
        },
        claimObservation: {
          claimRef: schoolBRefs.claimRef,
          observationRef: schoolBRefs.observationRef,
          relationType: "supports",
          metadata: metadata("education", "claim-observation")
        },
        teachingPlanAlignment: {
          alignmentRef: "teaching-plan-alignment:school-b-baseline",
          teachingPlanArtifactRef: schoolBRefs.planArtifactRef,
          courseRunRef: schoolBRefs.courseRunRef,
          objectiveRef: schoolBRefs.objectiveRef,
          validationStatus: "validated",
          validationResult: { objectiveAligned: true, dataMode: "synthetic" },
          metadata: metadata("education", "plan-alignment")
        },
        outbox: {
          outboxRef: "outbox:gate2-10a-school-b-evidence",
          eventName: "EvidenceClaimRecorded",
          aggregateRef: schoolBRefs.claimRef,
          payload: { observationRef: schoolBRefs.observationRef, synthetic: true },
          metadata: metadata("education", "evidence-outbox")
        }
      }));
      receipts.push(...await this.gate25Education.insertCurriculumSeed(client, {
        courseRunRef: schoolBRefs.courseRunRef,
        courseRunPresentation: {
          className: "八年级 2 班（School B 合成）",
          academicTerm: "当前学期"
        },
        unit: {
          unitRef: schoolBRefs.unitRef,
          sequence: 1,
          title: "一次函数应用（School B）",
          description: "用于验证组织隔离的合成单元。",
          status: "active",
          metadata: metadata("education", "unit")
        },
        lessons: [{
          lessonRef: schoolBRefs.lessonRef,
          sequence: 1,
          title: "一次函数应用（School B 合成课时）",
          plannedAt: "2026-09-24T00:30:00.000Z",
          durationMinutes: 45,
          preparationState: "ready_for_use",
          currentApprovedPlanRef: schoolBRefs.planRevisionRef,
          metadata: metadata("education", "lesson")
        }],
        additionalObjective: {
          objectiveRef: schoolBRefs.followUpObjectiveRef,
          title: "在合成情境中应用一次函数",
          description: "School B 合成后续目标。",
          knowledgeConceptRefs: ["knowledge-concept:linear-function-model"],
          competencyRefs: ["competency:mathematical-modelling"],
          metadata: metadata("education", "follow-up-objective")
        },
        objectiveLinks: [{
          lessonRef: schoolBRefs.lessonRef,
          objectiveRef: schoolBRefs.objectiveRef,
          metadata: metadata("education", "lesson-objective")
        }],
        evidenceLinks: [{
          lessonRef: schoolBRefs.lessonRef,
          evidenceRef: schoolBRefs.observationRef,
          evidenceKind: "observation",
          metadata: metadata("education", "lesson-evidence")
        }],
        currentPlanBinding: {
          bindingRef: "lesson-plan-binding:school-b-baseline",
          lessonRef: schoolBRefs.lessonRef,
          teachingPlanArtifactRef: schoolBRefs.planArtifactRef,
          teachingPlanRevisionRef: schoolBRefs.planRevisionRef,
          metadata: metadata("education", "lesson-plan-binding")
        }
      }));
      receipts.push(...await this.artifacts.insertTeachingPlanSeedScope(client, {
        artifactRef: schoolBRefs.planArtifactRef,
        revisionRef: schoolBRefs.planRevisionRef,
        lessonRef: schoolBRefs.lessonRef,
        writeContext
      }));
      receipts.push(...await this.gate27Education.insertFoundation(client, {
        courseRunRef: schoolBRefs.courseRunRef,
        objective: {
          objectiveRef: schoolBRefs.followUpObjectiveRef,
          title: "在合成情境中应用一次函数",
          description: "School B 合成后续目标。",
          knowledgeConceptRefs: ["knowledge-concept:linear-function-model"],
          competencyRefs: ["competency:mathematical-modelling"],
          lessonRef: schoolBRefs.lessonRef
        },
        enrollments: [{
          enrollmentRef: schoolBRefs.enrollmentRef,
          learnerRef: schoolBRefs.learnerRef,
          displayName: "School B 匿名学习者 B-01",
          enrolledAt: createdAt
        }],
        metadata: (suffix) => metadata("education", `enrollment-${suffix}`)
      }));
      const result = { replayed: false };
      await this.governance.completeIdempotency(client, {
        rootKey,
        result,
        completedAt: createdAt
      });
      await this.governance.saveAudits(client, receipts);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async seedGate29CurriculumSupport(): Promise<{ replayed: boolean }> {
    const rootIdempotencyKey = "gate2-9:synthetic-next-lesson-context:v2";
    const rootKey = [
      gate2DemoRefs.tenantRef,
      gate2DemoRefs.teacherRef,
      "gate2-9.synthetic-curriculum.seed",
      rootIdempotencyKey
    ].join("|");
    const createdAt = "2026-09-18T08:07:00.000Z";
    const decisionRef = "authorization-decision:gate2-9-curriculum-seed-v2";
    const writeContext: WriteContext = {
      actorRef: gate2DemoRefs.teacherRef,
      purpose: "gate2-9.synthetic-curriculum.seed",
      rootIdempotencyKey,
      authorizationDecisionRef: decisionRef,
      createdAt
    };
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const reservation = await this.governance.reserveIdempotency(client, {
        idempotencyRef: "idempotency:gate2-9-curriculum-seed-v2",
        rootKey,
        requestFingerprint: hash({ fixture: "gate2-9-coefficient-context@2" }),
        metadata: createWriteMetadata(writeContext, "governance", "gate2-9-curriculum-seed-idempotency")
      });
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return { replayed: true };
      }
      const decision: AuthorizationDecision = {
        decisionRef,
        actorRef: gate2DemoRefs.teacherRef,
        tenantRef: gate2DemoRefs.tenantRef,
        purpose: writeContext.purpose,
        action: "gate2-9.curriculum-support.seed",
        resourceRef: gate25DemoRefs.lessonRefs.coefficientMethod,
        requestedFieldMask: [],
        effect: "allow",
        reasonCodes: ["local-synthetic-demo-bootstrap"],
        policyVersion: "policy:gate2-9-local-demo-seed@1",
        decidedAt: createdAt
      };
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision,
          metadata: createWriteMetadata(writeContext, "governance", "gate2-9-curriculum-seed-authorization")
        })
      ];
      receipts.push(await this.gate25Education.insertLessonEvidenceSeed(client, {
        lessonRef: gate25DemoRefs.lessonRefs.coefficientMethod,
        evidenceRef: gate2DemoRefs.observationRefs[0],
        evidenceKind: "observation",
        metadata: createWriteMetadata(writeContext, "education", "gate2-9-coefficient-evidence-link")
      }));
      const result = { replayed: false };
      await this.governance.completeIdempotency(client, { rootKey, result, completedAt: createdAt });
      await this.governance.saveAudits(client, receipts);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async seedGate24(): Promise<{
    replayed: boolean;
    courseRunRef: string;
    goalRef: string;
    teachingPlanArtifactRef: string;
  }> {
    const rootIdempotencyKey = "gate2:synthetic-demo-seed:v1";
    const rootKey = [
      gate2DemoRefs.tenantRef,
      gate2DemoRefs.teacherRef,
      "gate2.synthetic-demo.seed",
      rootIdempotencyKey
    ].join("|");
    const decisionRef =
      "authorization-decision:gate2-synthetic-demo-seed";
    const createdAt = "2026-09-18T08:00:00.000Z";
    const writeContext: WriteContext = {
      actorRef: gate2DemoRefs.teacherRef,
      purpose: "gate2.synthetic-demo.seed",
      rootIdempotencyKey,
      authorizationDecisionRef: decisionRef,
      createdAt
    };
    const result = {
      replayed: false,
      courseRunRef: gate2DemoRefs.courseRunRef,
      goalRef: gate2DemoRefs.goalRef,
      teachingPlanArtifactRef:
        gate2DemoRefs.teachingPlanArtifactRef
    };
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const reservation = await this.governance.reserveIdempotency(
        client,
        {
          idempotencyRef: "idempotency:gate2-demo-seed",
          rootKey,
          requestFingerprint: hash({
            fixture: "gate2-slope-demo@1"
          }),
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "seed-idempotency"
          )
        }
      );
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return {
          ...result,
          replayed: true
        };
      }

      const decision: AuthorizationDecision = {
        decisionRef,
        actorRef: gate2DemoRefs.teacherRef,
        tenantRef: gate2DemoRefs.tenantRef,
        purpose: writeContext.purpose,
        action: "gate2.synthetic-demo.seed",
        resourceRef: gate2DemoRefs.courseRunRef,
        requestedFieldMask: [],
        effect: "allow",
        reasonCodes: ["local-synthetic-demo-bootstrap"],
        policyVersion: "policy:gate2-local-demo-seed@1",
        decidedAt: createdAt
      };
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "seed-authorization"
          )
        })
      ];

      receipts.push(
        ...(await this.work.insertCaseAndGoal(client, {
          caseRecord: {
            ...gate2SyntheticFixture.teachingImprovementCase,
            tenantRef: gate2DemoRefs.tenantRef,
            metadata: createWriteMetadata(
              writeContext,
              "work",
              "teaching-improvement-case"
            )
          },
          goal: {
            ...gate2SyntheticFixture.goal,
            tenantRef: gate2DemoRefs.tenantRef,
            metadata: createWriteMetadata(
              writeContext,
              "work",
              "teaching-improvement-goal"
            )
          }
        }))
      );

      receipts.push(
        ...(await this.artifacts.insertTeachingPlanSeed(client, {
          artifactRef: gate2DemoRefs.teachingPlanArtifactRef,
          revisionRef: gate2DemoRefs.teachingPlanRevisionRef,
          title: "一次函数斜率与图像关系｜课前草稿",
          content: baselineTeachingPlan,
          metadata: createWriteMetadata(
            writeContext,
            "artifact",
            "teaching-plan-seed"
          ),
          outboxMetadata: createWriteMetadata(
            writeContext,
            "artifact",
            "teaching-plan-seed-outbox"
          ),
          outboxRef: "outbox:gate2-teaching-plan-seed"
        }))
      );

      const firstAttempt = gate2SyntheticFixture.attempts[0];
      const firstObservation =
        gate2SyntheticFixture.observations[0];
      const firstClaim = gate2SyntheticFixture.claims[0];
      if (!firstAttempt || !firstObservation || !firstClaim) {
        throw new Error("Gate 2 fixture is incomplete.");
      }
      receipts.push(
        ...(await this.education.insertSyntheticSlice(client, {
          courseRun: {
            ...gate2SyntheticFixture.courseRun,
            metadata: createWriteMetadata(
              writeContext,
              "education",
              "course-run"
            )
          },
          objective: {
            ...gate2SyntheticFixture.objective,
            metadata: createWriteMetadata(
              writeContext,
              "education",
              "learning-objective"
            )
          },
          profile: {
            ...gate2SyntheticFixture.profile,
            profilePayload: {
              ...gate2SyntheticFixture.profile.profilePayload
            },
            contentHash: hash(
              gate2SyntheticFixture.profile.profilePayload
            ),
            metadata: createWriteMetadata(
              writeContext,
              "education",
              "interaction-profile"
            )
          },
          attempt: {
            ...firstAttempt,
            courseRunRef: gate2DemoRefs.courseRunRef,
            objectiveRef: gate2DemoRefs.objectiveRef,
            responseSummary: {
              ...firstAttempt.responseSummary
            },
            metadata: createWriteMetadata(
              writeContext,
              "education",
              "attempt-1"
            )
          },
          observation: {
            ...firstObservation,
            objectiveRef: gate2DemoRefs.objectiveRef,
            observerType: "synthetic-rule",
            observationValue: {
              ...firstObservation.observationValue
            },
            metadata: createWriteMetadata(
              writeContext,
              "education",
              "observation-1"
            )
          },
          claim: {
            ...firstClaim,
            objectiveRef: gate2DemoRefs.objectiveRef,
            claimValue: {
              ...firstClaim.claimValue,
              confidenceExplanation:
                firstClaim.confidenceExplanation
            },
            status: "candidate",
            metadata: createWriteMetadata(
              writeContext,
              "education",
              "claim-1"
            )
          },
          claimObservation: {
            claimRef: firstClaim.claimRef,
            observationRef: firstObservation.observationRef,
            relationType: "supports",
            metadata: createWriteMetadata(
              writeContext,
              "education",
              "claim-observation-1"
            )
          },
          teachingPlanAlignment: {
            alignmentRef:
              "teaching-plan-alignment:gate2-slope-demo",
            teachingPlanArtifactRef:
              gate2DemoRefs.teachingPlanArtifactRef,
            courseRunRef: gate2DemoRefs.courseRunRef,
            objectiveRef: gate2DemoRefs.objectiveRef,
            validationStatus: "validated",
            validationResult: {
              objectiveAligned: true,
              bodyStoredInEducation: false,
              dataMode: "synthetic"
            },
            metadata: createWriteMetadata(
              writeContext,
              "education",
              "teaching-plan-alignment"
            )
          },
          outbox: {
            outboxRef: "outbox:gate2-evidence-1",
            eventName: "EvidenceClaimRecorded",
            aggregateRef: firstClaim.claimRef,
            payload: {
              observationRef: firstObservation.observationRef,
              claimRef: firstClaim.claimRef
            },
            metadata: createWriteMetadata(
              writeContext,
              "education",
              "evidence-outbox-1"
            )
          }
        }))
      );

      const secondAttempt = gate2SyntheticFixture.attempts[1];
      const secondObservation =
        gate2SyntheticFixture.observations[1];
      const secondClaim = gate2SyntheticFixture.claims[1];
      if (!secondAttempt || !secondObservation || !secondClaim) {
        throw new Error("Gate 2 fixture is incomplete.");
      }
      receipts.push(
        ...(await this.education.insertAdditionalEvidenceBundle(
          client,
          {
            attempt: {
              ...secondAttempt,
              courseRunRef: gate2DemoRefs.courseRunRef,
              objectiveRef: gate2DemoRefs.objectiveRef,
              responseSummary: {
                ...secondAttempt.responseSummary
              },
              metadata: createWriteMetadata(
                writeContext,
                "education",
                "attempt-2"
              )
            },
            observation: {
              ...secondObservation,
              objectiveRef: gate2DemoRefs.objectiveRef,
              observerType: "synthetic-rule",
              observationValue: {
                ...secondObservation.observationValue
              },
              metadata: createWriteMetadata(
                writeContext,
                "education",
                "observation-2"
              )
            },
            claim: {
              ...secondClaim,
              objectiveRef: gate2DemoRefs.objectiveRef,
              claimValue: {
                ...secondClaim.claimValue,
                confidenceExplanation:
                  secondClaim.confidenceExplanation
              },
              status: "candidate",
              metadata: createWriteMetadata(
                writeContext,
                "education",
                "claim-2"
              )
            },
            relation: {
              claimRef: secondClaim.claimRef,
              observationRef: secondObservation.observationRef,
              relationType: "supports",
              metadata: createWriteMetadata(
                writeContext,
                "education",
                "claim-observation-2"
              )
            },
            outbox: {
              outboxRef: "outbox:gate2-evidence-2",
              eventName: "EvidenceClaimRecorded",
              aggregateRef: secondClaim.claimRef,
              payload: {
                observationRef:
                  secondObservation.observationRef,
                claimRef: secondClaim.claimRef
              },
              metadata: createWriteMetadata(
                writeContext,
                "education",
                "evidence-outbox-2"
              )
            }
          }
        ))
      );

      await this.governance.completeIdempotency(client, {
        rootKey,
        result,
        completedAt: createdAt
      });
      await this.governance.saveAudits(client, receipts);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async seedGate25(): Promise<{ replayed: boolean }> {
    const rootIdempotencyKey =
      "gate2-5:recoverable-lesson-preparation-seed:v1";
    const rootKey = [
      gate2DemoRefs.tenantRef,
      gate2DemoRefs.teacherRef,
      "gate2-5.lesson-preparation.seed",
      rootIdempotencyKey
    ].join("|");
    const decisionRef =
      "authorization-decision:gate2-5-lesson-preparation-seed";
    const createdAt = "2026-09-18T08:05:00.000Z";
    const writeContext: WriteContext = {
      actorRef: gate2DemoRefs.teacherRef,
      purpose: "gate2-5.lesson-preparation.seed",
      rootIdempotencyKey,
      authorizationDecisionRef: decisionRef,
      createdAt
    };
    const result = { replayed: false };
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const reservation = await this.governance.reserveIdempotency(
        client,
        {
          idempotencyRef:
            "idempotency:gate2-5-lesson-preparation-seed",
          rootKey,
          requestFingerprint: hash({
            fixture: "gate2-5-linear-functions@1"
          }),
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "gate2-5-seed-idempotency"
          )
        }
      );
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return { replayed: true };
      }

      const decision: AuthorizationDecision = {
        decisionRef,
        actorRef: gate2DemoRefs.teacherRef,
        tenantRef: gate2DemoRefs.tenantRef,
        purpose: writeContext.purpose,
        action: "gate2-5.lesson-preparation.seed",
        resourceRef: gate2DemoRefs.courseRunRef,
        requestedFieldMask: [],
        effect: "allow",
        reasonCodes: ["local-synthetic-demo-bootstrap"],
        policyVersion: "policy:gate2-5-local-demo-seed@1",
        decidedAt: createdAt
      };
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "gate2-5-seed-authorization"
          )
        })
      ];

      const educationMetadata = (suffix: string) =>
        createWriteMetadata(
          writeContext,
          "education",
          `gate2-5-seed-${suffix}`
        );
      receipts.push(
        ...(await this.gate25Education.insertCurriculumSeed(
          client,
          {
            courseRunRef: gate2DemoRefs.courseRunRef,
            courseRunPresentation: {
              className: "八年级 3 班",
              academicTerm: "当前学期"
            },
            unit: {
              ...gate25CurriculumFixture.unit,
              metadata: educationMetadata("unit")
            },
            lessons: gate25CurriculumFixture.lessons.map(
              (lesson) => ({
                ...lesson,
                preparationState:
                  lesson.lessonRef ===
                  gate25DemoRefs.lessonRefs
                    .linearFunctionApplication
                    ? ("planned" as const)
                    : ("not_started" as const),
                ...(lesson.lessonRef ===
                gate25DemoRefs.lessonRefs.slopeAndGraph
                  ? {
                      currentApprovedPlanRef:
                        gate2DemoRefs.teachingPlanRevisionRef
                    }
                  : {}),
                ...(lesson.lessonRef ===
                gate25DemoRefs.lessonRefs
                  .linearFunctionApplication
                  ? {
                      activePreparationTaskRef:
                        gate25DemoRefs.seededPreparationTaskRef
                    }
                  : {}),
                metadata: educationMetadata(
                  `lesson-${lesson.sequence}`
                )
              })
            ),
            additionalObjective: {
              objectiveRef:
                gate25DemoRefs.applicationObjectiveRef,
              title: "运用一次函数解决真实情境问题",
              description:
                "学生能从真实情境中识别变量关系，建立一次函数模型并解释结果。",
              knowledgeConceptRefs: [
                "knowledge-concept:linear-function-model"
              ],
              competencyRefs: [
                "competency:mathematical-modelling"
              ],
              metadata: educationMetadata(
                "application-objective"
              )
            },
            objectiveLinks: [
              {
                lessonRef:
                  gate25DemoRefs.lessonRefs.slopeAndGraph,
                objectiveRef: gate2DemoRefs.objectiveRef,
                metadata: educationMetadata(
                  "slope-objective-link"
                )
              },
              {
                lessonRef:
                  gate25DemoRefs.lessonRefs
                    .linearFunctionApplication,
                objectiveRef:
                  gate25DemoRefs.applicationObjectiveRef,
                metadata: educationMetadata(
                  "application-objective-link"
                )
              }
            ],
            evidenceLinks: [
              ...gate2DemoRefs.observationRefs.map(
                (evidenceRef, index) => ({
                  lessonRef:
                    gate25DemoRefs.lessonRefs.slopeAndGraph,
                  evidenceRef,
                  evidenceKind: "observation" as const,
                  metadata: educationMetadata(
                    `slope-observation-${index + 1}`
                  )
                })
              ),
              ...gate2DemoRefs.claimRefs.map(
                (evidenceRef, index) => ({
                  lessonRef:
                    gate25DemoRefs.lessonRefs.slopeAndGraph,
                  evidenceRef,
                  evidenceKind: "claim" as const,
                  metadata: educationMetadata(
                    `slope-claim-${index + 1}`
                  )
                })
              ),
              ...gate2DemoRefs.observationRefs.map(
                (evidenceRef, index) => ({
                  lessonRef:
                    gate25DemoRefs.lessonRefs
                      .linearFunctionApplication,
                  evidenceRef,
                  evidenceKind: "observation" as const,
                  metadata: educationMetadata(
                    `application-observation-${index + 1}`
                  )
                })
              )
            ],
            currentPlanBinding: {
              bindingRef:
                "lesson-plan-binding:slope-baseline",
              lessonRef:
                gate25DemoRefs.lessonRefs.slopeAndGraph,
              teachingPlanArtifactRef:
                gate2DemoRefs.teachingPlanArtifactRef,
              teachingPlanRevisionRef:
                gate2DemoRefs.teachingPlanRevisionRef,
              metadata: educationMetadata(
                "slope-current-plan-binding"
              )
            }
          }
        ))
      );
      receipts.push(
        ...(await this.artifacts.insertTeachingPlanSeedScope(
          client,
          {
            artifactRef:
              gate2DemoRefs.teachingPlanArtifactRef,
            revisionRef:
              gate2DemoRefs.teachingPlanRevisionRef,
            lessonRef:
              gate25DemoRefs.lessonRefs.slopeAndGraph,
            writeContext
          }
        ))
      );

      const workMetadata = (suffix: string) =>
        createWriteMetadata(
          writeContext,
          "work",
          `gate2-5-seed-${suffix}`
        );
      receipts.push(
        ...(await this.gate25Work.insertLessonPreparationTask(
          client,
          {
            taskRef: gate25DemoRefs.seededPreparationTaskRef,
            tenantRef: gate2DemoRefs.tenantRef,
            title: "准备课时：一次函数的应用",
            caseRef: gate2DemoRefs.caseRef,
            goalRef: gate2DemoRefs.goalRef,
            courseRunRef: gate2DemoRefs.courseRunRef,
            curriculumUnitRef: gate25DemoRefs.unitRef,
            lessonRef:
              gate25DemoRefs.lessonRefs
                .linearFunctionApplication,
            dueAt: "2026-09-23T00:00:00.000Z",
            priority: "normal",
            createdBy: gate2DemoRefs.teacherRef,
            workingSet: {
              courseRunRef: gate2DemoRefs.courseRunRef,
              curriculumUnitRef: gate25DemoRefs.unitRef,
              lessonRef:
                gate25DemoRefs.lessonRefs
                  .linearFunctionApplication,
              learningObjectiveRefs: [
                gate25DemoRefs.applicationObjectiveRef
              ],
              evidenceRefs: [...gate2DemoRefs.observationRefs],
              baselineTeachingPlanRef: null,
              purpose: "lesson-preparation.copilot",
              requestedFieldMask: [
                "lesson.title",
                "lesson.learningObjectives",
                "evidence.summary",
                "teachingPlan.content"
              ]
            },
            metadata: {
              task: workMetadata("task"),
              details: workMetadata("task-details"),
              workingSetRevision: workMetadata(
                "working-set-revision"
              ),
              history: workMetadata("task-history"),
              outbox: workMetadata("task-outbox")
            },
            outboxRef:
              "outbox:gate2-5-seeded-preparation-task",
            historyRef:
              "preparation-history:gate2-5-seeded-task"
          }
        ))
      );

      await this.governance.completeIdempotency(client, {
        rootKey,
        result,
        completedAt: createdAt
      });
      await this.governance.saveAudits(client, receipts);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async seedGate27(): Promise<{ replayed: boolean }> {
    const rootIdempotencyKey =
      "gate2-7:assignment-learning-evidence-seed:v1";
    const rootKey = [
      gate2DemoRefs.tenantRef,
      gate2DemoRefs.teacherRef,
      "gate2-7.assignment-learning-evidence.seed",
      rootIdempotencyKey
    ].join("|");
    const decisionRef =
      "authorization-decision:gate2-7-assignment-seed";
    const createdAt = "2026-09-18T08:10:00.000Z";
    const writeContext: WriteContext = {
      actorRef: gate2DemoRefs.teacherRef,
      purpose: "gate2-7.assignment-learning-evidence.seed",
      rootIdempotencyKey,
      authorizationDecisionRef: decisionRef,
      createdAt
    };
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const reservation = await this.governance.reserveIdempotency(
        client,
        {
          idempotencyRef: "idempotency:gate2-7-assignment-seed",
          rootKey,
          requestFingerprint: hash({
            fixture: "gate2-7-anonymous-course-enrollments@1"
          }),
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "gate2-7-seed-idempotency"
          )
        }
      );
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return { replayed: true };
      }
      const decision: AuthorizationDecision = {
        decisionRef,
        actorRef: gate2DemoRefs.teacherRef,
        tenantRef: gate2DemoRefs.tenantRef,
        purpose: writeContext.purpose,
        action: "gate2-7.assignment-learning-evidence.seed",
        resourceRef: gate2DemoRefs.courseRunRef,
        requestedFieldMask: [],
        effect: "allow",
        reasonCodes: ["local-synthetic-demo-bootstrap"],
        policyVersion: "policy:gate2-7-local-demo-seed@1",
        decidedAt: createdAt
      };
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "gate2-7-seed-authorization"
          )
        })
      ];
      receipts.push(
        ...(await this.gate27Education.insertFoundation(client, {
          courseRunRef: gate2DemoRefs.courseRunRef,
          objective: {
            objectiveRef: gate27DemoRefs.nextLessonObjectiveRef,
            title: "根据两点确定一次函数解析式",
            description:
              "学生能够根据两个已知条件使用待定系数法求出一次函数解析式，并检查结果。",
            knowledgeConceptRefs: [
              "knowledge-concept:linear-function-coefficients"
            ],
            competencyRefs: ["competency:mathematical-reasoning"],
            lessonRef: gate27DemoRefs.nextLessonRef
          },
          enrollments: gate27SyntheticEnrollments,
          metadata: (suffix) =>
            createWriteMetadata(
              writeContext,
              "education",
              `gate2-7-seed-${suffix}`
            )
        }))
      );
      const result = { replayed: false };
      await this.governance.completeIdempotency(client, {
        rootKey,
        result,
        completedAt: createdAt
      });
      await this.governance.saveAudits(client, receipts);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
