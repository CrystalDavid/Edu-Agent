import { createHash, randomUUID } from "node:crypto";

import type {
  AuthorizationDecision,
  CalendarEventType,
  FormalWriteReceipt
} from "@edu-agent/contracts";
import {
  baselineTeachingPlan,
  gate2DemoRefs,
  gate2SyntheticFixture
} from "@edu-agent/sample-data";
import type { Pool } from "../../apps/api/src/platform/postgres/pool.js";

import {
  PostgresGate2ArtifactRepository
} from "../../apps/api/src/modules/artifact-collaboration/infrastructure/postgres-gate2-artifact-repository.js";
import {
  PostgresGate25EducationRepository
} from "../../apps/api/src/modules/education-domain/infrastructure/postgres-gate2-5-education-repository.js";
import {
  PostgresGate27EducationRepository
} from "../../apps/api/src/modules/education-domain/infrastructure/postgres-gate2-7-education-repository.js";
import {
  PostgresEducationRepository
} from "../../apps/api/src/modules/education-domain/infrastructure/postgres-education-repository.js";
import {
  PostgresGovernanceRepository
} from "../../apps/api/src/modules/identity-governance-audit/infrastructure/postgres-governance-repository.js";
import {
  PostgresGate25WorkRepository
} from "../../apps/api/src/modules/work-assistant-durable-execution/infrastructure/postgres-gate2-5-work-repository.js";
import {
  PostgresGate28WorkRepository
} from "../../apps/api/src/modules/work-assistant-durable-execution/infrastructure/postgres-gate2-8-work-repository.js";
import {
  PostgresGate2WorkRepository
} from "../../apps/api/src/modules/work-assistant-durable-execution/infrastructure/postgres-gate2-work-repository.js";
import {
  createWriteMetadata,
  type WriteContext
} from "../../apps/api/src/platform/postgres/write-context.js";
import {
  gate25CurriculumFixture,
  gate25DemoRefs
} from "./gate2-5-demo-fixture.js";
import {
  gate27DemoRefs,
  gate27SyntheticEnrollments
} from "./gate2-7-demo-fixture.js";
function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function externalSubjectHash(provider: string, subject: string): string {
  return createHash("sha256")
    .update(`${provider}\u0000${subject}`)
    .digest("hex");
}

function maskSubjectHint(value: string): string {
  return value.length <= 5
    ? "***"
    : `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function shanghaiDateText(value = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addCalendarDays(dateText: string, days: number): string {
  const date = new Date(`${dateText}T12:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return shanghaiDateText(date);
}

function localIso(dateText: string, time: string): string {
  return new Date(`${dateText}T${time}:00+08:00`).toISOString();
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
      new PostgresGate25WorkRepository(),
    private readonly gate28Work =
      new PostgresGate28WorkRepository()
  ) {}

  async seed(
    options: { includeGate25?: boolean; includeGate27?: boolean } = {}
  ): Promise<{
    replayed: boolean;
    courseRunRef: string;
    goalRef: string;
    teachingPlanArtifactRef: string;
  }> {
    await this.seedSyntheticIdentityFoundation();
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
    const gate28 = await this.seedGate28TeacherCalendar();
    return {
      ...gate24,
      replayed:
        gate24.replayed && schoolB.replayed && gate25.replayed &&
        gate29Support.replayed && gate27.replayed && gate28.replayed
    };
  }

  private async seedSyntheticIdentityFoundation(): Promise<void> {
    const createdAt = "2026-09-18T07:45:00.000Z";
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const organizations = [
        [gate2DemoRefs.tenantRef, "明远实验中学"],
        [schoolBRefs.tenantRef, "远航实验学校（合成）"]
      ] as const;
      for (const [organizationRef, name] of organizations) {
        await client.query(
          `INSERT INTO governance.organization (
             organization_ref, organization_type, name, status,
             timezone, data_source, version, created_at, updated_at
           ) VALUES ($1, 'school', $2, 'active', 'Asia/Shanghai',
             'synthetic-demo-seed', 1, $3, $3)
           ON CONFLICT (organization_ref) DO UPDATE
             SET name = EXCLUDED.name,
                 updated_at = EXCLUDED.updated_at`,
          [organizationRef, name, createdAt]
        );
      }

      const users = [
        {
          userRef: gate2DemoRefs.teacherRef,
          displayName: "林老师",
          email: "lin.teacher@example.test",
          subject: "teacher-a"
        },
        {
          userRef: "user:school-admin-001",
          displayName: "周管理员（合成）",
          email: "zhou.admin@example.test",
          subject: "school-admin-a"
        },
        {
          userRef: "user:multi-school-001",
          displayName: "陈老师（多学校合成）",
          email: "chen.teacher@example.test",
          subject: "multi-school-teacher"
        },
        {
          userRef: schoolBRefs.teacherRef,
          displayName: "王老师（合成）",
          email: "wang.teacher@example.test",
          subject: "teacher-b"
        }
      ] as const;
      for (const user of users) {
        await client.query(
          `INSERT INTO governance.user_account (
             user_ref, display_name, email, status, data_source,
             version, created_at, updated_at
           ) VALUES ($1, $2, $3, 'active', 'synthetic-demo-seed', 1, $4, $4)
           ON CONFLICT (user_ref) DO UPDATE
             SET display_name = EXCLUDED.display_name,
                 email = EXCLUDED.email,
                 updated_at = EXCLUDED.updated_at`,
          [user.userRef, user.displayName, user.email, createdAt]
        );
        await client.query(
          `INSERT INTO governance.external_identity_link (
             identity_link_ref, user_ref, provider,
             external_subject_hash, display_hint, linked_at
           ) VALUES ($1, $2, 'local-development', $3, $4, $5)
           ON CONFLICT (provider, external_subject_hash) DO NOTHING`,
          [
            `identity-link:local:${user.userRef}`,
            user.userRef,
            externalSubjectHash("local-development", user.subject),
            maskSubjectHint(user.subject),
            createdAt
          ]
        );
      }

      const memberships = [
        {
          ref: "membership:demo-school:teacher-001",
          org: gate2DemoRefs.tenantRef,
          user: gate2DemoRefs.teacherRef,
          roles: ["ordinary_teacher"] as const,
          courses: [gate2DemoRefs.courseRunRef]
        },
        {
          ref: "membership:demo-school:admin-001",
          org: gate2DemoRefs.tenantRef,
          user: "user:school-admin-001",
          roles: ["school_admin", "ordinary_teacher"] as const,
          courses: [gate2DemoRefs.courseRunRef]
        },
        {
          ref: "membership:demo-school:multi-001",
          org: gate2DemoRefs.tenantRef,
          user: "user:multi-school-001",
          roles: ["ordinary_teacher"] as const,
          courses: [gate2DemoRefs.courseRunRef]
        },
        {
          ref: "membership:demo-school-b:multi-001",
          org: schoolBRefs.tenantRef,
          user: "user:multi-school-001",
          roles: ["ordinary_teacher"] as const,
          courses: [schoolBRefs.courseRunRef]
        },
        {
          ref: "membership:demo-school-b:teacher-001",
          org: schoolBRefs.tenantRef,
          user: schoolBRefs.teacherRef,
          roles: ["ordinary_teacher"] as const,
          courses: [schoolBRefs.courseRunRef]
        }
      ] as const;
      for (const membership of memberships) {
        await client.query(
          `INSERT INTO governance.organization_membership (
             membership_ref, organization_ref, user_ref, status,
             created_by, activated_at, version, created_at, updated_at
           ) VALUES ($1, $2, $3, 'active', 'system:synthetic-seed',
             $4, 1, $4, $4)
           ON CONFLICT (membership_ref) DO NOTHING`,
          [membership.ref, membership.org, membership.user, createdAt]
        );
        for (const role of membership.roles) {
          await client.query(
            `INSERT INTO governance.membership_role_assignment (
               membership_ref, role_key, assigned_by, assigned_at
             ) VALUES ($1, $2, 'system:synthetic-seed', $3)
             ON CONFLICT (membership_ref, role_key) DO NOTHING`,
            [membership.ref, role, createdAt]
          );
        }
        for (const courseRunRef of membership.courses) {
          await client.query(
            `INSERT INTO governance.membership_course_run_access (
               membership_ref, course_run_ref, granted_by, granted_at
             ) VALUES ($1, $2, 'system:synthetic-seed', $3)
             ON CONFLICT (membership_ref, course_run_ref) DO NOTHING`,
            [membership.ref, courseRunRef, createdAt]
          );
        }
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
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

  private async seedGate28TeacherCalendar(): Promise<{ replayed: boolean }> {
    const requestedReferenceDate =
      process.env.EDU_AGENT_SAMPLE_REFERENCE_DATE ?? shanghaiDateText();
    const referenceDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedReferenceDate)
      ? requestedReferenceDate
      : shanghaiDateText();
    const monthKey = referenceDate.slice(0, 7);
    const rootIdempotencyKey = `gate2-8:teacher-calendar:${monthKey}:v1`;
    const rootKey = [
      gate2DemoRefs.tenantRef,
      gate2DemoRefs.teacherRef,
      "gate2-8.teacher-calendar.seed",
      rootIdempotencyKey
    ].join("|");
    const decisionRef =
      `authorization-decision:gate2-8-calendar-seed:${monthKey}`;
    const createdAt = localIso(referenceDate, "06:30");
    const writeContext: WriteContext = {
      actorRef: gate2DemoRefs.teacherRef,
      purpose: "gate2-8.teacher-calendar.seed",
      rootIdempotencyKey,
      authorizationDecisionRef: decisionRef,
      createdAt
    };
    const result = { replayed: false };
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const reservation = await this.governance.reserveIdempotency(client, {
        idempotencyRef: `idempotency:gate2-8-calendar-seed:${monthKey}`,
        rootKey,
        requestFingerprint: hash({
          fixture: "lin-teacher-calendar@1",
          monthKey
        }),
        metadata: createWriteMetadata(
          writeContext,
          "governance",
          "gate2-8-calendar-idempotency"
        )
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
        action: "gate2-8.teacher-calendar.seed",
        resourceRef: gate2DemoRefs.courseRunRef,
        requestedFieldMask: [],
        effect: "allow",
        reasonCodes: ["explicit-local-sample-seed"],
        policyVersion: "policy:gate2-8-local-sample-seed@1",
        decidedAt: createdAt
      };
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "gate2-8-calendar-authorization"
          )
        })
      ];
      const workMetadata = (suffix: string) =>
        createWriteMetadata(writeContext, "work", suffix);
      const events: Array<{
        key: string;
        date: string;
        title: string;
        description: string;
        start: string;
        end: string;
        type: CalendarEventType;
        allDay?: boolean;
      }> = [];

      let cursor = `${monthKey}-01`;
      while (cursor.startsWith(monthKey)) {
        const weekday = new Date(`${cursor}T12:00:00+08:00`).getUTCDay();
        if (weekday >= 1 && weekday <= 5) {
          events.push({
            key: "class-primary",
            date: cursor,
            title: weekday % 2 === 0
              ? "八年级3班数学·待定系数法"
              : "八年级3班数学·一次函数",
            description: "按当前课时与已批准教学计划开展课堂教学。",
            start: "08:30",
            end: "09:15",
            type: "class"
          });
          if ([1, 3, 4].includes(weekday)) {
            events.push({
              key: "class-secondary",
              date: cursor,
              title: "八年级2班数学课",
              description: "完成课堂教学并记录需要跟进的问题。",
              start: "10:20",
              end: "11:05",
              type: "class"
            });
          }
          if (weekday === 3 || weekday === 5) {
            events.push({
              key: "duty",
              date: cursor,
              title: weekday === 3 ? "午间巡班" : "早读值班",
              description: "年级日常巡班与秩序检查。",
              start: weekday === 3 ? "12:20" : "07:30",
              end: weekday === 3 ? "12:50" : "08:00",
              type: "duty"
            });
          }
          if ([2, 3, 4].includes(weekday)) {
            events.push({
              key: "preparation",
              date: cursor,
              title: "下一课集体备课",
              description: "整理课堂证据并完善下一课教学活动。",
              start: "14:00",
              end: "15:10",
              type: "lesson_preparation"
            });
          }
          if (weekday === 2) {
            events.push({
              key: "meeting",
              date: cursor,
              title: "八年级数学备课组会议",
              description: "同步本周教学进度与共性问题。",
              start: "15:30",
              end: "16:20",
              type: "meeting"
            });
          }
          if ([1, 3, 4].includes(weekday)) {
            events.push({
              key: "grading",
              date: cursor,
              title: "作业批改与反馈确认",
              description: "处理待批改提交并确认教师反馈。",
              start: "16:20",
              end: "17:30",
              type: "grading"
            });
          }
          if (weekday === 5) {
            events.push({
              key: "school-affair",
              date: cursor,
              title: "年级教学周总结",
              description: "整理本周教学进度和下周重点。",
              start: "15:30",
              end: "16:20",
              type: "school_affair"
            });
          }
          if (weekday === 1) {
            events.push({
              key: "personal",
              date: cursor,
              title: "整理个人教学资料",
              description: "归档本周教案和课堂记录。",
              start: "18:00",
              end: "18:30",
              type: "custom_reminder"
            });
          }
        }
        cursor = addCalendarDays(cursor, 1);
      }
      events.push({
        key: "monthly-school-day",
        date: `${monthKey}-15`,
        title: "校园教学开放日",
        description: "学校教学活动安排。",
        start: "00:00",
        end: "00:00",
        type: "school_affair",
        allDay: true
      });

      for (const event of events) {
        const safeDate = event.date.replaceAll("-", "");
        const eventRef = `calendar-event:lin:${safeDate}:${event.key}`;
        const endDate = event.allDay
          ? addCalendarDays(event.date, 1)
          : event.date;
        receipts.push(...await this.gate28Work.insertCalendarEvent(client, {
          eventRef,
          tenantRef: gate2DemoRefs.tenantRef,
          teacherRef: gate2DemoRefs.teacherRef,
          title: event.title,
          description: event.description,
          startAt: localIso(event.date, event.start),
          endAt: localIso(endDate, event.end),
          timezone: "Asia/Shanghai",
          allDay: event.allDay ?? false,
          eventType: event.type,
          relatedTodoRef: null,
          createdBy: gate2DemoRefs.teacherRef,
          metadata: workMetadata(`calendar-${safeDate}-${event.key}`),
          historyMetadata: workMetadata(`calendar-history-${safeDate}-${event.key}`),
          outboxMetadata: workMetadata(`calendar-outbox-${safeDate}-${event.key}`),
          historyRef: `calendar-history:lin:${safeDate}:${event.key}`,
          outboxRef: `outbox:calendar:lin:${safeDate}:${event.key}`
        }));
      }

      const todoSeeds = [
        { key: "lesson-examples", title: "完善一次函数例题讲解", priority: "high" as const, dueOffset: 0, completed: false },
        { key: "research-materials", title: "准备周五教研材料", priority: "normal" as const, dueOffset: 2, completed: false },
        { key: "assignment-feedback", title: "确认八年级3班作业反馈", priority: "high" as const, dueOffset: 1, completed: false },
        { key: "projector", title: "检查教室投影设备", priority: "low" as const, dueOffset: 0, completed: false },
        { key: "attendance", title: "登记本周课堂观察", priority: "normal" as const, dueOffset: -1, completed: true },
        { key: "plan-review", title: "审核下一课教学计划", priority: "high" as const, dueOffset: -2, completed: true },
        { key: "file-archive", title: "归档已批准教案", priority: "low" as const, dueOffset: -3, completed: true }
      ];
      for (const todo of todoSeeds) {
        const todoRef = `teacher-todo:lin:${monthKey}:${todo.key}`;
        receipts.push(...await this.gate28Work.insertTodo(client, {
          todoRef,
          tenantRef: gate2DemoRefs.tenantRef,
          teacherRef: gate2DemoRefs.teacherRef,
          title: todo.title,
          description: "林老师个人教学待办",
          priority: todo.priority,
          dueAt: localIso(addCalendarDays(referenceDate, todo.dueOffset), "17:30"),
          createdBy: gate2DemoRefs.teacherRef,
          metadata: workMetadata(`todo-${todo.key}`),
          historyMetadata: workMetadata(`todo-history-${todo.key}`),
          outboxMetadata: workMetadata(`todo-outbox-${todo.key}`),
          historyRef: `todo-history:lin:${monthKey}:${todo.key}:created`,
          outboxRef: `outbox:todo:lin:${monthKey}:${todo.key}:created`
        }));
        if (todo.completed) {
          const transition = await this.gate28Work.transitionTodo(client, {
            tenantRef: gate2DemoRefs.tenantRef,
            teacherRef: gate2DemoRefs.teacherRef,
            todoRef,
            expectedVersion: 1,
            fromStatuses: ["active"],
            toStatus: "completed",
            occurredAt: localIso(referenceDate, "06:31"),
            reason: "教师已完成待办",
            metadata: workMetadata(`todo-complete-${todo.key}`),
            historyMetadata: workMetadata(`todo-complete-history-${todo.key}`),
            outboxMetadata: workMetadata(`todo-complete-outbox-${todo.key}`),
            historyRef: `todo-history:lin:${monthKey}:${todo.key}:completed`,
            outboxRef: `outbox:todo:lin:${monthKey}:${todo.key}:completed`
          });
          if (transition) receipts.push(...transition);
        }
      }

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
