import { useEffect, useMemo, useState } from "react";

import type {
  ClassroomFeedbackObservationCandidate,
  ClassroomObservationRevision,
  DeliveryStepInput,
  LessonImplementationSummary,
  LessonTeachingPlanState,
  LessonView,
  ReflectionContent
} from "@edu-agent/contracts";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Typography
} from "antd";

import {
  amendLessonDelivery,
  confirmClassroomObservation,
  confirmLessonDelivery,
  createClassroomObservation,
  createLessonDelivery,
  createReflectionDraft,
  loadAssignmentAnalytics,
  loadClassroomObservation,
  loadLessonImplementationSummary,
  supersedeClassroomObservation,
  updateLessonDeliveryDraft
} from "../../api";
import { QuickClassroomFeedback } from "./QuickClassroomFeedback";
import { StatusPill } from "./PortalPrimitives";

const { Paragraph } = Typography;

type DeliveryForm = {
  actualStartAt: string;
  actualEndAt: string;
  paceNotes: string;
  unresolvedQuestions: string;
  followUpNotes: string;
  steps: DeliveryStepInput[];
};

type ObservationForm = {
  scope: ClassroomObservationRevision["scope"];
  scopeRef: string;
  observationType: ClassroomObservationRevision["observationType"];
  content: string;
  observedAt: string;
};

const dispositionLabels: Record<DeliveryStepInput["disposition"], string> = {
  adopted: "按计划采用",
  adjusted: "现场调整",
  skipped: "本节跳过",
  added: "临时新增"
};

const observationTypeLabels: Record<ClassroomObservationRevision["observationType"], string> = {
  achievement: "目标达成",
  confusion: "理解混淆",
  timing: "课堂节奏",
  engagement: "参与情况",
  activity_effectiveness: "活动效果",
  unresolved: "尚未解决"
};

function localDateTime(value: string | null | undefined): string {
  const date = value ? new Date(value) : new Date();
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

function toIso(value: string): string {
  return new Date(value).toISOString();
}

function defaultDeliveryForm(
  lesson: LessonView,
  planState: LessonTeachingPlanState
): DeliveryForm {
  const plan = planState.currentApproved?.content;
  const start = lesson.plannedAt ? new Date(lesson.plannedAt) : new Date();
  const end = new Date(start.getTime() + lesson.durationMinutes * 60_000);
  const plannedSteps = [
    ["opening", "课堂导入", plan?.openingActivity ?? "按老师确认的教学方案完成课堂导入。"],
    ["learning", "核心学习活动", plan?.studentActivity ?? "组织本课时核心学习活动。"],
    ["check", "独立检查", plan?.independentCheck ?? "完成课堂检查并记录未解决问题。"]
  ] as const;
  return {
    actualStartAt: localDateTime(start.toISOString()),
    actualEndAt: localDateTime(end.toISOString()),
    paceNotes: "",
    unresolvedQuestions: "",
    followUpNotes: "",
    steps: plannedSteps.map(([stepKey, title, description], index) => ({
      stepKey,
      sequence: index + 1,
      title,
      plannedDescription: description,
      actualDescription: description,
      disposition: "adopted" as const,
      rationale: ""
    }))
  };
}

function formFromRevision(
  revision: NonNullable<LessonImplementationSummary["currentDelivery"]>
): DeliveryForm {
  return {
    actualStartAt: localDateTime(revision.actualStartAt),
    actualEndAt: localDateTime(revision.actualEndAt),
    paceNotes: revision.paceNotes,
    unresolvedQuestions: revision.unresolvedQuestions.join("\n"),
    followUpNotes: revision.followUpNotes,
    steps: revision.steps
  };
}

function splitLines(value: string): string[] {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function initialReflectionContent(
  summary: LessonImplementationSummary,
  teacherNotes = ""
): ReflectionContent {
  const delivery = summary.currentDelivery!;
  const effective = delivery.steps
    .filter((step) => step.disposition === "adopted" || step.disposition === "adjusted")
    .map((step) => `${step.title}：${step.actualDescription}`);
  const ineffective = delivery.steps
    .filter((step) => step.disposition === "skipped")
    .map((step) => `${step.title}：本节跳过${step.rationale ? `（${step.rationale}）` : ""}`);
  return {
    objectiveAttainment: "请结合教师已确认的课堂观察，判断本节课目标达成情况。",
    plannedVsImplemented: delivery.steps
      .map((step) => `${step.title}：${dispositionLabels[step.disposition]}`)
      .join("；"),
    effectiveMoves: effective.length > 0 ? effective : ["待教师补充有效教学环节。"],
    ineffectiveMoves: ineffective.length > 0 ? ineffective : ["当前未确认未达预期的教学环节。"],
    observationSummary: summary.observations.length > 0
      ? summary.observations.map((item) => item.content)
      : ["当前尚未选择教师确认的课堂观察。"],
    evidenceAlignment: ["需与教师明确选择的作业证据对照。"],
    uncertainties: ["未被课堂观察或作业证据支持的判断仍保持未知。"],
    nextLessonSuggestions: ["根据本节课实施差异和证据缺口调整下一课。"],
    assignmentSuggestions: ["由教师决定是否创建补充练习草稿。"],
    teacherNotes
  };
}

export function ClassroomReflectionPanel(props: {
  lesson: LessonView;
  courseRunRef: string;
  planState: LessonTeachingPlanState;
  assignmentRefs: string[];
  navigateReflection: (reflectionRef: string) => void;
  onAction: (message: string) => void;
}) {
  const [summary, setSummary] = useState<LessonImplementationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<"create" | "edit" | "amend">("create");
  const [deliveryForm, setDeliveryForm] = useState<DeliveryForm>(() =>
    defaultDeliveryForm(props.lesson, props.planState)
  );
  const [observationOpen, setObservationOpen] = useState(false);
  const [observationToAmend, setObservationToAmend] = useState<ClassroomObservationRevision | null>(null);
  const [observationForm, setObservationForm] = useState<ObservationForm>({
    scope: "class",
    scopeRef: "",
    observationType: "achievement",
    content: "",
    observedAt: localDateTime(new Date().toISOString())
  });
  const [selectedObservationRefs, setSelectedObservationRefs] = useState<string[]>([]);
  const [selectedEvidenceRefs, setSelectedEvidenceRefs] = useState<string[]>([]);
  const [evidenceOptions, setEvidenceOptions] = useState<Array<{ label: string; value: string }>>([]);

  const delivery = summary?.delivery ?? null;
  const currentDraft = delivery?.currentDraft ?? null;
  const currentConfirmed = summary?.currentDelivery ?? null;
  const confirmedObservations = useMemo(
    () => summary?.observations.filter((item) => item.status === "confirmed") ?? [],
    [summary]
  );

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const next = await loadLessonImplementationSummary(props.lesson.lessonRef);
      setSummary(next);
      setSelectedObservationRefs((current) => {
        const available = next.observations
          .filter((item) => item.status === "confirmed")
          .map((item) => item.observationRevisionRef);
        return current.length > 0
          ? current.filter((item) => available.includes(item))
          : available;
      });
      const analytics = await Promise.allSettled(
        props.assignmentRefs.map((assignmentRef) => loadAssignmentAnalytics(assignmentRef))
      );
      const options = new Map<string, string>();
      for (const result of analytics) {
        if (result.status !== "fulfilled") continue;
        for (const commonError of result.value.commonErrors) {
          for (const evidenceRef of commonError.evidenceRefs) {
            options.set(evidenceRef, `共性错误：${commonError.summary}`);
          }
        }
        for (const item of result.value.itemPerformance) {
          for (const evidenceRef of item.evidenceRefs) {
            if (!options.has(evidenceRef)) options.set(evidenceRef, `题目 ${item.sequence}：${item.prompt}`);
          }
        }
      }
      setEvidenceOptions(Array.from(options, ([value, label]) => ({ value, label })));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // The selected Lesson is the aggregate boundary for this panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.lesson.lessonRef]);

  function openDelivery(mode: "create" | "edit" | "amend") {
    const revision = mode === "edit" ? currentDraft : mode === "amend" ? currentConfirmed : null;
    setDeliveryMode(mode);
    setDeliveryForm(revision ? formFromRevision(revision) : defaultDeliveryForm(props.lesson, props.planState));
    setDeliveryOpen(true);
  }

  async function saveDelivery() {
    const approved = props.planState.currentApproved;
    if (!approved) {
      setError("请先确认本课教学方案，再记录课堂实施。");
      return;
    }
    if (deliveryForm.steps.some((step) => !step.actualDescription.trim())) {
      setError("每个课堂环节都需要记录实际实施内容。");
      return;
    }
    setActing(true);
    setError(null);
    try {
      const content = {
        teachingPlanRevisionRef: approved.revisionRef,
        calendarEventRef: null,
        actualStartAt: toIso(deliveryForm.actualStartAt),
        actualEndAt: toIso(deliveryForm.actualEndAt),
        steps: deliveryForm.steps,
        paceNotes: deliveryForm.paceNotes,
        unresolvedQuestions: splitLines(deliveryForm.unresolvedQuestions),
        followUpNotes: deliveryForm.followUpNotes
      };
      if (deliveryMode === "edit" && currentDraft && delivery) {
        await updateLessonDeliveryDraft(delivery.deliveryRef, {
          ...content,
          expectedRevisionVersion: currentDraft.revisionVersion,
          purpose: "lesson-delivery.update-draft",
          idempotencyKey: `ui:delivery:update:${crypto.randomUUID()}`
        });
      } else if (deliveryMode === "amend" && currentConfirmed && delivery) {
        await amendLessonDelivery(delivery.deliveryRef, {
          ...content,
          parentRevisionRef: currentConfirmed.deliveryRevisionRef,
          expectedAggregateVersion: delivery.aggregateVersion,
          purpose: "lesson-delivery.amend",
          idempotencyKey: `ui:delivery:amend:${crypto.randomUUID()}`
        });
      } else {
        await createLessonDelivery({
          ...content,
          courseRunRef: props.courseRunRef,
          lessonRef: props.lesson.lessonRef,
          purpose: "lesson-delivery.create",
          idempotencyKey: `ui:delivery:create:${crypto.randomUUID()}`
        });
      }
      setDeliveryOpen(false);
      props.onAction("课堂实施草稿已保存；尚未成为正式实施事实");
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function confirmDeliveryDraft() {
    if (!delivery || !currentDraft) return;
    setActing(true);
    setError(null);
    try {
      await confirmLessonDelivery(delivery.deliveryRef, {
        expectedRevisionVersion: currentDraft.revisionVersion,
        purpose: "lesson-delivery.confirm",
        idempotencyKey: `ui:delivery:confirm:${crypto.randomUUID()}`
      });
      props.onAction("课堂实施已由教师确认；原教学计划未被修改");
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  function openObservation(revision?: ClassroomObservationRevision) {
    setObservationToAmend(revision ?? null);
    setObservationForm(revision ? {
      scope: revision.scope,
      scopeRef: revision.scopeRef ?? "",
      observationType: revision.observationType,
      content: revision.content,
      observedAt: localDateTime(revision.observedAt)
    } : {
      scope: "class",
      scopeRef: "",
      observationType: "achievement",
      content: "",
      observedAt: localDateTime(new Date().toISOString())
    });
    setObservationOpen(true);
  }

  function useObservationCandidate(
    candidate: ClassroomFeedbackObservationCandidate
  ) {
    setObservationToAmend(null);
    setObservationForm({
      scope: candidate.scope,
      scopeRef: candidate.scopeRef ?? "",
      observationType: candidate.observationType,
      content: candidate.content.replace(/^候选观察：/u, ""),
      observedAt: localDateTime(
        currentConfirmed?.actualEndAt ?? new Date().toISOString()
      )
    });
    setObservationOpen(true);
  }

  async function saveObservation() {
    if (!delivery || !currentConfirmed) return;
    if (observationForm.scope !== "class" && !observationForm.scopeRef.trim()) {
      setError("非班级范围的观察必须选择或填写明确对象。");
      return;
    }
    setActing(true);
    setError(null);
    try {
      const content = {
        deliveryRevisionRef: currentConfirmed.deliveryRevisionRef,
        scope: observationForm.scope,
        scopeRef: observationForm.scope === "class" ? null : observationForm.scopeRef.trim(),
        observationType: observationForm.observationType,
        content: observationForm.content.trim(),
        observedAt: toIso(observationForm.observedAt)
      };
      if (observationToAmend) {
        const detail = await loadClassroomObservation(observationToAmend.observationRef);
        await supersedeClassroomObservation(observationToAmend.observationRef, {
          ...content,
          parentRevisionRef: observationToAmend.observationRevisionRef,
          expectedAggregateVersion: detail.aggregateVersion,
          purpose: "classroom-observation.supersede",
          idempotencyKey: `ui:observation:supersede:${crypto.randomUUID()}`
        });
      } else {
        await createClassroomObservation({
          ...content,
          courseRunRef: props.courseRunRef,
          lessonRef: props.lesson.lessonRef,
          purpose: "classroom-observation.create",
          idempotencyKey: `ui:observation:create:${crypto.randomUUID()}`
        });
      }
      setObservationOpen(false);
      props.onAction("课堂观察草稿已保存；需要教师单独确认");
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function confirmObservation(revision: ClassroomObservationRevision) {
    setActing(true);
    setError(null);
    try {
      await confirmClassroomObservation(revision.observationRef, {
        expectedRevisionVersion: revision.revisionVersion,
        purpose: "classroom-observation.confirm",
        idempotencyKey: `ui:observation:confirm:${crypto.randomUUID()}`
      });
      props.onAction("课堂观察已由教师确认，现可进入反思授权上下文");
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function startReflection() {
    if (!summary?.currentDelivery) return;
    setActing(true);
    setError(null);
    try {
      const result = await createReflectionDraft({
        courseRunRef: props.courseRunRef,
        lessonRef: props.lesson.lessonRef,
        teachingPlanRevisionRef: summary.currentDelivery.teachingPlanRevisionRef,
        deliveryRevisionRef: summary.currentDelivery.deliveryRevisionRef,
        observationRevisionRefs: selectedObservationRefs,
        assignmentEvidenceRefs: selectedEvidenceRefs,
        content: initialReflectionContent(summary),
        purpose: "lesson-reflection.create-draft",
        idempotencyKey: `ui:reflection:create:${crypto.randomUUID()}`
      });
      props.navigateReflection(result.reflection.reflectionRef);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  return (
    <section className="classroom-reflection-panel" data-testid="classroom-reflection-panel" aria-busy={loading}>
      <header className="classroom-reflection-panel__header">
        <h3>课后记录</h3>
      </header>
      {error ? <Alert type="error" showIcon title="课堂闭环操作失败" description={error} closable onClose={() => setError(null)} /> : null}

      <div className="classroom-reflection-flow">
        <section className="classroom-flow-section classroom-delivery-section" data-testid="lesson-delivery-card">
          <header>
            <h4>课堂情况</h4>
            <StatusPill tone={currentConfirmed ? "success" : currentDraft ? "warning" : "danger"}>
              {currentConfirmed ? "已完成" : currentDraft ? "进行中" : "未完成"}
            </StatusPill>
          </header>
          {!props.planState.currentApproved ? (
            <Alert type="warning" showIcon title="请先完成教学方案" />
          ) : currentConfirmed ? (
            <>
              <QuickClassroomFeedback
                courseRunRef={props.courseRunRef}
                lessonRef={props.lesson.lessonRef}
                approvedTeachingPlanRevisionRef={
                  props.planState.currentApproved.revisionRef
                }
                mode="confirmed"
                onGenerated={props.onAction}
                onRefresh={refresh}
                onUseCandidate={useObservationCandidate}
              />
              <div className="classroom-delivery-summary">
                <time>{new Date(currentConfirmed.actualStartAt).toLocaleString("zh-CN")} – {new Date(currentConfirmed.actualEndAt).toLocaleTimeString("zh-CN")}</time>
                {currentConfirmed.steps.slice(0, 3).map((step) => (
                  <p key={step.stepKey}><strong>{step.title}</strong><span>{step.actualDescription}</span></p>
                ))}
              </div>
              <div className="classroom-flow-actions">
                <Button type="text" onClick={() => openDelivery(currentDraft ? "edit" : "amend")}>
                  {currentDraft ? "编辑修改" : "修订记录"}
                </Button>
                {currentDraft ? (
                  <Popconfirm title="确认这份课堂记录？" onConfirm={() => void confirmDeliveryDraft()}>
                    <Button type="primary" loading={acting} data-testid="confirm-lesson-delivery">确认</Button>
                  </Popconfirm>
                ) : null}
              </div>
            </>
          ) : currentDraft ? (
            <>
              <QuickClassroomFeedback
                courseRunRef={props.courseRunRef}
                lessonRef={props.lesson.lessonRef}
                approvedTeachingPlanRevisionRef={
                  props.planState.currentApproved.revisionRef
                }
                mode="draft"
                onGenerated={props.onAction}
                onRefresh={refresh}
              />
              <div className="classroom-flow-actions">
                <Button type="text" onClick={() => openDelivery("edit")}>编辑</Button>
                <Popconfirm title="确认这份课堂记录？" onConfirm={() => void confirmDeliveryDraft()}>
                  <Button type="primary" loading={acting} data-testid="confirm-lesson-delivery">确认</Button>
                </Popconfirm>
              </div>
            </>
          ) : (
            <>
              <QuickClassroomFeedback
                courseRunRef={props.courseRunRef}
                lessonRef={props.lesson.lessonRef}
                approvedTeachingPlanRevisionRef={
                  props.planState.currentApproved.revisionRef
                }
                mode="generate"
                onGenerated={props.onAction}
                onRefresh={refresh}
              />
              <Button type="text" disabled={!props.planState.currentApproved} onClick={() => openDelivery("create")} data-testid="create-lesson-delivery">详细记录</Button>
            </>
          )}
        </section>

        {currentConfirmed ? (
          <section className="classroom-flow-section" data-testid="classroom-observation-card">
            <header>
              <h4>课堂观察</h4>
              <Button type="text" onClick={() => openObservation()} data-testid="create-classroom-observation">添加</Button>
            </header>
            <>
              {summary?.observations.length ? summary.observations.map((item) => (
                <article key={item.observationRevisionRef} className="classroom-observation-item">
                  <p>{item.content}</p>
                  <div>
                    <StatusPill tone={item.status === "confirmed" ? "success" : "warning"}>{item.status === "confirmed" ? "已完成" : "进行中"}</StatusPill>
                    {item.status === "draft" ? <Button type="text" loading={acting} onClick={() => void confirmObservation(item)} data-testid="confirm-classroom-observation">确认</Button> : null}
                    {item.status === "confirmed" ? <Button type="text" onClick={() => openObservation(item)}>修订</Button> : null}
                  </div>
                </article>
              )) : <span className="classroom-flow-empty">尚无记录</span>}
            </>
          </section>
        ) : null}

        {currentConfirmed ? (
          <section className="classroom-flow-section" data-testid="lesson-reflection-card">
            <header><h4>课后反思</h4></header>
          {summary?.reflection ? (
            <>
              <StatusPill tone={summary.reflection.currentConfirmed ? "success" : "warning"}>
                {summary.reflection.currentConfirmed ? "已完成" : "进行中"}
              </StatusPill>
              <Button type="primary" onClick={() => props.navigateReflection(summary.reflection!.reflectionRef)} data-testid="continue-reflection">{summary.reflection.currentConfirmed ? "查看反思" : "继续反思"}</Button>
            </>
          ) : (
            <>
              {(confirmedObservations.length > 0 || evidenceOptions.length > 0) ? (
                <details className="reflection-context-options">
                  <summary>选择反思依据</summary>
                  {confirmedObservations.length > 0 ? (
                    <Checkbox.Group value={selectedObservationRefs} onChange={(values) => setSelectedObservationRefs(values as string[])} options={confirmedObservations.map((item) => ({ label: item.content, value: item.observationRevisionRef }))} />
                  ) : null}
                  {evidenceOptions.length > 0 ? (
                    <Checkbox.Group value={selectedEvidenceRefs} onChange={(values) => setSelectedEvidenceRefs(values as string[])} options={evidenceOptions} />
                  ) : null}
                </details>
              ) : null}
              <Button type="primary" loading={acting} onClick={() => void startReflection()} data-testid="create-reflection-draft">开始反思</Button>
            </>
          )}
          </section>
        ) : null}
      </div>

      <Modal title={deliveryMode === "amend" ? "修订课堂实施记录" : "课堂实施草稿"} open={deliveryOpen} onCancel={() => setDeliveryOpen(false)} onOk={() => void saveDelivery()} okText="保存草稿" confirmLoading={acting} width={760} destroyOnHidden>
        <Alert type="info" showIcon title="保存不等于确认" description="草稿可继续修改；只有单独点击“教师确认实施”才会形成正式实施事实。" />
        <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
          <label>实际开始时间<Input type="datetime-local" value={deliveryForm.actualStartAt} onChange={(event) => setDeliveryForm((value) => ({ ...value, actualStartAt: event.target.value }))} /></label>
          <label>实际结束时间<Input type="datetime-local" value={deliveryForm.actualEndAt} onChange={(event) => setDeliveryForm((value) => ({ ...value, actualEndAt: event.target.value }))} /></label>
          {deliveryForm.steps.map((step, index) => (
            <Card key={`${step.stepKey}:${index}`} size="small" title={`${index + 1}. ${step.title}`}>
              <Paragraph type="secondary">计划：{step.plannedDescription}</Paragraph>
              <Select aria-label={`${step.title}实施状态`} value={step.disposition} options={Object.entries(dispositionLabels).map(([value, label]) => ({ value, label }))} onChange={(disposition) => setDeliveryForm((value) => ({ ...value, steps: value.steps.map((item, itemIndex) => itemIndex === index ? { ...item, disposition } : item) }))} />
              <Input.TextArea aria-label={`${step.title}实际实施`} value={step.actualDescription} rows={3} onChange={(event) => setDeliveryForm((value) => ({ ...value, steps: value.steps.map((item, itemIndex) => itemIndex === index ? { ...item, actualDescription: event.target.value } : item) }))} />
              <Input aria-label={`${step.title}调整原因`} placeholder="如有调整、跳过或新增，请说明教师判断依据" value={step.rationale} onChange={(event) => setDeliveryForm((value) => ({ ...value, steps: value.steps.map((item, itemIndex) => itemIndex === index ? { ...item, rationale: event.target.value } : item) }))} />
            </Card>
          ))}
          <label>课堂节奏变化<Input.TextArea value={deliveryForm.paceNotes} onChange={(event) => setDeliveryForm((value) => ({ ...value, paceNotes: event.target.value }))} /></label>
          <label>未解决问题（每行一项）<Input.TextArea value={deliveryForm.unresolvedQuestions} onChange={(event) => setDeliveryForm((value) => ({ ...value, unresolvedQuestions: event.target.value }))} /></label>
          <label>后续处理事项<Input.TextArea value={deliveryForm.followUpNotes} onChange={(event) => setDeliveryForm((value) => ({ ...value, followUpNotes: event.target.value }))} /></label>
        </Space>
      </Modal>

      <Modal title={observationToAmend ? "修订课堂观察" : "添加课堂观察"} open={observationOpen} onCancel={() => setObservationOpen(false)} onOk={() => void saveObservation()} okText="保存草稿" confirmLoading={acting} destroyOnHidden>
        <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
          <Select aria-label="观察范围" value={observationForm.scope} options={[
            { value: "class", label: "整个班级" },
            { value: "learning_objective", label: "教学目标" },
            { value: "learner", label: "匿名学习者" },
            { value: "activity", label: "教学活动" },
            { value: "assignment_item", label: "作业题目" }
          ]} onChange={(scope) => setObservationForm((value) => ({ ...value, scope, scopeRef: scope === "learning_objective" ? props.lesson.learningObjectives[0]?.objectiveRef ?? "" : "" }))} />
          {observationForm.scope === "learning_objective" ? (
            <Select<string> aria-label="关联教学目标" value={observationForm.scopeRef || null} options={props.lesson.learningObjectives.map((objective) => ({ value: objective.objectiveRef, label: objective.title }))} onChange={(scopeRef) => setObservationForm((value) => ({ ...value, scopeRef }))} />
          ) : observationForm.scope !== "class" ? (
            <Input aria-label="观察对象引用" placeholder="填写已授权的匿名学习者、活动或题目 Ref" value={observationForm.scopeRef} onChange={(event) => setObservationForm((value) => ({ ...value, scopeRef: event.target.value }))} />
          ) : null}
          <Select aria-label="观察类型" value={observationForm.observationType} options={Object.entries(observationTypeLabels).map(([value, label]) => ({ value, label }))} onChange={(observationType) => setObservationForm((value) => ({ ...value, observationType }))} />
          <Input.TextArea aria-label="课堂观察内容" rows={5} placeholder="只记录教师实际观察到的现象，不写长期能力标签" value={observationForm.content} onChange={(event) => setObservationForm((value) => ({ ...value, content: event.target.value }))} />
          <Input aria-label="观察时间" type="datetime-local" value={observationForm.observedAt} onChange={(event) => setObservationForm((value) => ({ ...value, observedAt: event.target.value }))} />
        </Space>
      </Modal>
    </section>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}
