import { useEffect, useMemo, useState } from "react";

import type {
  LessonView,
  ModelExecutionView,
  ReflectionContent,
  ReflectionDetail
} from "@edu-agent/contracts";
import {
  Alert,
  Button,
  Card,
  Divider,
  Input,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  Typography
} from "antd";

import {
  cancelModelInvocation,
  confirmReflection,
  createReflectionFollowUp,
  generateReflection,
  loadCourseRuns,
  loadCurriculumUnits,
  loadLessons,
  loadModelInvocation,
  loadReflection,
  retryModelInvocation,
  updateReflectionDraft
} from "../api";
import { PageHeader } from "../components/portal/PortalPrimitives";
import { modelExecutionStatusLabel } from "../presentation";
import type { AppRoute } from "../route";

const { Paragraph, Text, Title } = Typography;

const terminalStatuses = new Set([
  "succeeded",
  "timed_out",
  "retryable_failed",
  "permanently_failed",
  "validation_failed",
  "budget_exceeded",
  "cancelled"
]);

const cancellableStatuses = new Set([
  "queued",
  "running",
  "validating",
  "cancel_requested"
]);

const retryableStatuses = new Set([
  "timed_out",
  "retryable_failed",
  "permanently_failed",
  "validation_failed",
  "budget_exceeded",
  "cancelled"
]);

function lines(value: string[]): string {
  return value.join("\n");
}

function splitLines(value: string): string[] {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

export function ReflectionAgentPage(props: {
  reflectionRef: string;
  navigate: (route: AppRoute) => void;
  navigateLesson: (lessonRef: string) => void;
  navigatePreparation: (
    taskRef: string,
    destination?: "/agent" | "/copilot" | "/teaching-plan" | "/runs"
  ) => void;
  onAction: (message: string) => void;
}) {
  const [reflection, setReflection] = useState<ReflectionDetail | null>(null);
  const [execution, setExecution] = useState<ModelExecutionView | null>(null);
  const [lessons, setLessons] = useState<LessonView[]>([]);
  const [draftContent, setDraftContent] = useState<ReflectionContent | null>(null);
  const [teacherNotes, setTeacherNotes] = useState("");
  const [followUpType, setFollowUpType] = useState<"lesson_preparation" | "assignment_draft" | "teacher_todo">("lesson_preparation");
  const [targetLessonRef, setTargetLessonRef] = useState("");
  const [followUpTitle, setFollowUpTitle] = useState("落实本节课后反思");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeRevision = reflection?.currentDraft ?? reflection?.currentConfirmed ?? null;
  const sourceLesson = lessons.find((item) => item.lessonRef === activeRevision?.lessonRef) ?? null;
  const targetLesson = lessons.find((item) => item.lessonRef === targetLessonRef) ?? null;

  async function refresh() {
    setError(null);
    const detail = await loadReflection(props.reflectionRef);
    setReflection(detail);
    if (detail.currentModelExecutionRef) {
      setExecution(await loadModelInvocation(detail.currentModelExecutionRef));
    } else {
      setExecution(null);
    }
    return detail;
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([
      refresh(),
      loadCourseRuns().then(async (courses) => {
        const course = courses.items[0];
        if (!course) return [];
        const units = await loadCurriculumUnits(course.courseRunRef);
        const nested = await Promise.all(units.items.map((unit) => loadLessons(unit.unitRef)));
        return nested.flatMap((item) => item.items);
      })
    ])
      .then(([, loadedLessons]) => {
        if (active) setLessons(loadedLessons);
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // Reflection ref is the recovery boundary for the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.reflectionRef]);

  useEffect(() => {
    const content = reflection?.currentDraft?.content;
    if (content) setDraftContent(content);
  }, [reflection?.currentDraft?.reflectionRevisionRef]);

  useEffect(() => {
    if (!activeRevision || lessons.length === 0) return;
    const currentIndex = lessons.findIndex((item) => item.lessonRef === activeRevision.lessonRef);
    setTargetLessonRef((current) => current || lessons[currentIndex + 1]?.lessonRef || activeRevision.lessonRef);
  }, [activeRevision?.lessonRef, lessons]);

  useEffect(() => {
    if (!execution || terminalStatuses.has(execution.status)) return;
    let active = true;
    const timer = window.setInterval(() => {
      void refresh().catch((caught) => {
        if (active) setError(errorMessage(caught));
      });
    }, 900);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
    // Polling is driven by the persisted execution status, never component-only state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execution?.modelExecutionRef, execution?.status]);

  async function runGeneration() {
    if (!reflection?.currentDraft) return;
    setActing(true);
    setError(null);
    try {
      const result = await generateReflection(reflection.reflectionRef, {
        reflectionRef: reflection.reflectionRef,
        expectedDraftRevisionNumber: reflection.currentDraft.revisionNumber,
        teacherNotes,
        purpose: "lesson-reflection.generate",
        idempotencyKey: `ui:reflection:generate:${crypto.randomUUID()}`
      });
      setExecution(await loadModelInvocation(result.modelExecutionRef));
      props.onAction("Reflection AgentRun 已排队；模型在数据库事务外执行");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function saveDraft() {
    if (!reflection?.currentDraft || !draftContent) return;
    setActing(true);
    setError(null);
    try {
      const result = await updateReflectionDraft(reflection.reflectionRef, {
        expectedRevisionNumber: reflection.currentDraft.revisionNumber,
        content: draftContent,
        purpose: "lesson-reflection.update-draft",
        idempotencyKey: `ui:reflection:update:${crypto.randomUUID()}`
      });
      setReflection(result.reflection);
      props.onAction("教师修改已保存为新的 Reflection Draft Revision");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function confirmDraft() {
    if (!reflection?.currentDraft) return;
    setActing(true);
    setError(null);
    try {
      const result = await confirmReflection(reflection.reflectionRef, {
        expectedRevisionNumber: reflection.currentDraft.revisionNumber,
        purpose: "lesson-reflection.confirm",
        idempotencyKey: `ui:reflection:confirm:${crypto.randomUUID()}`
      });
      setReflection(result.reflection);
      props.onAction("课后反思已由教师确认；TeachingPlan 保持不可变");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function cancelExecution() {
    if (!execution || !cancellableStatuses.has(execution.status)) return;
    setActing(true);
    try {
      setExecution(await cancelModelInvocation(execution.modelExecutionRef, {
        expectedStatus: execution.status,
        purpose: "teacher-copilot.cancel-model",
        idempotencyKey: `ui:reflection:cancel:${crypto.randomUUID()}`
      }));
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function retryExecution() {
    if (!execution || !retryableStatuses.has(execution.status)) return;
    setActing(true);
    try {
      const result = await retryModelInvocation(execution.modelExecutionRef, {
        expectedStatus: execution.status as "timed_out" | "retryable_failed" | "permanently_failed" | "validation_failed" | "budget_exceeded" | "cancelled",
        purpose: "teacher-copilot.retry-model",
        idempotencyKey: `ui:reflection:retry:${crypto.randomUUID()}`
      });
      setExecution(result.execution);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function createFollowUp() {
    const confirmed = reflection?.currentConfirmed;
    if (!confirmed) return;
    setActing(true);
    setError(null);
    try {
      const base = {
        reflectionRevisionRef: confirmed.reflectionRevisionRef,
        purpose: "lesson-reflection.create-follow-up" as const,
        idempotencyKey: `ui:reflection:follow-up:${crypto.randomUUID()}`
      };
      const result = followUpType === "lesson_preparation"
        ? await createReflectionFollowUp(reflection.reflectionRef, {
            ...base,
            actionType: "lesson_preparation",
            targetLessonRef,
            priority: "normal",
            dueAt: null
          })
        : followUpType === "assignment_draft"
          ? await createReflectionFollowUp(reflection.reflectionRef, {
              ...base,
              actionType: "assignment_draft",
              targetLessonRef,
              title: followUpTitle,
              instructions: "依据教师确认的课后反思创建补充练习草稿；发布前需教师审核。",
              dueAt: null,
              items: [{
                sequence: 1,
                itemType: "short_answer",
                prompt: "请用自己的语言说明本课时最需要继续巩固的概念。",
                maxScore: 5,
                options: [],
                answerKey: { referenceAnswer: "答案需由教师结合本课时目标审核。" },
                gradingCriteria: "概念表述清楚，并能说明依据。",
                objectiveRef: targetLesson?.learningObjectives[0]?.objectiveRef ?? sourceLesson?.learningObjectives[0]?.objectiveRef ?? confirmed.lessonRef
              }]
            })
          : await createReflectionFollowUp(reflection.reflectionRef, {
              ...base,
              actionType: "teacher_todo",
              title: followUpTitle,
              description: "来源于教师已确认的课后反思；需教师显式完成。",
              priority: "normal",
              dueAt: null
            });
      props.onAction("后续行动已显式创建，并保留 Reflection 来源关系");
      await refresh();
      if (result.actionType === "lesson_preparation") props.navigatePreparation(result.targetRef, "/agent");
      else if (result.actionType === "assignment_draft") props.navigate("/assignments");
      else props.navigate("/schedule");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  const editableFields = useMemo(() => draftContent ? [
    ["objectiveAttainment", "目标达成情况", draftContent.objectiveAttainment],
    ["plannedVsImplemented", "计划与实际差异", draftContent.plannedVsImplemented],
    ["teacherNotes", "教师补充说明", draftContent.teacherNotes]
  ] as const : [], [draftContent]);

  return (
    <div className="portal-page reflection-agent-page" data-testid="reflection-agent-page">
      <PageHeader
        title="课后反思"
        subtitle="Agent 只整理教师明确授权的已确认事实；输出始终是 Draft，最终确认权属于教师"
        actions={<Button onClick={() => activeRevision ? props.navigateLesson(activeRevision.lessonRef) : props.navigate("/teaching")}>返回课时</Button>}
      />
      {error ? <Alert type="error" showIcon title="课后反思流程未能继续" description={error} closable onClose={() => setError(null)} /> : null}
      <Spin spinning={loading}>
        {reflection && activeRevision ? (
          <div className="reflection-agent-layout">
            <Card className="workspace-card" variant="borderless" title="已封存的反思范围" data-testid="reflection-context">
              <Space wrap>
                <Tag>Lesson {activeRevision.lessonRef}</Tag>
                <Tag>TeachingPlan {activeRevision.teachingPlanRevisionRef}</Tag>
                <Tag>Delivery {activeRevision.deliveryRevisionRef}</Tag>
              </Space>
              <Paragraph>教师确认观察：{activeRevision.observationRevisionRefs.length} 项</Paragraph>
              <Paragraph>教师选择 Assignment Evidence：{activeRevision.assignmentEvidenceRefs.length} 项</Paragraph>
              <Paragraph type="secondary">未选择的课堂观察、提交和 Evidence 不进入本次 Agent 上下文。</Paragraph>
              {execution ? (
                <>
                  <Divider />
                  <Space wrap>
                    <Tag color={execution.status === "succeeded" ? "success" : "processing"}>{modelExecutionStatusLabel(execution.status)}</Tag>
                    <Tag>{execution.provider === "volcengine-ark" ? "Volcengine Ark" : "Mock Provider"}</Tag>
                    <Tag>PromptBundle v{execution.promptBundleVersion}</Tag>
                  </Space>
                  <Paragraph>ContextManifest：{execution.contextManifestRef}</Paragraph>
                  <Paragraph>AuthorizedContextPlan：{execution.authorizedContextPlanRef}</Paragraph>
                  <Paragraph>Token：{execution.totalTokens ?? "—"} · 延迟：{execution.latencyMs ?? "—"} ms · Attempt {execution.attemptCount}/{execution.maxAttempts}</Paragraph>
                  {execution.safeMessage ? <Alert type="warning" showIcon title={execution.safeMessage} description={execution.safeErrorCategory ?? undefined} /> : null}
                  <Space wrap>
                    {cancellableStatuses.has(execution.status) ? <Button danger loading={acting} onClick={() => void cancelExecution()}>取消生成</Button> : null}
                    {retryableStatuses.has(execution.status) ? <Button loading={acting} onClick={() => void retryExecution()}>人工重试</Button> : null}
                  </Space>
                </>
              ) : null}
            </Card>

            <Card className="workspace-card" variant="borderless" title="Reflection Draft" data-testid="reflection-draft-editor">
              {reflection.currentConfirmed ? (
                <Alert type="success" showIcon title="教师已确认正式 Reflection" description={`Revision ${reflection.currentConfirmed.revisionNumber}；确认没有修改 approved TeachingPlan。`} />
              ) : (
                <>
                  <label>本次给 Agent 的补充说明<Input.TextArea rows={3} value={teacherNotes} onChange={(event) => setTeacherNotes(event.target.value)} placeholder="只补充本节课真实情况，不添加未授权学生数据" /></label>
                  <Space wrap>
                    <Button type="primary" loading={acting || reflection.generationStatus === "generating"} disabled={reflection.generationStatus === "generating"} onClick={() => void runGeneration()} data-testid="generate-reflection">
                      {reflection.generationStatus === "generating" ? "正在生成与验证" : "让 Agent 生成反思草稿"}
                    </Button>
                    <Text type="secondary">现有教师草稿不会被直接确认为正式事实。</Text>
                  </Space>
                </>
              )}

              {reflection.currentDraft && draftContent ? (
                <>
                  <Divider />
                  <Space wrap><Tag color="processing">Draft Revision {reflection.currentDraft.revisionNumber}</Tag><Tag>{reflection.currentDraft.sourceAgentRunRef ? "Agent 辅助草稿" : "教师初始草稿"}</Tag></Space>
                  {editableFields.map(([field, label, value]) => (
                    <label key={field}>{label}<Input.TextArea rows={3} value={value} onChange={(event) => setDraftContent((current) => current ? { ...current, [field]: event.target.value } : current)} /></label>
                  ))}
                  {([
                    ["effectiveMoves", "有效教学环节"],
                    ["ineffectiveMoves", "未达预期环节"],
                    ["observationSummary", "课堂观察摘要"],
                    ["evidenceAlignment", "与作业 Evidence 的一致或冲突"],
                    ["uncertainties", "尚不确定的问题"],
                    ["nextLessonSuggestions", "下一课建议"],
                    ["assignmentSuggestions", "后续练习建议"]
                  ] as const).map(([field, label]) => (
                    <label key={field}>{label}<Input.TextArea rows={3} value={lines(draftContent[field])} onChange={(event) => setDraftContent((current) => current ? { ...current, [field]: splitLines(event.target.value) } : current)} /></label>
                  ))}
                  <Space wrap>
                    <Button loading={acting} onClick={() => void saveDraft()} data-testid="save-reflection-draft">保存教师修改</Button>
                    <Popconfirm title="确认这份课后反思？" description="确认后不可原地覆盖，也不会自动修改 TeachingPlan 或创建后续任务。" onConfirm={() => void confirmDraft()}>
                      <Button type="primary" loading={acting} data-testid="confirm-reflection">教师确认 Reflection</Button>
                    </Popconfirm>
                  </Space>
                </>
              ) : null}
            </Card>

            {reflection.currentConfirmed ? (
              <Card className="workspace-card" variant="borderless" title="显式创建后续行动" data-testid="reflection-follow-ups">
                <Paragraph type="secondary">确认 Reflection 本身不会自动创建任务。请选择一种后续行动。</Paragraph>
                <Space wrap align="start">
                  <Select value={followUpType} onChange={setFollowUpType} options={[
                    { value: "lesson_preparation", label: "调整下一课" },
                    { value: "assignment_draft", label: "补充练习草稿" },
                    { value: "teacher_todo", label: "个人 Todo" }
                  ]} />
                  {followUpType !== "teacher_todo" ? <Select<string> value={targetLessonRef || null} placeholder="选择目标课时" style={{ minWidth: 220 }} onChange={setTargetLessonRef} options={lessons.map((lesson) => ({ value: lesson.lessonRef, label: `${lesson.sequence}. ${lesson.title}` }))} /> : null}
                  {followUpType !== "lesson_preparation" ? <Input value={followUpTitle} onChange={(event) => setFollowUpTitle(event.target.value)} placeholder="后续行动标题" /> : null}
                  <Button type="primary" loading={acting} disabled={followUpType !== "teacher_todo" && !targetLessonRef} onClick={() => void createFollowUp()} data-testid="create-reflection-follow-up">创建后续行动</Button>
                </Space>
                {reflection.followUps.length > 0 ? (
                  <div className="reflection-follow-up-list">
                    {reflection.followUps.map((item) => <Paragraph key={item.followUpRef}><Tag>{item.actionType}</Tag>{item.targetStatus} · {item.targetRef}</Paragraph>)}
                  </div>
                ) : null}
              </Card>
            ) : null}
          </div>
        ) : null}
      </Spin>
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}
