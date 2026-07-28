import { createHash } from "node:crypto";

import type { FormalWriteMetadata } from "@edu-agent/contracts";

type Owner =
  | "artifact"
  | "education"
  | "governance"
  | "work";

function metadata<TOwner extends Owner>(
  owner: TOwner,
  suffix: string,
  authorizationDecisionRef: string
): FormalWriteMetadata & { owner: TOwner } {
  return {
    actorRef: "user:teacher-001",
    purpose: "gate1b.synthetic-slope-evidence",
    owner,
    idempotencyKey: `gate1b:${suffix}`,
    authorizationDecisionRef,
    auditRef: `audit:${suffix}`,
    createdAt: "2026-07-28T09:00:00.000Z"
  };
}

function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

export function makeGate1BSyntheticFixture(suffix: string) {
  const authorizationDecisionRef = `authorization-decision:${suffix}`;
  const courseRunRef = `course-run:${suffix}`;
  const objectiveRef = `objective:slope-graph:${suffix}`;
  const profileRef = `interaction-profile:${suffix}`;
  const attemptRef = `attempt:${suffix}`;
  const observationRef = `evidence-observation:${suffix}`;
  const claimRef = `evidence-claim:${suffix}`;
  const teachingPlanArtifactRef = `artifact:teaching-plan:${suffix}`;

  const profilePayload = {
    interaction: "guided-inquiry",
    askBeforeHint: true,
    preserveStudentExplanation: true
  };

  return {
    authorizationDecisionRef,
    teachingPlan: {
      artifactRef: teachingPlanArtifactRef,
      title: "一次函数斜率与图像关系教学计划",
      body:
        "用三组同截距、不同斜率的一次函数图像，引导学生比较上升方向与陡峭程度。"
    },
    courseRun: {
      courseRunRef,
      tenantRef: "tenant:demo-school",
      curriculumFrameworkRef: "curriculum:cn-junior-math:synthetic",
      subject: "数学",
      gradeLevel: "八年级",
      academicTerm: "2026-fall",
      metadata: metadata(
        "education",
        `course-run:${suffix}`,
        authorizationDecisionRef
      )
    },
    objective: {
      objectiveRef,
      courseRunRef,
      title: "解释一次函数斜率与图像方向、陡峭程度的关系",
      description:
        "学生能比较斜率的正负和绝对值，并用图像变化进行解释。",
      knowledgeConceptRefs: [
        "knowledge-concept:linear-function-slope",
        "knowledge-concept:cartesian-graph"
      ],
      competencyRefs: [
        "competency:mathematical-representation",
        "competency:reasoning"
      ],
      metadata: metadata(
        "education",
        `objective:${suffix}`,
        authorizationDecisionRef
      )
    },
    profile: {
      profileRef,
      profileVersion: 1,
      scopeRef: courseRunRef,
      participationMode: "guided-inquiry",
      supportLimit: 2,
      answerReleaseBoundary: "after-two-student-explanations",
      policyVersionRef: "policy:learning-interaction@1",
      promptVersionRef: "prompt:slope-guidance@1",
      evidenceRuleVersionRef: "evidence-rule:slope-explanation@1",
      profilePayload,
      contentHash: hash(profilePayload),
      validFrom: "2026-07-28T09:00:00.000Z",
      metadata: metadata(
        "education",
        `profile-v1:${suffix}`,
        authorizationDecisionRef
      )
    },
    attempt: {
      attemptRef,
      courseRunRef,
      objectiveRef,
      learnerRef: `learner:synthetic:${suffix}`,
      submittedAt: "2026-07-28T09:05:00.000Z",
      responseSummary: {
        selectedGraph: "positive-steep",
        explanation:
          "斜率越大图像越靠上，截距决定线是否更陡。"
      },
      metadata: metadata(
        "education",
        `attempt:${suffix}`,
        authorizationDecisionRef
      )
    },
    observation: {
      observationRef,
      attemptRef,
      objectiveRef,
      observerType: "deterministic-rule",
      observationType: "slope-intercept-confusion",
      observationValue: {
        confusedProperties: ["slope-magnitude", "intercept"],
        quotedStudentText: false
      },
      observedAt: "2026-07-28T09:05:01.000Z",
      sourceRef: attemptRef,
      metadata: metadata(
        "education",
        `observation:${suffix}`,
        authorizationDecisionRef
      )
    },
    claim: {
      claimRef,
      objectiveRef,
      claimType: "possible-misconception",
      claimValue: {
        misconceptionRef:
          "misconception:slope-magnitude-versus-intercept"
      },
      confidence: 0.78,
      validFrom: "2026-07-28T09:05:01.000Z",
      expiresAt: "2026-08-28T09:05:01.000Z",
      status: "candidate" as const,
      metadata: metadata(
        "education",
        `claim:${suffix}`,
        authorizationDecisionRef
      )
    },
    claimObservation: {
      claimRef,
      observationRef,
      relationType: "supports" as const,
      metadata: metadata(
        "education",
        `claim-observation:${suffix}`,
        authorizationDecisionRef
      )
    },
    teachingPlanAlignment: {
      alignmentRef: `teaching-plan-alignment:${suffix}`,
      teachingPlanArtifactRef,
      courseRunRef,
      objectiveRef,
      validationStatus: "validated" as const,
      validationResult: {
        objectiveAligned: true,
        bodyStoredInEducation: false
      },
      metadata: metadata(
        "education",
        `teaching-plan-alignment:${suffix}`,
        authorizationDecisionRef
      )
    },
    outbox: {
      outboxRef: `education-outbox:${suffix}`,
      eventName: "EvidenceClaimRecorded",
      aggregateRef: claimRef,
      payload: {
        observationRef,
        claimRef,
        objectiveRef
      },
      metadata: metadata(
        "education",
        `outbox:${suffix}`,
        authorizationDecisionRef
      )
    }
  };
}
