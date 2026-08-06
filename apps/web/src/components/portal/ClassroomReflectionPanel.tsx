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
  Divider,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tag,
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

const { Paragraph, Text, Title } = Typography;

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
    ["opening", "课堂导入", plan?.openingActivity ?? "按已批准教学计划完成课堂导入。"],
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
      setError("必须先批准一版教学计划，才能记录课堂实施。");
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
    <section className="classroom-reflection-panel" data-testid="classroom-reflection-panel">
      <Divider />
      <Text className="section-kicker">计划之外的真实课堂</Text>
      <Title level={3}>课堂实施、观察与课后反思</Title>
      <Paragraph type="secondary">
        已批准教学计划仍然只是计划。只有教师确认的课堂记录与观察才是实施事实；教学助手只能生成课后反思草稿。
      </Paragraph>
      {error ? <Alert type="error" showIcon title="课堂闭环操作失败" description={error} closable onClose={() => setError(null)} /> : null}

      <div className="classroom-reflection-grid">
        <Card size="small" title="1. 课堂实施" loading={loading} data-testid="lesson-delivery-card">
          {!props.planState.currentApproved ? (
            <Alert type="warning" showIcon title="尚无已批准教学计划" description="请先批准一版教学计划，再记录本节课的实际实施情况。" />
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
              <Space wrap>
                <Tag color="success">教师已确认</Tag>
                <Tag>实施记录第 {currentConfirmed.revisionNumber} 版</Tag>
                <Tag>教学计划第 {props.planState.currentApproved.revisionNumber} 版</Tag>
              </Space>
              <Paragraph>{new Date(currentConfirmed.actualStartAt).toLocaleString("zh-CN")} – {new Date(currentConfirmed.actualEndAt).toLocaleTimeString("zh-CN")}</Paragraph>
              {currentConfirmed.steps.map((step) => (
                <Paragraph key={step.stepKey}><Tag>{dispositionLabels[step.disposition]}</Tag><strong>{step.title}</strong>：{step.actualDescription}</Paragraph>
              ))}
              {currentDraft ? <Alert type="info" showIcon title="存在待确认修订" description={`第 ${currentDraft.revisionNumber} 版草稿尚未成为正式事实。`} /> : null}
              <Space wrap>
                {currentDraft ? <Button onClick={() => openDelivery("edit")}>编辑修订草稿</Button> : <Button onClick={() => openDelivery("amend")}>修订实施记录</Button>}
                {currentDraft ? (
                  <Popconfirm title="确认这份课堂实施记录？" description="确认后不可原地覆盖，后续修改将保留修订历史。" onConfirm={() => void confirmDeliveryDraft()}>
                    <Button type="primary" loading={acting} data-testid="confirm-lesson-delivery">教师确认实施</Button>
                  </Popconfirm>
                ) : null}
              </Space>
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
              <Alert type="info" showIcon title="课堂实施草稿" description="当前内容尚未成为正式实施事实。" />
              <Space wrap>
                <Button onClick={() => openDelivery("edit")}>继续编辑</Button>
                <Popconfirm title="确认这份课堂实施记录？" description="确认后将形成正式课堂实施事实；原教学计划保持不变。" onConfirm={() => void confirmDeliveryDraft()}>
                  <Button type="primary" loading={acting} data-testid="confirm-lesson-delivery">教师确认实施</Button>
                </Popconfirm>
              </Space>
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
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未记录本节课实际实施" />
              <Button type="primary" disabled={!props.planState.currentApproved} onClick={() => openDelivery("create")} data-testid="create-lesson-delivery">记录本节课</Button>
            </>
          )}
        </Card>

        <Card size="small" title="2. 教师确认的课堂观察" loading={loading} data-testid="classroom-observation-card">
          {!currentConfirmed ? (
            <Paragraph type="secondary">先确认课堂实施，再记录与该次课堂场次关联的观察。</Paragraph>
          ) : (
            <>
              {summary?.observations.length ? summary.observations.map((item) => (
                <Card key={item.observationRevisionRef} size="small" className="classroom-observation-item">
                  <Space wrap>
                    <Tag color={item.status === "confirmed" ? "success" : item.status === "draft" ? "processing" : "default"}>{item.status === "confirmed" ? "已确认" : item.status === "draft" ? "草稿" : "已被修订"}</Tag>
                    <Tag>{item.scope === "class" ? "班级" : item.scope}</Tag>
                    <Tag>{observationTypeLabels[item.observationType]}</Tag>
                  </Space>
                  <Paragraph>{item.content}</Paragraph>
                  <Space wrap>
                    {item.status === "draft" ? <Button type="primary" size="small" loading={acting} onClick={() => void confirmObservation(item)} data-testid="confirm-classroom-observation">确认观察</Button> : null}
                    {item.status === "confirmed" ? <Button size="small" onClick={() => openObservation(item)}>保留历史并修订</Button> : null}
                  </Space>
                </Card>
              )) : <Paragraph type="secondary">尚无课堂观察。</Paragraph>}
              <Button onClick={() => openObservation()} data-testid="create-classroom-observation">添加课堂观察</Button>
            </>
          )}
        </Card>

        <Card size="small" title="3. 课后反思" loading={loading} data-testid="lesson-reflection-card">
          {!currentConfirmed ? (
            <Paragraph type="secondary">正式课后反思必须基于教师确认的实施记录。</Paragraph>
          ) : summary?.reflection ? (
            <>
              <Space wrap>
                <Tag color={summary.reflection.currentConfirmed ? "success" : "processing"}>
                  {summary.reflection.currentConfirmed ? "正式反思已确认" : summary.reflection.generationStatus === "generating" ? "教学助手生成中" : "反思草稿"}
                </Tag>
                <Tag>{summary.reflection.history.length} 个版本</Tag>
              </Space>
              <Paragraph type="secondary">课后反思独立于教学计划，确认反思不会修改原计划。</Paragraph>
              <Button type="primary" onClick={() => props.navigateReflection(summary.reflection!.reflectionRef)} data-testid="continue-reflection">{summary.reflection.currentConfirmed ? "查看反思与后续行动" : "继续完成课后反思"}</Button>
            </>
          ) : (
            <>
              <Paragraph>选择本次反思可使用的已确认事实：</Paragraph>
              <Checkbox.Group
                value={selectedObservationRefs}
                onChange={(values) => setSelectedObservationRefs(values as string[])}
                options={confirmedObservations.map((item) => ({ label: item.content, value: item.observationRevisionRef }))}
              />
              <Divider />
              <Paragraph>可选作业证据（仅教师明确勾选的内容用于本次反思）：</Paragraph>
              {evidenceOptions.length > 0 ? (
                <Checkbox.Group value={selectedEvidenceRefs} onChange={(values) => setSelectedEvidenceRefs(values as string[])} options={evidenceOptions} />
              ) : (
                <Paragraph type="secondary">当前课时暂无教师确认的作业证据；可以保留为空并明确证据缺口。</Paragraph>
              )}
              <div><Button type="primary" loading={acting} onClick={() => void startReflection()} data-testid="create-reflection-draft">创建反思草稿</Button></div>
            </>
          )}
        </Card>
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
