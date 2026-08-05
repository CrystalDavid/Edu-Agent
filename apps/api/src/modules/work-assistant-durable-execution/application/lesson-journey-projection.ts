import {
  LessonJourneyProjectionSchema,
  type FileAssetSummary,
  type LessonBriefSnapshot,
  type LessonImplementationSummary,
  type LessonJourneyMilestone,
  type LessonJourneyProjection,
  type LessonPreparationTaskSummary,
  type LessonTeachingPlanState,
  type LessonView,
  type PendingProposalList
} from "@edu-agent/contracts";

type SuggestionSummary = PendingProposalList["items"][number];

export interface LessonJourneyAgentExecution {
  readonly agentRunRef: string;
  readonly agentStatus: string;
  readonly modelExecutionRef: string;
  readonly modelStatus: string;
}

export interface LessonJourneyProjectionInput {
  readonly lesson: LessonView;
  readonly tasks: readonly LessonPreparationTaskSummary[];
  readonly teachingPlans: LessonTeachingPlanState;
  readonly files: readonly FileAssetSummary[];
  readonly implementation: LessonImplementationSummary;
  readonly pendingProposals: readonly SuggestionSummary[];
  readonly agentExecution: LessonJourneyAgentExecution | null;
  readonly lessonBrief?: LessonBriefSnapshot | null;
  readonly generatedAt?: string;
}

const activeAgentStatuses = new Set([
  "queued",
  "running",
  "validating",
  "waiting_for_tool",
  "retry"
]);

const failedAgentStatuses = new Set([
  "failed",
  "validation_failed",
  "timeout",
  "timed_out",
  "retryable_failed",
  "cancelled"
]);

export function projectLessonJourney(
  input: LessonJourneyProjectionInput
): LessonJourneyProjection {
  const lessonTasks = [...input.tasks]
    .filter((task) => task.lessonRef === input.lesson.lessonRef)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const activeTask =
    lessonTasks.find(
      (task) => task.status !== "completed" && task.status !== "cancelled"
    ) ?? lessonTasks[0] ?? null;
  const pendingProposal = input.pendingProposals
    .filter(
      (proposal) =>
        proposal.lessonRef === input.lesson.lessonRef ||
        proposal.preparationTaskRef === activeTask?.taskRef
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
  const approvedPlan = input.teachingPlans.currentApproved;
  const inReviewPlan = input.teachingPlans.activeInReview;
  const deliveryDraft = input.implementation.delivery?.currentDraft ?? null;
  const confirmedDelivery = input.implementation.currentDelivery;
  const reflection = input.implementation.reflection;
  const confirmedReflection = reflection?.currentConfirmed ?? null;
  const reflectionDraft = reflection?.currentDraft ?? null;
  const followUps = reflection?.followUps ?? [];
  const activeFiles = input.files.filter((file) => file.status === "active");
  const milestones: LessonJourneyMilestone[] = [];
  const sourceRefs: LessonJourneyProjection["sourceRefs"] = [];
  const sourceVersionVector: Record<string, string> = {};

  milestones.push("lesson_context_ready");
  addSource(sourceRefs, sourceVersionVector, {
    kind: "lesson",
    ref: input.lesson.lessonRef,
    version: lessonVersion(input.lesson)
  });

  if (input.lessonBrief) {
    addSource(sourceRefs, sourceVersionVector, {
      kind: "lesson_brief_run",
      ref: input.lessonBrief.agentRunRef,
      version: `${input.lessonBrief.generatedBySkillRef}:${input.lessonBrief.contentHash}`
    });
    if (input.lessonBrief.status === "adopted") {
      milestones.push("lesson_brief_adopted");
    }
  }

  if (activeTask) {
    milestones.push("preparation_task_created");
    addSource(sourceRefs, sourceVersionVector, {
      kind: "preparation_task",
      ref: activeTask.taskRef,
      version: `${activeTask.version}:${activeTask.status}`
    });
  }
  if (pendingProposal) {
    milestones.push("proposal_ready");
    addSource(sourceRefs, sourceVersionVector, {
      kind: "proposal",
      ref: pendingProposal.proposalRevisionRef,
      version: pendingProposal.status
    });
  }
  if (input.agentExecution) {
    addSource(sourceRefs, sourceVersionVector, {
      kind: "agent_run",
      ref: input.agentExecution.agentRunRef,
      version: input.agentExecution.agentStatus
    });
    addSource(sourceRefs, sourceVersionVector, {
      kind: "model_execution",
      ref: input.agentExecution.modelExecutionRef,
      version: input.agentExecution.modelStatus
    });
  }
  if (approvedPlan) {
    milestones.push("teaching_plan_approved");
    addSource(sourceRefs, sourceVersionVector, {
      kind: "teaching_plan_revision",
      ref: approvedPlan.revisionRef,
      version: `${approvedPlan.revisionNumber}:${approvedPlan.state}`
    });
  }
  for (const file of activeFiles) {
    addSource(sourceRefs, sourceVersionVector, {
      kind: "file_asset",
      ref: file.assetRef,
      version: `${file.version}:${file.currentVersion.versionNumber}`
    });
  }
  if (activeFiles.length > 0) milestones.push("materials_available");
  if (confirmedDelivery) {
    milestones.push("delivery_confirmed");
    addSource(sourceRefs, sourceVersionVector, {
      kind: "delivery_revision",
      ref: confirmedDelivery.deliveryRevisionRef,
      version: `${confirmedDelivery.revisionNumber}:${confirmedDelivery.revisionVersion}`
    });
  } else if (deliveryDraft) {
    addSource(sourceRefs, sourceVersionVector, {
      kind: "delivery_revision",
      ref: deliveryDraft.deliveryRevisionRef,
      version: `${deliveryDraft.revisionNumber}:${deliveryDraft.revisionVersion}:draft`
    });
  }
  if (confirmedReflection) {
    milestones.push("reflection_confirmed");
    addSource(sourceRefs, sourceVersionVector, {
      kind: "reflection_revision",
      ref: confirmedReflection.reflectionRevisionRef,
      version: `${confirmedReflection.revisionNumber}:${confirmedReflection.status}`
    });
  } else if (reflectionDraft) {
    addSource(sourceRefs, sourceVersionVector, {
      kind: "reflection_revision",
      ref: reflectionDraft.reflectionRevisionRef,
      version: `${reflectionDraft.revisionNumber}:${reflectionDraft.status}`
    });
  }
  for (const followUp of followUps) {
    addSource(sourceRefs, sourceVersionVector, {
      kind: "follow_up",
      ref: followUp.followUpRef,
      version: followUp.targetStatus
    });
  }
  if (followUps.length > 0) milestones.push("follow_up_created");

  const common = {
    lessonRef: input.lesson.lessonRef,
    completedMilestones: uniqueMilestones(milestones),
    sourceRefs,
    sourceVersionVector,
    detailLinks: detailLinks(input.lesson.lessonRef, activeTask?.taskRef ?? null, reflection?.reflectionRef ?? null),
    generatedAt: input.generatedAt ?? new Date().toISOString()
  };

  if (input.lesson.learningObjectives.length === 0) {
    return parseProjection({
      ...common,
      currentStage: "understand",
      status: "needs_attention",
      nextBestAction: action(
        "review_lesson_context",
        "检查课时信息",
        "当前课时还没有可用于备课的教学目标。",
        common.detailLinks.lesson
      ),
      blockingReasons: ["当前课时缺少教学目标，暂不能形成可靠的备课上下文。"]
    });
  }

  if (input.lessonBrief?.status === "waiting_for_teacher") {
    return parseProjection({
      ...common,
      currentStage: "understand",
      status: "waiting_for_teacher",
      nextBestAction: action(
        "review_lesson_brief",
        "判断本课教学洞察",
        "系统已基于当前课时、目标和已授权 Evidence 生成候选，正在等待教师采用或调整。",
        `${common.detailLinks.lesson}#lesson-brief`
      ),
      blockingReasons: []
    });
  }

  if (!input.lessonBrief && !activeTask && !confirmedDelivery) {
    return parseProjection({
      ...common,
      currentStage: "understand",
      status: "ready",
      nextBestAction: action(
        "generate_lesson_brief",
        "先看懂这节课",
        "系统可以先基于现有目标、已授权 Evidence 和已确认偏好整理教学洞察候选。",
        `${common.detailLinks.lesson}#lesson-brief`
      ),
      blockingReasons: []
    });
  }

  if (pendingProposal || activeTask?.status === "awaiting_plan_review") {
    return parseProjection({
      ...common,
      currentStage: "plan",
      status: "waiting_for_teacher",
      nextBestAction: action(
        "review_proposal",
        "审阅备课建议",
        "Agent 已完成建议，正在等待教师判断。",
        common.detailLinks.teachingPlan ?? common.detailLinks.lesson
      ),
      blockingReasons: []
    });
  }

  if (inReviewPlan) {
    addSource(sourceRefs, sourceVersionVector, {
      kind: "teaching_plan_revision",
      ref: inReviewPlan.revisionRef,
      version: `${inReviewPlan.revisionNumber}:${inReviewPlan.state}`
    });
    return parseProjection({
      ...common,
      currentStage: "plan",
      status: "waiting_for_teacher",
      nextBestAction: action(
        "review_teaching_plan",
        "审核教学计划",
        "当前计划已进入审核，批准仍需教师显式操作。",
        common.detailLinks.teachingPlan ?? common.detailLinks.lesson
      ),
      blockingReasons: []
    });
  }

  const executionStatuses = [
    input.agentExecution?.agentStatus,
    input.agentExecution?.modelStatus
  ].filter((value): value is string => Boolean(value));
  if (executionStatuses.some((status) => failedAgentStatuses.has(status))) {
    return parseProjection({
      ...common,
      currentStage: "plan",
      status: "needs_attention",
      nextBestAction: action(
        "recover_agent_run",
        "处理生成失败",
        "本次 Agent 执行未完成，可以查看原因后重试。",
        common.detailLinks.agentRun ?? common.detailLinks.lesson
      ),
      blockingReasons: ["最近一次 Agent 执行失败或已取消，尚未形成可审阅建议。"]
    });
  }
  if (executionStatuses.some((status) => activeAgentStatuses.has(status))) {
    return parseProjection({
      ...common,
      currentStage: "plan",
      status: "waiting_for_agent",
      nextBestAction: action(
        "view_agent_run",
        "查看生成进度",
        "Agent 正在使用已授权上下文生成备课建议。",
        common.detailLinks.agentRun ?? common.detailLinks.lesson
      ),
      blockingReasons: []
    });
  }

  if (!approvedPlan && !confirmedDelivery) {
    return parseProjection({
      ...common,
      currentStage: "plan",
      status: activeTask?.status === "planned" ? "ready" : "in_progress",
      nextBestAction: action(
        "continue_preparation",
        "继续形成方案",
        "本课还没有已批准的教学计划。",
        common.detailLinks.preparationTask ?? common.detailLinks.lesson
      ),
      blockingReasons: []
    });
  }

  if (deliveryDraft && !confirmedDelivery) {
    return parseProjection({
      ...common,
      currentStage: "deliver",
      status: "waiting_for_teacher",
      nextBestAction: action(
        "confirm_delivery",
        "确认课堂记录",
        "课堂记录仍是草稿，只有教师确认后才是实施事实。",
        common.detailLinks.implementation
      ),
      blockingReasons: []
    });
  }

  if (confirmedDelivery && !confirmedReflection) {
    if (reflection?.generationStatus === "generating") {
      return parseProjection({
        ...common,
        currentStage: "reflect",
        status: "waiting_for_agent",
        nextBestAction: action(
          "review_reflection",
          "查看反思生成进度",
          "Agent 正在基于已确认实施事实生成反思草稿。",
          common.detailLinks.reflection ?? common.detailLinks.implementation
        ),
        blockingReasons: []
      });
    }
    if (reflectionDraft) {
      return parseProjection({
        ...common,
        currentStage: "reflect",
        status: "waiting_for_teacher",
        nextBestAction: action(
          "review_reflection",
          "审阅课后反思",
          "反思草稿已准备好，正式确认仍由教师完成。",
          common.detailLinks.reflection ?? common.detailLinks.implementation
        ),
        blockingReasons: []
      });
    }
    return parseProjection({
      ...common,
      currentStage: "reflect",
      status: "ready",
      nextBestAction: action(
        "start_reflection",
        "开始课后复盘",
        "课堂实施已确认，可以生成可追溯的反思草稿。",
        common.detailLinks.implementation
      ),
      blockingReasons: []
    });
  }

  if (confirmedReflection) {
    if (followUps.length === 0) {
      return parseProjection({
        ...common,
        currentStage: "improve",
        status: "waiting_for_teacher",
        nextBestAction: action(
          "choose_follow_up",
          "选择下一步行动",
          "反思已经确认，但系统不能替教师假设是否需要后续行动。",
          common.detailLinks.reflection ?? common.detailLinks.lesson
        ),
        blockingReasons: []
      });
    }
    return parseProjection({
      ...common,
      currentStage: "improve",
      status: "completed",
      nextBestAction: action(
        "view_completed_journey",
        "查看本课教学闭环",
        "至少一项教师确认的后续行动已经建立。",
        common.detailLinks.lesson
      ),
      blockingReasons: []
    });
  }

  if (activeFiles.length === 0) {
    return parseProjection({
      ...common,
      currentStage: "materials",
      status: "ready",
      nextBestAction: action(
        "prepare_materials",
        "准备教学材料",
        "教学计划已批准，本课尚无关联教学材料。",
        common.detailLinks.files
      ),
      blockingReasons: ["尚无与当前课时关联的可用教学材料。"]
    });
  }

  return parseProjection({
    ...common,
    currentStage: "deliver",
    status: "ready",
    nextBestAction: action(
      "record_delivery",
      "课后记录实施情况",
      "已批准计划和教学材料已经就绪；这不表示课堂已经实施。",
      common.detailLinks.implementation
    ),
    blockingReasons: []
  });
}

function action(
  kind: LessonJourneyProjection["nextBestAction"]["kind"],
  label: string,
  reason: string,
  href: string
): LessonJourneyProjection["nextBestAction"] {
  return { kind, label, reason, href };
}

function detailLinks(
  lessonRef: string,
  taskRef: string | null,
  reflectionRef: string | null
): LessonJourneyProjection["detailLinks"] {
  const encodedLesson = encodeURIComponent(lessonRef);
  const encodedTask = taskRef ? encodeURIComponent(taskRef) : null;
  return {
    lesson: `/teaching/lessons/${encodedLesson}`,
    preparationTask: encodedTask ? `/agent?task=${encodedTask}` : null,
    teachingPlan: encodedTask ? `/teaching-plan?task=${encodedTask}` : null,
    files: `/files?lesson=${encodedLesson}`,
    implementation: `/teaching/lessons/${encodedLesson}#classroom-implementation`,
    reflection: reflectionRef
      ? `/reflections/${encodeURIComponent(reflectionRef)}`
      : null,
    agentRun: encodedTask ? `/runs?task=${encodedTask}` : null
  };
}

function lessonVersion(lesson: LessonView): string {
  return [
    lesson.preparationState,
    lesson.currentApprovedPlanRef ?? "no-plan",
    lesson.activePreparationTaskRef ?? "no-task",
    lesson.learningObjectives.map((objective) => objective.objectiveRef).sort().join(",") || "no-objectives"
  ].join(":");
}

function addSource(
  sourceRefs: LessonJourneyProjection["sourceRefs"],
  vector: Record<string, string>,
  source: LessonJourneyProjection["sourceRefs"][number]
): void {
  const key = `${source.kind}:${source.ref}`;
  if (vector[key] !== undefined) return;
  sourceRefs.push(source);
  vector[key] = source.version;
}

function uniqueMilestones(
  milestones: readonly LessonJourneyMilestone[]
): LessonJourneyMilestone[] {
  return [...new Set(milestones)];
}

function parseProjection(value: unknown): LessonJourneyProjection {
  return LessonJourneyProjectionSchema.parse(value);
}
