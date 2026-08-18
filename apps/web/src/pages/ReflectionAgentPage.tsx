import { useEffect, useMemo, useState } from "react";

import type {
  LessonView,
  ModelExecutionView,
  NextLessonActionCandidate,
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
  acceptNextLessonAction,
  confirmReflection,
  generateNextLessonActions,
  generateReflection,
  loadCourseRuns,
  loadCurriculumUnits,
  loadLessons,
  loadModelInvocation,
  loadNextLessonActions,
  loadReflection,
  rejectNextLessonAction,
  retryModelInvocation,
  updateNextLessonAction,
  updateReflectionDraft
} from "../api";
import { PageHeader } from "../components/portal/PortalPrimitives";
import { modelExecutionStatusLabel } from "../presentation";
import type { AppRoute } from "../route";

const { Paragraph, Text } = Typography;

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
  const [targetLessonRef, setTargetLessonRef] = useState("");
  const [nextActions, setNextActions] = useState<NextLessonActionCandidate[]>([]);
  const [nextActionAdjustment, setNextActionAdjustment] = useState("");
  const [editingCandidateRef, setEditingCandidateRef] = useState<string | null>(null);
  const [candidateTitle, setCandidateTitle] = useState("");
  const [candidateReason, setCandidateReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeRevision = reflection?.currentDraft ?? reflection?.currentConfirmed ?? null;
  const targetLessonOptions = lessons
    .filter((item) => item.lessonRef !== activeRevision?.lessonRef)
    .map((lesson) => ({
      value: lesson.lessonRef,
      label: `${lesson.sequence}. ${lesson.title}`
    }));

  async function refresh() {
    setError(null);
    const detail = await loadReflection(props.reflectionRef);
    setReflection(detail);
    setNextActions(
      detail.currentConfirmed
        ? (await loadNextLessonActions(props.reflectionRef)).items
        : []
    );
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
    setTargetLessonRef((current) => {
      if (current && current !== activeRevision.lessonRef) return current;
      return lessons[currentIndex + 1]?.lessonRef ?? "";
    });
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
      props.onAction("反思草稿生成任务已开始，可离开页面后再返回查看");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function saveDraft(contentOverride?: ReflectionContent) {
    const content = contentOverride ?? draftContent;
    if (!reflection?.currentDraft || !content) return;
    setActing(true);
    setError(null);
    try {
      const result = await updateReflectionDraft(reflection.reflectionRef, {
        expectedRevisionNumber: reflection.currentDraft.revisionNumber,
        content,
        purpose: "lesson-reflection.update-draft",
        idempotencyKey: `ui:reflection:update:${crypto.randomUUID()}`
      });
      setReflection(result.reflection);
      props.onAction("教师修改已保存为新的课后反思草稿版本");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function markDraftUncertain() {
    if (!draftContent) return;
    const uncertainty = teacherNotes.trim() || "教师暂不确认当前解释，需要补充证据后再判断。";
    const nextContent: ReflectionContent = {
      ...draftContent,
      uncertainties: [...new Set([...draftContent.uncertainties, uncertainty])]
    };
    setDraftContent(nextContent);
    await saveDraft(nextContent);
    props.onAction("已保留为不确定项；本次反思尚未确认，也没有创建后续行动");
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
      props.onAction("课后反思已由教师确认；原教学计划保持不变");
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

  async function generateActions() {
    const confirmed = reflection?.currentConfirmed;
    if (!confirmed || !targetLessonRef) return;
    setActing(true);
    setError(null);
    try {
      const result = await generateNextLessonActions(reflection.reflectionRef, {
        reflectionRevisionRef: confirmed.reflectionRevisionRef,
        targetLessonRef,
        teacherAdjustment: nextActionAdjustment.trim() || null,
        purpose: "next-lesson-adjustment.generate",
        idempotencyKey: `ui:next-lesson-actions:generate:${crypto.randomUUID()}`
      });
      setNextActions(result.items);
      props.onAction("下一课优化建议已生成，尚未创建任何正式任务");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  function beginCandidateEdit(candidate: NextLessonActionCandidate) {
    setEditingCandidateRef(candidate.candidateRef);
    setCandidateTitle(candidate.title);
    setCandidateReason(candidate.reason);
  }

  async function saveCandidate(candidate: NextLessonActionCandidate) {
    setActing(true);
    setError(null);
    try {
      const result = await updateNextLessonAction(candidate.candidateRef, {
        expectedVersion: candidate.version,
        title: candidateTitle,
        reason: candidateReason,
        targetLessonRef:
          candidate.candidateType === "create_teacher_todo"
            ? null
            : targetLessonRef || candidate.targetLessonRef,
        teacherNote: nextActionAdjustment.trim() || candidate.teacherNote,
        purpose: "next-lesson-adjustment.update",
        idempotencyKey: `ui:next-lesson-actions:update:${crypto.randomUUID()}`
      });
      setNextActions((current) => current.map((item) =>
        item.candidateRef === result.candidate.candidateRef
          ? result.candidate
          : item
      ));
      setEditingCandidateRef(null);
      props.onAction("优化建议已保存为新版本，Reflection 未被修改");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function rejectCandidate(candidate: NextLessonActionCandidate) {
    setActing(true);
    setError(null);
    try {
      const result = await rejectNextLessonAction(candidate.candidateRef, {
        expectedVersion: candidate.version,
        reason: nextActionAdjustment.trim() || null,
        purpose: "next-lesson-adjustment.reject",
        idempotencyKey: `ui:next-lesson-actions:reject:${crypto.randomUUID()}`
      });
      setNextActions((current) => current.map((item) =>
        item.candidateRef === result.candidate.candidateRef
          ? result.candidate
          : item
      ));
      props.onAction("已拒绝该建议，没有创建或修改任何教学事实");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function acceptCandidate(candidate: NextLessonActionCandidate) {
    setActing(true);
    setError(null);
    try {
      const result = await acceptNextLessonAction(candidate.candidateRef, {
        expectedVersion: candidate.version,
        purpose: "next-lesson-adjustment.accept",
        idempotencyKey: `ui:next-lesson-actions:accept:${crypto.randomUUID()}`
      });
      setNextActions((current) => current.map((item) =>
        item.candidateRef === result.candidate.candidateRef
          ? result.candidate
          : item
      ));
      props.onAction("已按教师决定创建正式后续对象，并保留完整来源关系");
      if (candidate.candidateType === "adjust_next_lesson_focus" && result.candidate.targetRef) {
        props.navigatePreparation(result.candidate.targetRef, "/agent");
      } else if (candidate.candidateType === "create_practice_task") {
        props.navigate("/assignments");
      } else {
        props.navigate("/schedule");
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  const actionCandidates = useMemo(
    () => buildActionCandidates(draftContent ?? activeRevision?.content ?? null),
    [activeRevision?.reflectionRevisionRef, draftContent]
  );

  return (
    <div className="portal-page reflection-agent-page" data-testid="reflection-agent-page">
      <PageHeader
        title="课后反思"
        subtitle="助手只整理教师明确选择的课堂事实；草稿仍需教师修改和确认"
        actions={<Button onClick={() => activeRevision ? props.navigateLesson(activeRevision.lessonRef) : props.navigate("/teaching")}>返回课时</Button>}
      />
      {error ? <Alert type="error" showIcon title="课后反思流程未能继续" description={error} closable onClose={() => setError(null)} /> : null}
      <Spin spinning={loading}>
        {reflection && activeRevision ? (
          <div className="reflection-agent-layout">
            <Card className="workspace-card" variant="borderless" title="已封存的反思范围" data-testid="reflection-context">
              <Space wrap>
                <Tag>当前课时</Tag>
                <Tag>已批准教学计划</Tag>
                <Tag>已确认课堂实施</Tag>
              </Space>
              <Paragraph>教师确认观察：{activeRevision.observationRevisionRefs.length} 项</Paragraph>
              <Paragraph>教师选择作业证据：{activeRevision.assignmentEvidenceRefs.length} 项</Paragraph>
              <Paragraph type="secondary">未选择的课堂观察、提交和学习证据不会用于本次反思。</Paragraph>
              {execution ? (
                <>
                  <Divider />
                  <Space wrap>
                    <Tag color={execution.status === "succeeded" ? "success" : "processing"}>{modelExecutionStatusLabel(execution.status)}</Tag>
                    <Tag>{execution.provider === "volcengine-ark" ? "豆包助手" : "助手"}</Tag>
                    <Tag>反思模板第 {execution.promptBundleVersion} 版</Tag>
                  </Space>
                  <Paragraph>本次授权范围已封存，可在运行记录中查看技术详情。</Paragraph>
                  {execution.safeMessage ? <Alert type="warning" showIcon title={execution.safeMessage} description={execution.safeErrorCategory ?? undefined} /> : null}
                  <Space wrap>
                    {cancellableStatuses.has(execution.status) ? <Button danger loading={acting} onClick={() => void cancelExecution()}>取消生成</Button> : null}
                    {retryableStatuses.has(execution.status) ? <Button loading={acting} onClick={() => void retryExecution()}>人工重试</Button> : null}
                  </Space>
                </>
              ) : null}
            </Card>

            <Card className="workspace-card" variant="borderless" title="课后反思草稿" data-testid="reflection-draft-editor">
              {reflection.currentConfirmed ? (
                <Alert type="success" showIcon title="课后反思已完成" />
              ) : (
                <div className="reflection-adjustment ai-task-composer">
                  <label>告诉 Agent 需要关注什么<Input.TextArea className="ai-task-input" id="reflection-adjustment-input" autoSize={{ minRows: 1, maxRows: 5 }} value={teacherNotes} onChange={(event) => setTeacherNotes(event.target.value)} placeholder="例如：学生对概念基本掌握，但应用题迁移仍不稳定" /></label>
                  <Space wrap>
                    <Button type="primary" loading={acting || reflection.generationStatus === "generating"} disabled={reflection.generationStatus === "generating"} onClick={() => void runGeneration()} data-testid="generate-reflection">
                      {reflection.generationStatus === "generating" ? "正在整理本节课" : reflection.currentDraft?.sourceAgentRunRef ? "按这句话重新整理" : "生成本节课复盘"}
                    </Button>
                    <Text type="secondary">只会生成新草稿，不会确认事实或创建后续行动。</Text>
                  </Space>
                </div>
              )}

              {reflection.currentDraft && draftContent ? (
                <>
                  <Divider />
                  <Space wrap><Tag color="processing">草稿第 {reflection.currentDraft.revisionNumber} 版</Tag><Tag>{reflection.currentDraft.sourceAgentRunRef ? "助手整理" : "教师创建"}</Tag><Tag>等待教师判断</Tag></Space>

                  <div className="reflection-review-grid">
                    <section className="reflection-review-section reflection-review-section--facts" data-testid="reflection-facts">
                      <header><span>01</span><div><h3>发生了什么</h3><small>仅整理已确认课堂记录、观察和已选择 Evidence</small></div></header>
                      <p>{draftContent.plannedVsImplemented}</p>
                      {draftContent.observationSummary.length > 0 ? <ul>{draftContent.observationSummary.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="reflection-empty-copy">本次没有选择课堂观察。</p>}
                      <small>依据：已确认课堂记录 · {reflection.currentDraft.observationRevisionRefs.length} 条教师确认观察 · {reflection.currentDraft.assignmentEvidenceRefs.length} 条教师选择的作业证据</small>
                    </section>

                    <section className="reflection-review-section reflection-review-section--meaning" data-testid="reflection-interpretation">
                      <header><span>02</span><div><h3>这意味着什么</h3><small>以下是助手的解释，不是新增课堂事实</small></div></header>
                      <p>{draftContent.objectiveAttainment}</p>
                      {[...draftContent.effectiveMoves, ...draftContent.ineffectiveMoves, ...draftContent.evidenceAlignment].length > 0 ? <ul>{[...draftContent.effectiveMoves, ...draftContent.ineffectiveMoves, ...draftContent.evidenceAlignment].map((item) => <li key={item}>{item}</li>)}</ul> : null}
                      {draftContent.uncertainties.length > 0 ? <div className="reflection-uncertainties"><strong>仍不确定</strong>{draftContent.uncertainties.map((item) => <p key={item}>{item}</p>)}</div> : null}
                    </section>

                    <section className="reflection-review-section reflection-review-section--next" data-testid="reflection-action-candidates">
                      <header><span>03</span><div><h3>下一步可以做什么</h3><small>候选尚未执行，确认反思后仍需逐项选择</small></div></header>
                      {actionCandidates.length > 0 ? <ul>{actionCandidates.map((candidate) => <li key={candidate.actionType}><strong>{candidate.title}</strong><span>{candidate.rationale}</span></li>)}</ul> : <p className="reflection-empty-copy">当前没有足够依据生成后续行动候选。</p>}
                    </section>
                  </div>

                  <div className="reflection-decision-bar" data-testid="reflection-teacher-decision">
                    <div><strong>请判断这份复盘</strong><small>只有“准确”会确认课后反思；其余操作都保留草稿状态。</small></div>
                    <Space wrap>
                      <Popconfirm title="确认事实与复盘准确？" description="确认后不可原地覆盖，也不会自动修改教学计划或创建后续任务。" onConfirm={() => void confirmDraft()}>
                        <Button type="primary" loading={acting} data-testid="confirm-reflection">准确，确认反思</Button>
                      </Popconfirm>
                      <Button onClick={() => document.getElementById("reflection-adjustment-input")?.focus()} data-testid="adjust-reflection">需要调整</Button>
                      <Button loading={acting} onClick={() => void markDraftUncertain()} data-testid="mark-reflection-uncertain">暂不确定</Button>
                    </Space>
                  </div>

                  <details className="reflection-advanced-editor">
                    <summary>精细修改草稿内容</summary>
                    <div>
                      <label>目标达成情况<Input.TextArea rows={3} value={draftContent.objectiveAttainment} onChange={(event) => setDraftContent((current) => current ? { ...current, objectiveAttainment: event.target.value } : current)} /></label>
                      <label>计划与实际差异<Input.TextArea rows={3} value={draftContent.plannedVsImplemented} onChange={(event) => setDraftContent((current) => current ? { ...current, plannedVsImplemented: event.target.value } : current)} /></label>
                      <label>教师补充说明<Input.TextArea rows={3} value={draftContent.teacherNotes} onChange={(event) => setDraftContent((current) => current ? { ...current, teacherNotes: event.target.value } : current)} /></label>
                      {([
                        ["effectiveMoves", "有效教学环节"],
                        ["ineffectiveMoves", "未达预期环节"],
                        ["observationSummary", "课堂观察摘要"],
                        ["evidenceAlignment", "与作业证据的一致或冲突"],
                        ["uncertainties", "尚不确定的问题"],
                        ["nextLessonSuggestions", "下一课建议"],
                        ["assignmentSuggestions", "后续练习建议"]
                      ] as const).map(([field, label]) => (
                        <label key={field}>{label}<Input.TextArea rows={3} value={lines(draftContent[field])} onChange={(event) => setDraftContent((current) => current ? { ...current, [field]: splitLines(event.target.value) } : current)} /></label>
                      ))}
                      <Button loading={acting} onClick={() => void saveDraft()} data-testid="save-reflection-draft">保存教师修改</Button>
                    </div>
                  </details>
                </>
              ) : null}
            </Card>

            {reflection.currentConfirmed ? (
              <Card className="workspace-card reflection-follow-up-card" variant="borderless" title="下一课" data-testid="reflection-follow-ups">
                <label className="reflection-target-lesson">目标课时<Select<string> value={targetLessonRef || null} placeholder="选择下一课" onChange={setTargetLessonRef} options={targetLessonOptions} /></label>
                <label className="ai-task-composer">补充要求（可选）<Input.TextArea className="ai-task-input" autoSize={{ minRows: 1, maxRows: 5 }} value={nextActionAdjustment} onChange={(event) => setNextActionAdjustment(event.target.value)} placeholder="例如：下一课减少讨论，先用两个基础例题巩固" /></label>
                <Space wrap>
                  <Button type="primary" loading={acting} disabled={!targetLessonRef} onClick={() => void generateActions()} data-testid="generate-next-lesson-actions">
                    {nextActions.length > 0 ? "重新生成优化建议" : "生成下一课优化建议"}
                  </Button>
                  <Text type="secondary">使用 next-lesson-adjustment@1；实际来源已封存。</Text>
                </Space>
                <div className="reflection-follow-up-candidates">
                  {nextActions.map((candidate) => (
                    <article key={candidate.candidateRef} data-testid="next-lesson-action-candidate">
                      <Space wrap>
                        <Tag>{nextActionTypeLabel(candidate.candidateType)}</Tag>
                        <Tag color={candidate.status === "accepted" ? "success" : candidate.status === "rejected" ? "default" : "processing"}>{nextActionStatusLabel(candidate.status)}</Tag>
                        <Tag>{candidate.confidence === "high" ? "依据较充分" : candidate.confidence === "medium" ? "建议复核" : "信息有限"}</Tag>
                      </Space>
                      {editingCandidateRef === candidate.candidateRef ? (
                        <div className="reflection-candidate-editor">
                          <Input value={candidateTitle} onChange={(event) => setCandidateTitle(event.target.value)} />
                          <Input.TextArea rows={3} value={candidateReason} onChange={(event) => setCandidateReason(event.target.value)} />
                          <Space wrap>
                            <Button type="primary" loading={acting} onClick={() => void saveCandidate(candidate)}>保存修改</Button>
                            <Button onClick={() => setEditingCandidateRef(null)}>取消</Button>
                          </Space>
                        </div>
                      ) : (
                        <>
                          <strong>{candidate.title}</strong>
                          <p>{candidate.reason}</p>
                        </>
                      )}
                      {candidate.status === "candidate" && editingCandidateRef !== candidate.candidateRef ? (
                        <Space wrap>
                          <Popconfirm title="接受并创建正式后续对象？" description="只有确认后才会创建备课任务、练习草稿或个人待办。" onConfirm={() => void acceptCandidate(candidate)}>
                            <Button type={candidate.candidateType === "adjust_next_lesson_focus" ? "primary" : "default"} loading={acting} data-testid={candidate.candidateType === "adjust_next_lesson_focus" ? "accept-next-lesson-action" : undefined}>接受</Button>
                          </Popconfirm>
                          <Button onClick={() => beginCandidateEdit(candidate)}>修改</Button>
                          <Popconfirm title="拒绝这条建议？" description="拒绝会保留历史，但不会创建任何对象。" onConfirm={() => void rejectCandidate(candidate)}>
                            <Button>拒绝</Button>
                          </Popconfirm>
                        </Space>
                      ) : null}
                      {candidate.status === "accepted" && candidate.deepLink ? <Text type="secondary">已创建：{candidate.deepLink}</Text> : null}
                    </article>
                  ))}
                  {nextActions.length === 0 ? <Paragraph type="secondary">尚未生成下一课优化建议。</Paragraph> : null}
                </div>
                {reflection.followUps.length > 0 ? (
                  <div className="reflection-follow-up-list">
                    {reflection.followUps.map((item) => <Paragraph key={item.followUpRef}><Tag>{followUpTypeLabel(item.actionType)}</Tag>{followUpStatusLabel(item.targetStatus)}</Paragraph>)}
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

function followUpTypeLabel(actionType: string): string {
  return {
    lesson_preparation: "调整下一课",
    assignment_draft: "补充练习草稿",
    teacher_todo: "个人待办"
  }[actionType] ?? "后续行动";
}

function followUpStatusLabel(status: string): string {
  return {
    active: "待处理",
    planned: "待开始",
    draft: "草稿",
    completed: "已完成",
    cancelled: "已取消"
  }[status] ?? "已创建";
}

function nextActionTypeLabel(actionType: NextLessonActionCandidate["candidateType"]): string {
  return {
    adjust_next_lesson_focus: "调整下一课",
    create_practice_task: "补充练习",
    create_teacher_todo: "教师待办",
    review_student_issue: "复查学习现象"
  }[actionType];
}

function nextActionStatusLabel(status: NextLessonActionCandidate["status"]): string {
  return {
    candidate: "等待教师决定",
    accepted: "已接受",
    rejected: "已拒绝",
    expired: "已过期"
  }[status];
}

function buildActionCandidates(content: ReflectionContent | null): Array<{
  actionType: "lesson_preparation" | "assignment_draft" | "teacher_todo";
  title: string;
  rationale: string;
}> {
  if (!content) return [];
  const candidates: Array<{
    actionType: "lesson_preparation" | "assignment_draft" | "teacher_todo";
    title: string;
    rationale: string;
  }> = [];
  if (content.nextLessonSuggestions.length > 0) {
    candidates.push({
      actionType: "lesson_preparation",
      title: "调整下一课教学重点",
      rationale: content.nextLessonSuggestions.join("；")
    });
  }
  if (content.assignmentSuggestions.length > 0) {
    candidates.push({
      actionType: "assignment_draft",
      title: "生成补充练习草稿",
      rationale: content.assignmentSuggestions.join("；")
    });
  }
  if (content.uncertainties.length > 0) {
    candidates.push({
      actionType: "teacher_todo",
      title: "复核仍不确定的问题",
      rationale: content.uncertainties.join("；")
    });
  }
  return candidates.slice(0, 3);
}
