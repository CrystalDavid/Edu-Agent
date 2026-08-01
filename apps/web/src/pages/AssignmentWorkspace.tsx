import { useEffect, useMemo, useState } from "react";

import type {
  AssignmentAnalytics,
  AssignmentDetail,
  AssignmentItemInput,
  AssignmentSummary,
  CourseRunView,
  CurriculumUnitView,
  LessonView,
  SubmissionDetail,
  SubmissionSummary,
  TeacherGradeDecisionView,
  TeacherItemGradeInput
} from "@edu-agent/contracts";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Empty,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography
} from "antd";

import {
  confirmGrade,
  createAdjustmentTask,
  createAssignment,
  importSyntheticSubmissions,
  loadAssignment,
  loadAssignmentAnalytics,
  loadAssignments,
  loadAssignmentSubmissions,
  loadCourseRuns,
  loadCurriculumUnits,
  loadGradeHistory,
  loadLessons,
  loadSubmission,
  reopenGrade,
  saveGradeDraft,
  transitionAssignment,
  transitionLessonPreparationTask,
  updateAssignmentDraft
} from "../api";

const { Paragraph, Text, Title } = Typography;

const statusLabels = {
  draft: "草稿",
  published: "已发布",
  closed: "已关闭",
  archived: "已归档"
} as const;

const submissionLabels = {
  not_submitted: "未交",
  submitted: "待确认批改",
  graded: "已确认"
} as const;

export function AssignmentWorkspace(props: {
  initialLessonRef?: string | null;
  navigatePreparation: (
    taskRef: string,
    destination?: "/agent" | "/copilot" | "/teaching-plan" | "/runs"
  ) => void;
  onAction: (message: string) => void;
}) {
  const [courses, setCourses] = useState<CourseRunView[]>([]);
  const [units, setUnits] = useState<CurriculumUnitView[]>([]);
  const [lessons, setLessons] = useState<LessonView[]>([]);
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [selectedAssignmentRef, setSelectedAssignmentRef] = useState<string | null>(null);
  const [detail, setDetail] = useState<AssignmentDetail | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
  const [analytics, setAnalytics] = useState<AssignmentAnalytics | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionDetail | null>(null);
  const [gradeDecision, setGradeDecision] = useState<TeacherGradeDecisionView | null>(null);
  const [gradeHistory, setGradeHistory] = useState<TeacherGradeDecisionView[]>([]);
  const [gradeItems, setGradeItems] = useState<TeacherItemGradeInput[]>([]);
  const [gradeFeedback, setGradeFeedback] = useState("");
  const [selectedErrorRefs, setSelectedErrorRefs] = useState<string[]>([]);
  const [selectedLessonRef, setSelectedLessonRef] = useState<string | null>(
    props.initialLessonRef ?? null
  );
  const [editingRef, setEditingRef] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("斜率与图像变化课后练习");
  const [formInstructions, setFormInstructions] = useState(
    "请独立完成，并在简答题中说明判断依据。"
  );
  const [formItems, setFormItems] = useState<AssignmentItemInput[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedLesson = lessons.find(
    (lesson) => lesson.lessonRef === selectedLessonRef
  ) ?? null;
  const targetLesson = useMemo(() => {
    if (!detail) return null;
    const source = lessons.find((lesson) => lesson.lessonRef === detail.lessonRef);
    return lessons.find(
      (lesson) => source && lesson.sequence === source.sequence + 1
    ) ?? null;
  }, [detail, lessons]);

  async function loadRoot() {
    setLoading(true);
    setError(null);
    try {
      const [courseResult, assignmentResult] = await Promise.all([
        loadCourseRuns(),
        loadAssignments()
      ]);
      setCourses(courseResult.items);
      setAssignments(assignmentResult.items);
      const course = courseResult.items[0];
      if (course) {
        const unitResult = await loadCurriculumUnits(course.courseRunRef);
        setUnits(unitResult.items);
        const unit = unitResult.items[0];
        if (unit) {
          const lessonResult = await loadLessons(unit.unitRef);
          setLessons(lessonResult.items);
          setSelectedLessonRef((current) =>
            current && lessonResult.items.some((lesson) => lesson.lessonRef === current)
              ? current
              : lessonResult.items.find((lesson) => lesson.sequence === 3)?.lessonRef ??
                lessonResult.items[0]?.lessonRef ?? null
          );
        }
      }
      const nextRef =
        selectedAssignmentRef ?? assignmentResult.items[0]?.assignmentRef ?? null;
      setSelectedAssignmentRef(nextRef);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function loadSelected(
    assignmentRef: string,
    preserveGradingContext = false
  ) {
    setLoading(true);
    setError(null);
    try {
      const [nextDetail, submissionResult, nextAnalytics] = await Promise.all([
        loadAssignment(assignmentRef),
        loadAssignmentSubmissions(assignmentRef),
        loadAssignmentAnalytics(assignmentRef)
      ]);
      setDetail(nextDetail);
      setSubmissions(submissionResult.items);
      setAnalytics(nextAnalytics);
      setSelectedLessonRef(nextDetail.lessonRef);
      if (!preserveGradingContext) {
        setSelectedSubmission(null);
        setGradeDecision(null);
        setGradeHistory([]);
      }
      setSelectedErrorRefs([]);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRoot();
  }, []);

  useEffect(() => {
    if (selectedAssignmentRef) void loadSelected(selectedAssignmentRef);
    else {
      setDetail(null);
      setSubmissions([]);
      setAnalytics(null);
    }
  }, [selectedAssignmentRef]);

  useEffect(() => {
    if (!selectedLesson || formItems.length > 0) return;
    const objectiveRef = selectedLesson.learningObjectives[0]?.objectiveRef;
    if (objectiveRef) setFormItems(defaultItems(objectiveRef));
  }, [selectedLesson, formItems.length]);

  function startNew() {
    const objectiveRef = selectedLesson?.learningObjectives[0]?.objectiveRef;
    if (!objectiveRef) {
      setError("请选择已关联教学目标的课时。");
      return;
    }
    setEditingRef(null);
    setFormTitle(`${selectedLesson.title}课后练习`);
    setFormInstructions("请独立完成，并在简答题中说明判断依据。");
    setFormItems(defaultItems(objectiveRef));
    setShowEditor(true);
  }

  function editDraft() {
    if (!detail || detail.status !== "draft") return;
    setEditingRef(detail.assignmentRef);
    setFormTitle(detail.currentVersion.title);
    setFormInstructions(detail.currentVersion.instructions);
    setFormItems(
      detail.currentVersion.items.map((item) => ({
        itemRef: item.itemRef,
        sequence: item.sequence,
        itemType: item.itemType,
        prompt: item.prompt,
        maxScore: item.maxScore,
        options: item.options,
        answerKey: item.answerKey,
        gradingCriteria: item.gradingCriteria,
        objectiveRef: item.objectiveRef
      }))
    );
    setShowEditor(true);
  }

  async function saveAssignment() {
    const course = courses[0];
    const unit = units.find((item) => item.unitRef === selectedLesson?.unitRef);
    if (!course || !unit || !selectedLesson) return;
    setActing(true);
    setError(null);
    try {
      const result = editingRef && detail
        ? await updateAssignmentDraft(editingRef, {
            expectedVersion: detail.version,
            title: formTitle,
            instructions: formInstructions,
            dueAt: selectedLesson.plannedAt,
            items: formItems,
            purpose: "assignment.update-draft",
            idempotencyKey: `ui:assignment:update:${crypto.randomUUID()}`
          })
        : await createAssignment({
            courseRunRef: course.courseRunRef,
            curriculumUnitRef: unit.unitRef,
            lessonRef: selectedLesson.lessonRef,
            title: formTitle,
            instructions: formInstructions,
            dueAt: selectedLesson.plannedAt,
            items: formItems,
            purpose: "assignment.create",
            idempotencyKey: `ui:assignment:create:${crypto.randomUUID()}`
          });
      setShowEditor(false);
      setEditingRef(null);
      setSelectedAssignmentRef(result.assignment.assignmentRef);
      await loadRoot();
      await loadSelected(result.assignment.assignmentRef);
      props.onAction(editingRef ? "已创建新的作业草稿版本。" : "作业草稿已创建。");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function runAssignmentAction(action: "publish" | "close" | "archive") {
    if (!detail) return;
    setActing(true);
    setError(null);
    try {
      const purpose =
        action === "publish"
          ? "assignment.publish"
          : action === "close"
            ? "assignment.close"
            : "assignment.archive";
      const result = await transitionAssignment(detail.assignmentRef, action, {
        expectedVersion: detail.version,
        purpose,
        idempotencyKey: `ui:assignment:${action}:${crypto.randomUUID()}`
      });
      setDetail(result.assignment);
      await loadRoot();
      props.onAction(`作业状态已更新为“${statusLabels[result.assignment.status]}”。`);
    } catch (caught) {
      setError(errorMessage(caught));
      await loadSelected(detail.assignmentRef);
    } finally {
      setActing(false);
    }
  }

  async function importDemo() {
    if (!detail) return;
    setActing(true);
    setError(null);
    try {
      const result = await importSyntheticSubmissions(detail.assignmentRef, {
        purpose: "assignment.synthetic-submissions.import",
        idempotencyKey: `ui:assignment:synthetic:${crypto.randomUUID()}`
      });
      await loadSelected(detail.assignmentRef);
      props.onAction(
        `已载入 ${result.submittedCount} 份匿名合成提交；${result.notSubmittedCount} 人明确显示为未交。`
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function openSubmission(summary: SubmissionSummary) {
    if (!summary.submissionRef) return;
    setLoading(true);
    setError(null);
    try {
      const [submission, history] = await Promise.all([
        loadSubmission(summary.submissionRef),
        loadGradeHistory(summary.submissionRef)
      ]);
      setSelectedSubmission(submission);
      const active =
        history.items.find((decision) => decision.status === "draft") ??
        history.items.find((decision) => decision.status === "confirmed") ??
        null;
      setGradeDecision(active);
      setGradeHistory(history.items);
      setGradeFeedback(active?.feedback ?? "");
      setGradeItems(
        active
          ? active.itemGrades.map((grade) => ({
              responseRef: grade.responseRef,
              outcome: grade.outcome,
              awardedScore: grade.awardedScore,
              feedback: grade.feedback
            }))
          : suggestedGrades(submission, detail)
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function saveDraft() {
    if (!selectedSubmission?.submissionRef || !selectedSubmission.latestAttemptRef) return;
    setActing(true);
    setError(null);
    try {
      const result = await saveGradeDraft(selectedSubmission.submissionRef, {
        expectedAttemptRef: selectedSubmission.latestAttemptRef,
        expectedDecisionVersion:
          gradeDecision?.status === "draft" ? gradeDecision.version : 0,
        feedback: gradeFeedback,
        itemGrades: gradeItems,
        purpose: "assignment.grading.save-draft",
        idempotencyKey: `ui:grade:save:${crypto.randomUUID()}`
      });
      setGradeDecision(result.decision);
      setGradeHistory((await loadGradeHistory(selectedSubmission.submissionRef)).items);
      props.onAction("批改草稿已保存；尚未形成正式成绩或 Evidence。");
      if (detail) await loadSelected(detail.assignmentRef, true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function confirmCurrentGrade() {
    if (
      !gradeDecision ||
      gradeDecision.status !== "draft" ||
      !selectedSubmission?.submissionRef
    )
      return;
    const submissionRef = selectedSubmission.submissionRef;
    setActing(true);
    setError(null);
    try {
      const result = await confirmGrade(gradeDecision.gradeDecisionRef, {
        expectedDecisionVersion: gradeDecision.version,
        purpose: "assignment.grading.confirm",
        idempotencyKey: `ui:grade:confirm:${crypto.randomUUID()}`
      });
      setGradeDecision(result.decision);
      setGradeHistory((await loadGradeHistory(submissionRef)).items);
      props.onAction("批改已由教师确认，并生成可追溯学习 Evidence。");
      if (detail) await loadSelected(detail.assignmentRef, true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function reopenCurrentGrade() {
    if (!gradeDecision || gradeDecision.status !== "confirmed") return;
    setActing(true);
    setError(null);
    try {
      const result = await reopenGrade(gradeDecision.gradeDecisionRef, {
        expectedDecisionVersion: gradeDecision.version,
        purpose: "assignment.grading.reopen",
        idempotencyKey: `ui:grade:reopen:${crypto.randomUUID()}`
      });
      setGradeDecision(result.decision);
      if (selectedSubmission?.submissionRef) {
        setGradeHistory((await loadGradeHistory(selectedSubmission.submissionRef)).items);
      }
      props.onAction("已创建新的批改草稿；原确认版本和 Evidence 历史仍保留。");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function adjustNextLesson() {
    if (!detail || !analytics || !targetLesson) return;
    const errors = analytics.commonErrors.filter((item) =>
      selectedErrorRefs.includes(item.errorRef)
    );
    const evidenceRefs = [...new Set(errors.flatMap((item) => item.evidenceRefs))];
    const itemRefs = [...new Set(errors.map((item) => item.itemRef))];
    if (evidenceRefs.length === 0) {
      setError("请先选择至少一组已确认的共性错误 Evidence。");
      return;
    }
    setActing(true);
    setError(null);
    try {
      const created = await createAdjustmentTask(detail.assignmentRef, {
        assignmentRef: detail.assignmentRef,
        sourceLessonRef: detail.lessonRef,
        targetLessonRef: targetLesson.lessonRef,
        selectedEvidenceRefs: evidenceRefs,
        selectedItemRefs: itemRefs,
        dueAt: targetLesson.plannedAt,
        priority: "high",
        purpose: "assignment.adjust-next-lesson",
        idempotencyKey: `ui:assignment:adjust:${crypto.randomUUID()}`
      });
      const started = await transitionLessonPreparationTask(
        created.task.taskRef,
        "start",
        {
          expectedVersion: created.task.version,
          purpose: "lesson-preparation.start",
          idempotencyKey: `ui:assignment:adjust-start:${crypto.randomUUID()}`
        }
      );
      props.navigatePreparation(started.task.taskRef, "/agent");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  return (
    <Spin spinning={loading}>
      <div className="assignment-workspace" data-testid="assignment-workspace">
        {error ? (
          <Alert
            type="error"
            showIcon
            title="作业流程未完成"
            description={error}
            closable
            onClose={() => setError(null)}
          />
        ) : null}
        <div className="page-grid">
          <Card className="workspace-card" variant="borderless">
            <Space orientation="vertical" style={{ width: "100%" }}>
              <Text className="section-kicker">PostgreSQL 作业</Text>
              <Button type="primary" onClick={startNew} data-testid="create-assignment">
                创建作业草稿
              </Button>
              <div className="course-list">
                {assignments.map((assignment) => (
                  <button
                    type="button"
                    className={
                      selectedAssignmentRef === assignment.assignmentRef
                        ? "is-active"
                        : ""
                    }
                    key={assignment.assignmentRef}
                    onClick={() => setSelectedAssignmentRef(assignment.assignmentRef)}
                    data-testid={`assignment-${assignment.status}`}
                  >
                    <strong>{assignment.title}</strong>
                    <small>
                      {statusLabels[assignment.status]} · v{assignment.currentVersionNumber} ·
                      {assignment.submittedCount}/{assignment.enrolledCount} 已交
                    </small>
                  </button>
                ))}
              </div>
              {assignments.length === 0 ? (
                <Empty description="尚无真实作业；请从当前课时创建草稿。" />
              ) : null}
            </Space>
          </Card>

          <Card className="workspace-card" variant="borderless">
            {showEditor ? (
              <section data-testid="assignment-editor">
                <Title level={3}>{editingRef ? "编辑草稿并创建新版本" : "创建作业草稿"}</Title>
                <Select
                  value={selectedLessonRef}
                  onChange={setSelectedLessonRef}
                  options={lessons.map((lesson) => ({
                    value: lesson.lessonRef,
                    label: `${lesson.sequence}. ${lesson.title}`,
                    disabled: lesson.learningObjectives.length === 0
                  }))}
                  style={{ width: "100%" }}
                  disabled={Boolean(editingRef)}
                />
                <Input
                  value={formTitle}
                  onChange={(event) => setFormTitle(event.target.value)}
                  placeholder="作业标题"
                  data-testid="assignment-title"
                />
                <Input.TextArea
                  value={formInstructions}
                  onChange={(event) => setFormInstructions(event.target.value)}
                  rows={2}
                  placeholder="作业说明"
                />
                {formItems.map((item, index) => (
                  <Card key={`${item.sequence}-${index}`} size="small">
                    <Space orientation="vertical" style={{ width: "100%" }}>
                      <Tag>{itemTypeLabel(item.itemType)}</Tag>
                      <Input
                        value={item.prompt}
                        onChange={(event) =>
                          setFormItems((current) =>
                            current.map((entry, itemIndex) =>
                              itemIndex === index
                                ? { ...entry, prompt: event.target.value }
                                : entry
                            )
                          )
                        }
                        data-testid={`assignment-item-${index + 1}`}
                      />
                    </Space>
                  </Card>
                ))}
                <Space>
                  <Button
                    type="primary"
                    loading={acting}
                    onClick={() => void saveAssignment()}
                    data-testid="save-assignment"
                  >
                    {editingRef ? "保存为新草稿版本" : "保存草稿"}
                  </Button>
                  <Button onClick={() => setShowEditor(false)}>取消</Button>
                </Space>
              </section>
            ) : detail ? (
              <section data-testid="assignment-detail">
                <Space wrap>
                  <Tag color={detail.status === "draft" ? "default" : "processing"}>
                    {statusLabels[detail.status]}
                  </Tag>
                  <Tag>聚合 v{detail.version}</Tag>
                  <Tag>内容 v{detail.currentVersionNumber}</Tag>
                </Space>
                <Title level={2}>{detail.title}</Title>
                <Paragraph>{detail.currentVersion.instructions}</Paragraph>
                <Paragraph>
                  {detail.lessonTitle} · {detail.itemCount} 题 · {detail.submittedCount}/
                  {detail.enrolledCount} 已交 · {detail.confirmedGradeCount} 已确认批改
                </Paragraph>
                <Space wrap>
                  {detail.status === "draft" ? (
                    <>
                      <Button onClick={editDraft}>编辑题目</Button>
                      <Popconfirm
                        title="确认发布作业？"
                        description="发布后内容版本不可原地修改。"
                        onConfirm={() => void runAssignmentAction("publish")}
                      >
                        <Button type="primary" loading={acting} data-testid="publish-assignment">
                          显式发布
                        </Button>
                      </Popconfirm>
                    </>
                  ) : null}
                  {detail.status === "published" && detail.submittedCount === 0 ? (
                    <Button loading={acting} onClick={() => void importDemo()} data-testid="import-submissions">
                      载入匿名合成提交
                    </Button>
                  ) : null}
                  {detail.status === "published" ? (
                    <Button loading={acting} onClick={() => void runAssignmentAction("close")}>
                      关闭提交
                    </Button>
                  ) : null}
                  {detail.status === "closed" ? (
                    <Button loading={acting} onClick={() => void runAssignmentAction("archive")}>
                      归档
                    </Button>
                  ) : null}
                </Space>
                <Title level={4}>版本历史</Title>
                <Space wrap>
                  {detail.versionHistory.map((version) => (
                    <Tag key={version.assignmentVersionRef}>
                      v{version.versionNumber} · {version.items.length} 题
                    </Tag>
                  ))}
                </Space>
                <Title level={4}>题目</Title>
                {detail.currentVersion.items.map((item) => (
                  <Paragraph key={item.itemRef}>
                    {item.sequence}. {item.prompt}（{item.maxScore} 分 · {itemTypeLabel(item.itemType)}）
                  </Paragraph>
                ))}
              </section>
            ) : (
              <Empty description="选择作业或创建新草稿" />
            )}
          </Card>
        </div>

        {detail && !showEditor ? (
          <div className="page-grid">
            <Card className="workspace-card" variant="borderless">
              <Title level={3}>提交与批改</Title>
              <Table
                size="small"
                rowKey={(record) => record.learnerRef}
                dataSource={submissions}
                pagination={{ pageSize: 12, hideOnSinglePage: true }}
                columns={[
                  { title: "匿名 learner", dataIndex: "displayName" },
                  {
                    title: "状态",
                    render: (_, record) => (
                      <Tag color={record.submissionState === "not_submitted" ? "default" : "blue"}>
                        {submissionLabels[record.submissionState]}
                      </Tag>
                    )
                  },
                  {
                    title: "分数",
                    render: (_, record) =>
                      record.score === null ? "—" : `${record.score}/${record.maxScore}`
                  },
                  {
                    title: "操作",
                    render: (_, record) => (
                      <Button
                        size="small"
                        disabled={!record.submissionRef}
                        title={!record.submissionRef ? "未交表示没有 SubmissionAttempt，不能批改" : undefined}
                        onClick={() => void openSubmission(record)}
                      >
                        {record.gradeStatus === "confirmed" ? "查看批改" : "批改"}
                      </Button>
                    )
                  }
                ]}
              />
            </Card>

            <Card className="workspace-card" variant="borderless" data-testid="grading-panel">
              {selectedSubmission ? (
                <>
                  <Title level={3}>{selectedSubmission.displayName} · 逐题批改</Title>
                  <Paragraph>
                    Attempt {selectedSubmission.latestAttemptRef} · 不可变 ·
                    {gradeDecision ? ` GradeDecision v${gradeDecision.version}` : " 尚无草稿"}
                  </Paragraph>
                  {gradeItems.map((grade, index) => {
                    const response = selectedSubmission.attempts
                      .find((attempt) => attempt.isCurrent)
                      ?.itemResponses.find((item) => item.responseRef === grade.responseRef);
                    const item = detail.currentVersion.items.find(
                      (entry) => entry.itemRef === response?.itemRef
                    );
                    return (
                      <Card size="small" key={grade.responseRef}>
                        <Paragraph>{item?.sequence}. {item?.prompt}</Paragraph>
                        <Text code>{JSON.stringify(response?.responseValue ?? {})}</Text>
                        <Space wrap>
                          <Select
                            value={grade.outcome}
                            disabled={gradeDecision?.status === "confirmed"}
                            options={[
                              { value: "correct", label: "正确" },
                              { value: "partial", label: "部分正确" },
                              { value: "incorrect", label: "错误" }
                            ]}
                            onChange={(value) =>
                              setGradeItems((current) =>
                                current.map((entry, itemIndex) =>
                                  itemIndex === index ? { ...entry, outcome: value } : entry
                                )
                              )
                            }
                          />
                          <InputNumber
                            min={0}
                            max={item?.maxScore ?? 0}
                            value={grade.awardedScore}
                            disabled={gradeDecision?.status === "confirmed"}
                            onChange={(value) =>
                              setGradeItems((current) =>
                                current.map((entry, itemIndex) =>
                                  itemIndex === index
                                    ? { ...entry, awardedScore: Number(value ?? 0) }
                                    : entry
                                )
                              )
                            }
                          />
                        </Space>
                      </Card>
                    );
                  })}
                  <Input.TextArea
                    value={gradeFeedback}
                    disabled={gradeDecision?.status === "confirmed"}
                    onChange={(event) => setGradeFeedback(event.target.value)}
                    placeholder="教师反馈"
                  />
                  <Space wrap>
                    {gradeDecision?.status !== "confirmed" ? (
                      <>
                        <Button loading={acting} onClick={() => void saveDraft()} data-testid="save-grade-draft">
                          保存批改草稿
                        </Button>
                        <Button
                          type="primary"
                          disabled={gradeDecision?.status !== "draft"}
                          title={gradeDecision?.status !== "draft" ? "请先保存批改草稿" : undefined}
                          loading={acting}
                          onClick={() => void confirmCurrentGrade()}
                          data-testid="confirm-grade"
                        >
                          教师确认批改
                        </Button>
                      </>
                    ) : (
                      <Button loading={acting} onClick={() => void reopenCurrentGrade()} data-testid="reopen-grade">
                        重新打开批改
                      </Button>
                    )}
                  </Space>
                  <Alert
                    type="info"
                    showIcon
                    title="保存不等于确认"
                    description="只有教师确认后才形成正式 GradeDecision 和可追溯 Evidence；确定性评分只是建议。"
                  />
                  <Title level={4}>批改与反馈历史</Title>
                  <Space orientation="vertical" size="small" data-testid="grade-history">
                    {gradeHistory.map((decision) => (
                      <Text key={decision.gradeDecisionRef}>
                        v{decision.version} · {decision.status} · {decision.totalScore}/{decision.maxScore} · {decision.feedback || "无整体反馈"}
                      </Text>
                    ))}
                  </Space>
                </>
              ) : (
                <Empty description="选择一份已交提交进行逐题批改" />
              )}
            </Card>
          </div>
        ) : null}

        {analytics && analytics.confirmedGradeCount > 0 ? (
          <Card className="workspace-card" variant="borderless" data-testid="assignment-analytics">
            <Title level={3}>可重算的班级表现</Title>
            <Space wrap>
              <Tag>已交 {analytics.submittedCount}/{analytics.enrolledCount}</Tag>
              <Tag>未交 {analytics.notSubmittedCount}</Tag>
              <Tag>已确认 {analytics.confirmedGradeCount}</Tag>
              <Tag>平均分 {analytics.averageScore?.toFixed(1) ?? "—"}</Tag>
              <Tag>中位数 {analytics.medianScore?.toFixed(1) ?? "—"}</Tag>
            </Space>
            <Title level={4}>共性错误与 Evidence 选择</Title>
            <Checkbox.Group
              value={selectedErrorRefs}
              onChange={(values) => setSelectedErrorRefs(values.map(String))}
            >
              <Space orientation="vertical">
                {analytics.commonErrors.map((item) => (
                  <Checkbox key={item.errorRef} value={item.errorRef}>
                    {item.summary} · {item.evidenceRefs.length} 条当前 Evidence
                  </Checkbox>
                ))}
              </Space>
            </Checkbox.Group>
            <Title level={4}>逐题表现</Title>
            <Space orientation="vertical" size="small">
              {analytics.itemPerformance.map((item) => (
                <Text key={item.itemRef}>
                  第 {item.sequence} 题 · 已确认 {item.confirmedCount} · 正确 {item.correctCount} · 部分正确 {item.partialCount} · 错误 {item.incorrectCount} · 得分率 {item.averageScoreRate === null ? "—" : `${Math.round(item.averageScoreRate * 100)}%`}
                </Text>
              ))}
            </Space>
            <Title level={4}>LearningObjective 表现</Title>
            <Space orientation="vertical" size="small">
              {analytics.objectivePerformance.map((objective) => (
                <Text key={objective.objectiveRef}>
                  {objective.objectiveTitle} · {objective.confirmedResponseCount} 条已确认作答 · 得分率 {objective.averageScoreRate === null ? "—" : `${Math.round(objective.averageScoreRate * 100)}%`}
                </Text>
              ))}
            </Space>
            <Paragraph type="secondary">
              统计从 SubmissionAttempt、ItemResponse 与 confirmed GradeDecision 实时重算，不形成长期能力标签。
            </Paragraph>
            <Button
              type="primary"
              disabled={selectedErrorRefs.length === 0 || !targetLesson}
              title={!targetLesson ? "当前课时没有可用的下一课" : undefined}
              loading={acting}
              onClick={() => void adjustNextLesson()}
              data-testid="adjust-next-lesson"
            >
              调整下一课{targetLesson ? `：${targetLesson.title}` : ""}
            </Button>
          </Card>
        ) : null}
      </div>
    </Spin>
  );
}

function defaultItems(objectiveRef: string): AssignmentItemInput[] {
  return [
    {
      sequence: 1,
      itemType: "multiple_choice",
      prompt: "当一次函数的斜率为正时，图像随 x 增大如何变化？",
      maxScore: 4,
      options: [
        { key: "A", text: "上升" },
        { key: "B", text: "下降" },
        { key: "C", text: "保持不变" }
      ],
      answerKey: { choiceKey: "A" },
      gradingCriteria: "选择 A 得满分。",
      objectiveRef
    },
    {
      sequence: 2,
      itemType: "numeric",
      prompt: "直线经过 (0,1) 和 (2,5)，斜率是多少？",
      maxScore: 4,
      options: [],
      answerKey: { numericValue: 2, tolerance: 0.001 },
      gradingCriteria: "斜率为 2。",
      objectiveRef
    },
    {
      sequence: 3,
      itemType: "short_answer",
      prompt: "请说明斜率正负与图像变化方向之间的关系。",
      maxScore: 7,
      options: [],
      answerKey: {
        referenceAnswer: "斜率为正时图像上升，斜率为负时图像下降。"
      },
      gradingCriteria: "必须由教师确认解释是否完整。",
      objectiveRef
    }
  ];
}

function suggestedGrades(
  submission: SubmissionDetail,
  assignment: AssignmentDetail | null
): TeacherItemGradeInput[] {
  const attempt = submission.attempts.find((item) => item.isCurrent);
  if (!attempt || !assignment) return [];
  const itemByRef = new Map(
    assignment.currentVersion.items.map((item) => [item.itemRef, item])
  );
  return attempt.itemResponses.map((response) => {
    const item = itemByRef.get(response.itemRef)!;
    let correct = false;
    if (item.itemType === "multiple_choice") {
      correct = response.responseValue["choiceKey"] === item.answerKey.choiceKey;
    } else if (item.itemType === "numeric") {
      const answer = Number(response.responseValue["numericValue"]);
      correct =
        Math.abs(answer - (item.answerKey.numericValue ?? 0)) <=
        (item.answerKey.tolerance ?? 0);
    }
    if (item.itemType === "short_answer") {
      return {
        responseRef: response.responseRef,
        outcome: "partial",
        awardedScore: Math.round(item.maxScore / 2),
        feedback: "简答题需要教师复核后确认。"
      };
    }
    return {
      responseRef: response.responseRef,
      outcome: correct ? "correct" : "incorrect",
      awardedScore: correct ? item.maxScore : 0,
      feedback: correct ? "确定性规则建议正确。" : "请教师检查错误原因。"
    };
  });
}

function itemTypeLabel(type: AssignmentItemInput["itemType"]): string {
  return type === "multiple_choice"
    ? "单选题"
    : type === "numeric"
      ? "数值题"
      : "简答题";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}
