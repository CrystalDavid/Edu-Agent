import { useEffect, useMemo, useState } from "react";

import type {
  AssignmentSummary,
  CourseRunView,
  CurriculumUnitView,
  FileAssetDetail,
  FileAssetSummary,
  LessonJourneyProjection,
  LessonPreparationTaskSummary,
  LessonTeachingPlanState,
  LessonView
} from "@edu-agent/contracts";
import {
  Alert,
  Button,
  Card,
  Empty,
  Modal,
  Popconfirm,
  Progress,
  Space,
  Spin,
  Tag,
  Typography
} from "antd";

import {
  createLessonPreparationTask,
  downloadFile,
  loadAssignments,
  loadCourseRuns,
  loadCurriculumUnits,
  loadLessonPreparationTasks,
  loadLessonJourney,
  loadLessons,
  loadLessonTeachingPlans,
  loadFile,
  loadFiles,
  transitionLessonPreparationTask
} from "../api";
import { AssignmentWorkspace } from "./AssignmentWorkspace";
import { PageHeader } from "../components/portal/PortalPrimitives";
import { ClassroomReflectionPanel } from "../components/portal/ClassroomReflectionPanel";
import { cleanDisplayText, lessonPreparationStatusLabel } from "../presentation";
import { WorkspaceIcon } from "../components/WorkspaceIcon";
import {
  LessonContextHeader,
  LessonJourney,
  LessonNextBestActionCard
} from "../components/teaching/LessonJourney";

const { Paragraph, Text, Title } = Typography;
type TeachingTab = "course" | "homework" | "exam";

export function TeachingWorkspacePage(props: {
  navigatePreparation: (
    taskRef: string,
    destination?: "/agent" | "/copilot" | "/teaching-plan" | "/runs"
  ) => void;
  navigateFiles: (context?: {
    assetRef?: string;
    lessonRef?: string;
  }) => void;
  navigateReflection: (reflectionRef: string) => void;
  initialLessonRef?: string | null;
  initialTab?: TeachingTab;
  onAction: (message: string) => void;
}) {
  const [tab, setTab] = useState<TeachingTab>(
    props.initialTab ?? "course"
  );
  return (
    <div
      className="portal-page teaching-page"
      data-testid="teaching-page"
    >
      <PageHeader
        title="教学"
        subtitle="按课程完成备课、作业、课堂实施与课后反思"
      />
      <div
        className="teaching-tabs"
        role="tablist"
        aria-label="教学工作区"
      >
        {([
          ["course", "课程", "按单元查看课时与教学准备"],
          ["homework", "作业", "创建、发布、批改与学习分析"],
          ["exam", "考试", "暂未开放"]
        ] as const).map(([value, label, description]) => (
          <button
            type="button"
            role="tab"
            key={value}
            aria-selected={tab === value}
            className={tab === value ? "is-active" : ""}
            disabled={value === "exam"}
            aria-disabled={value === "exam"}
            onClick={() => setTab(value)}
          >
            <strong>{label}</strong>
            <span>{description}</span>
          </button>
        ))}
      </div>
      {tab === "course" ? (
        <RealCourseWorkspace
          navigateFiles={props.navigateFiles}
          navigatePreparation={props.navigatePreparation}
          navigateReflection={props.navigateReflection}
          onOpenAssignments={() => setTab("homework")}
          onAction={props.onAction}
          {...(props.initialLessonRef !== undefined
            ? { initialLessonRef: props.initialLessonRef }
            : {})}
        />
      ) : null}
      {tab === "homework" ? (
        <AssignmentWorkspace
          navigatePreparation={props.navigatePreparation}
          onAction={props.onAction}
          {...(props.initialLessonRef !== undefined
            ? { initialLessonRef: props.initialLessonRef }
            : {})}
        />
      ) : null}
    </div>
  );
}

function RealCourseWorkspace(props: {
  navigatePreparation: (
    taskRef: string,
    destination?: "/agent" | "/copilot" | "/teaching-plan" | "/runs"
  ) => void;
  navigateFiles: (context?: {
    assetRef?: string;
    lessonRef?: string;
  }) => void;
  navigateReflection: (reflectionRef: string) => void;
  onAction: (message: string) => void;
  onOpenAssignments: () => void;
  initialLessonRef?: string | null;
}) {
  const [courses, setCourses] = useState<CourseRunView[]>([]);
  const [units, setUnits] = useState<CurriculumUnitView[]>([]);
  const [lessons, setLessons] = useState<LessonView[]>([]);
  const [tasks, setTasks] = useState<
    LessonPreparationTaskSummary[]
  >([]);
  const [selectedUnitRef, setSelectedUnitRef] = useState<
    string | null
  >(null);
  const [selectedLessonRef, setSelectedLessonRef] = useState<
    string | null
  >(null);
  const [planState, setPlanState] =
    useState<LessonTeachingPlanState | null>(null);
  const [journey, setJourney] =
    useState<LessonJourneyProjection | null>(null);
  const [lessonFiles, setLessonFiles] = useState<FileAssetSummary[]>([]);
  const [lessonAssignments, setLessonAssignments] = useState<AssignmentSummary[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileAssetDetail | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCourse = courses[0] ?? null;
  const selectedUnit =
    units.find((unit) => unit.unitRef === selectedUnitRef) ?? null;
  const selectedLesson =
    lessons.find(
      (lesson) => lesson.lessonRef === selectedLessonRef
    ) ?? null;
  const lessonTasks = useMemo(
    () =>
      tasks
        .filter(
          (task) => task.lessonRef === selectedLessonRef
        )
        .sort((left, right) =>
          right.updatedAt.localeCompare(left.updatedAt)
        ),
    [tasks, selectedLessonRef]
  );
  const activeTask =
    lessonTasks.find(
      (task) =>
        task.status !== "completed" &&
        task.status !== "cancelled"
    ) ??
    lessonTasks[0] ??
    null;

  async function loadRoot() {
    setLoading(true);
    setError(null);
    try {
      const [courseResult, taskResult] = await Promise.all([
        loadCourseRuns(),
        loadLessonPreparationTasks()
      ]);
      setCourses(courseResult.items);
      setTasks(taskResult.items);
      const course = courseResult.items[0];
      if (!course) return;
      const unitResult = await loadCurriculumUnits(
        course.courseRunRef
      );
      setUnits(unitResult.items);
      const unit = unitResult.items[0];
      if (unit && props.initialLessonRef) {
        setSelectedUnitRef((current) => current ?? unit.unitRef);
      }
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
    if (!selectedUnitRef) {
      setLessons([]);
      setSelectedLessonRef(null);
      return;
    }
    let active = true;
    setLoading(true);
    void loadLessons(selectedUnitRef)
      .then((result) => {
        if (!active) return;
        setLessons(result.items);
        setSelectedLessonRef((current) => {
          const routedLesson = result.items.find(
            (lesson) =>
              lesson.lessonRef === props.initialLessonRef
          );
          if (routedLesson) return routedLesson.lessonRef;
          if (
            current &&
            result.items.some(
              (lesson) => lesson.lessonRef === current
            )
          ) {
            return current;
          }
          return null;
        });
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
  }, [props.initialLessonRef, selectedUnitRef]);

  useEffect(() => {
    if (!selectedLessonRef) {
      setPlanState(null);
      setJourney(null);
      return;
    }
    let active = true;
    void Promise.all([
      loadLessonTeachingPlans(selectedLessonRef),
      loadFiles({
        status: "active",
        sort: "newest",
        targetType: "lesson",
        targetRef: selectedLessonRef
      }),
      loadAssignments(selectedLessonRef),
      loadLessonJourney(selectedLessonRef)
    ])
      .then(([result, files, assignments, journeyResult]) => {
        if (active) {
          setPlanState(result);
          setLessonFiles(files.items);
          setLessonAssignments(assignments.items);
          setJourney(journeyResult);
        }
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, [selectedLessonRef, tasks]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function openFilePreview(file: FileAssetSummary) {
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewFile(null);
    setPreviewText(null);
    setError(null);
    try {
      const detail = await loadFile(file.assetRef);
      setPreviewFile(detail);
      if (["image", "pdf", "text"].includes(detail.currentVersion.previewKind)) {
        const blob = await downloadFile(detail.assetRef, detail.currentVersion.versionRef);
        if (detail.currentVersion.previewKind === "text") {
          setPreviewText(await blob.text());
        } else {
          const nextUrl = URL.createObjectURL(blob);
          setPreviewUrl((current) => {
            if (current) URL.revokeObjectURL(current);
            return nextUrl;
          });
        }
      }
    } catch (caught) {
      setError(errorMessage(caught));
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  }

  function closeFilePreview() {
    setPreviewOpen(false);
    setPreviewFile(null);
    setPreviewText(null);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }

  async function startOrContinue() {
    if (!selectedLesson) return;
    setActing(true);
    setError(null);
    try {
      let task = activeTask;
      if (!task) {
        const created = await createLessonPreparationTask({
          lessonRef: selectedLesson.lessonRef,
          dueAt: selectedLesson.plannedAt,
          priority: "normal",
          purpose: "lesson-preparation.create",
          idempotencyKey: `ui:lesson-preparation:create:${crypto.randomUUID()}`
        });
        task = created.task;
      }
      if (
        !["planned", "in_progress"].includes(task.status)
      ) {
        setError(
          `当前任务为“${lessonPreparationStatusLabel(task.status)}”，请按页面提供的审核、完成或重新打开操作继续。`
        );
        return;
      }
      if (task.status === "planned") {
        const started = await transitionLessonPreparationTask(
          task.taskRef,
          "start",
          {
            expectedVersion: task.version,
            purpose: "lesson-preparation.start",
            idempotencyKey: `ui:lesson-preparation:start:${crypto.randomUUID()}`
          }
        );
        task = started.task;
      }
      props.navigatePreparation(task.taskRef, "/agent");
    } catch (caught) {
      setError(errorMessage(caught));
      await loadRoot();
    } finally {
      setActing(false);
    }
  }

  async function runJourneyAction() {
    if (!journey || !selectedLesson) return;
    switch (journey.nextBestAction.kind) {
      case "start_preparation":
      case "continue_preparation":
        await startOrContinue();
        return;
      case "review_proposal":
        if (activeTask) props.navigatePreparation(activeTask.taskRef, "/copilot");
        return;
      case "review_teaching_plan":
        if (activeTask) props.navigatePreparation(activeTask.taskRef, "/teaching-plan");
        return;
      case "view_agent_run":
      case "recover_agent_run":
        if (activeTask) props.navigatePreparation(activeTask.taskRef, "/runs");
        return;
      case "prepare_materials":
        props.navigateFiles({ lessonRef: selectedLesson.lessonRef });
        return;
      case "record_delivery":
      case "confirm_delivery":
      case "start_reflection":
      case "review_reflection":
      case "choose_follow_up":
        document
          .getElementById("classroom-implementation")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      case "review_lesson_context":
      case "view_completed_journey":
        document
          .getElementById("lesson-readiness-title")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
    }
  }

  async function createNewPreparation() {
    if (!selectedLesson) return;
    setActing(true);
    setError(null);
    try {
      const created = await createLessonPreparationTask({
        lessonRef: selectedLesson.lessonRef,
        dueAt: selectedLesson.plannedAt,
        priority: "normal",
        purpose: "lesson-preparation.create",
        idempotencyKey: `ui:lesson-preparation:create:${crypto.randomUUID()}`
      });
      const started = await transitionLessonPreparationTask(
        created.task.taskRef,
        "start",
        {
          expectedVersion: created.task.version,
          purpose: "lesson-preparation.start",
          idempotencyKey: `ui:lesson-preparation:start:${crypto.randomUUID()}`
        }
      );
      props.navigatePreparation(started.task.taskRef, "/agent");
    } catch (caught) {
      setError(errorMessage(caught));
      await loadRoot();
    } finally {
      setActing(false);
    }
  }

  async function reopen() {
    if (!activeTask) return;
    setActing(true);
    setError(null);
    try {
      const result = await transitionLessonPreparationTask(
        activeTask.taskRef,
        "reopen",
        {
          expectedVersion: activeTask.version,
          purpose: "lesson-preparation.reopen",
          idempotencyKey: `ui:lesson-preparation:reopen:${crypto.randomUUID()}`
        }
      );
      props.navigatePreparation(result.task.taskRef, "/agent");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function cancelPreparation() {
    if (!activeTask) return;
    setActing(true);
    setError(null);
    try {
      const result = await transitionLessonPreparationTask(
        activeTask.taskRef,
        "cancel",
        {
          expectedVersion: activeTask.version,
          purpose: "lesson-preparation.cancel",
          idempotencyKey: `ui:lesson-preparation:cancel:${crypto.randomUUID()}`
        }
      );
      setTasks((current) =>
        current.map((task) =>
          task.taskRef === result.task.taskRef ? result.task : task
        )
      );
      props.onAction(
        "备课任务已取消；已批准教案、建议草稿和历史记录均未改变"
      );
    } catch (caught) {
      setError(errorMessage(caught));
      await loadRoot();
    } finally {
      setActing(false);
    }
  }

  const preparationStatus = activeTask?.status ?? selectedLesson?.preparationState;
  const readinessItems = selectedLesson
    ? [
        {
          key: "objectives",
          label: "教学目标",
          complete: selectedLesson.learningObjectives.length > 0,
          detail: selectedLesson.learningObjectives.length > 0
            ? `${selectedLesson.learningObjectives.length} 项目标已明确`
            : "还需要补充教学目标"
        },
        {
          key: "preparation",
          label: "备课任务",
          complete: preparationStatus === "completed",
          detail: preparationStatus
            ? lessonPreparationStatusLabel(preparationStatus)
            : "还没有开始备课"
        },
        {
          key: "plan",
          label: "批准教案",
          complete: Boolean(planState?.currentApproved),
          detail: planState?.currentApproved
            ? `第 ${planState.currentApproved.revisionNumber} 版已批准`
            : planState?.activeInReview
              ? `第 ${planState.activeInReview.revisionNumber} 版等待审核`
              : "还没有已批准教案"
        },
        {
          key: "files",
          label: "教学材料",
          complete: lessonFiles.length > 0,
          detail: lessonFiles.length > 0
            ? `${lessonFiles.length} 个文件可用`
            : "还没有关联教学材料"
        }
      ]
    : [];
  const completedReadinessCount = readinessItems.filter((item) => item.complete).length;
  const readinessPercent = readinessItems.length > 0
    ? Math.round((completedReadinessCount / readinessItems.length) * 100)
    : 0;
  const teachingFocus = planState?.currentApproved?.content.lessonFocus
    ?? selectedLesson?.learningObjectives[0]?.title
    ?? "选择课时后查看教学重点";
  const teachingDifficulty = planState?.currentApproved?.content.supportStrategy
    ?? selectedLesson?.learningObjectives[0]?.description
    ?? "选择课时后查看需要重点突破的内容";

  return (
    <Spin spinning={loading}>
      <div className="course-workspace course-workspace--lesson-preparation">
        {error ? (
          <Alert
            type="error"
            showIcon
            title="课程数据未能更新"
            description={error}
            closable
            onClose={() => setError(null)}
          />
        ) : null}
        {!selectedCourse ? (
          <Empty description="尚无可用课程" />
        ) : (
          <div className="lesson-workspace-layout">
            <Card className="workspace-card course-browser-card" variant="borderless">
              <header className="course-browser-heading">
                <div>
                  <Text className="section-kicker">当前课程</Text>
                  <Title level={3}>{selectedCourse.title}</Title>
                  <Paragraph>{selectedCourse.gradeLevel} · {selectedCourse.subject}</Paragraph>
                </div>
                <Tag>{units.length} 个单元</Tag>
              </header>
              <div className="unit-accordion" data-testid="unit-list">
                {units.map((unit) => {
                  const expanded = unit.unitRef === selectedUnitRef;
                  return (
                    <section key={unit.unitRef} className={expanded ? "unit-panel is-expanded" : "unit-panel"}>
                      <button
                        type="button"
                        className="unit-panel__trigger"
                        aria-expanded={expanded}
                        onClick={() => {
                          setSelectedUnitRef((current) => current === unit.unitRef ? null : unit.unitRef);
                        }}
                        data-testid={`unit-${unit.sequence}`}
                      >
                        <span className="unit-panel__number">{unit.sequence}</span>
                        <span className="unit-panel__copy">
                          <strong>{unit.title}</strong>
                          <small>{unit.description}</small>
                        </span>
                        <WorkspaceIcon name="chevron" />
                      </button>
                      {expanded ? (
                        <div className="lesson-list" data-testid="lesson-list">
                          {lessons.map((lesson) => (
                            <button
                              type="button"
                              key={lesson.lessonRef}
                              className={lesson.lessonRef === selectedLessonRef ? "is-active" : ""}
                              onClick={() => setSelectedLessonRef(lesson.lessonRef)}
                              data-testid={`lesson-${lesson.sequence}`}
                            >
                              <span className="lesson-list__sequence">第 {lesson.sequence} 课时</span>
                              <span className="lesson-list__title">{lesson.title}</span>
                              <span className="lesson-list__meta">{lesson.durationMinutes} 分钟 · {lessonPreparationStatusLabel(lesson.preparationState)}</span>
                              <WorkspaceIcon name="arrowRight" />
                            </button>
                          ))}
                          {lessons.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该单元还没有课时" /> : null}
                        </div>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            </Card>

            <Card
              className="workspace-card lesson-priority-card"
              variant="borderless"
              data-testid="lesson-detail"
            >
              {selectedLesson ? (
                <>
                  {journey ? (
                    <>
                      <LessonContextHeader
                        courseTitle={selectedCourse.title}
                        unitTitle={selectedUnit?.title ?? null}
                        lesson={selectedLesson}
                        journey={journey}
                      />
                      <LessonNextBestActionCard
                        journey={journey}
                        loading={acting}
                        onAction={() => void runJourneyAction()}
                      />
                      <LessonJourney journey={journey} />
                    </>
                  ) : (
                    <header className="lesson-detail-heading">
                      <div>
                        <Text className="section-kicker">第 {selectedLesson.sequence} 课时</Text>
                        <Title level={2}>{selectedLesson.title}</Title>
                      </div>
                      <Tag color="processing">正在整理本课进度</Tag>
                    </header>
                  )}

                  <section className="lesson-readiness" aria-labelledby="lesson-readiness-title">
                    <header>
                      <div>
                        <Text className="section-kicker">本课时准备度</Text>
                        <Title id="lesson-readiness-title" level={3}>已完成 {completedReadinessCount} 项，还需补齐 {readinessItems.length - completedReadinessCount} 项</Title>
                      </div>
                      <Progress type="circle" size={72} percent={readinessPercent} strokeWidth={9} />
                    </header>
                    <div className="lesson-readiness-grid">
                      {readinessItems.map((item) => (
                        <article key={item.key} className={item.complete ? "is-complete" : "is-pending"}>
                          <span className="readiness-icon"><WorkspaceIcon name={item.complete ? "check" : "clock"} /></span>
                          <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                        </article>
                      ))}
                    </div>
                    <div className="lesson-artifact-actions" data-testid="lesson-related-files">
                      {activeTask ? (
                        <Button onClick={() => props.navigatePreparation(activeTask.taskRef, "/teaching-plan")}>查看备课与教案</Button>
                      ) : null}
                      {lessonFiles.map((file) => (
                        <Button
                          key={file.assetRef}
                          icon={<WorkspaceIcon name="document" />}
                          onClick={() => void openFilePreview(file)}
                          onDoubleClick={() => props.navigateFiles({ assetRef: file.assetRef, lessonRef: selectedLesson.lessonRef })}
                          title="单击预览，双击进入文件库"
                        >
                          {file.displayName} · 第 {file.currentVersion.versionNumber} 版
                        </Button>
                      ))}
                      <Button onClick={() => props.navigateFiles({ lessonRef: selectedLesson.lessonRef })}>打开本课时文件</Button>
                    </div>
                  </section>

                  <section className="lesson-focus-section">
                    <Text className="section-kicker">课堂核心</Text>
                    <Title level={3}>重点与难点</Title>
                    <div className="lesson-focus-grid">
                      <article><span>教学重点</span><strong>{teachingFocus}</strong></article>
                      <article><span>教学难点</span><strong>{teachingDifficulty}</strong></article>
                    </div>
                    <details className="lesson-objectives">
                      <summary>查看 {selectedLesson.learningObjectives.length} 项教学目标</summary>
                      {selectedLesson.learningObjectives.map((objective) => (
                        <Paragraph key={objective.objectiveRef}><strong>{objective.title}</strong><br />{objective.description}</Paragraph>
                      ))}
                    </details>
                  </section>

                  <section className="lesson-linked-work" data-testid="lesson-related-assignments">
                    <div>
                      <Text className="section-kicker">课后衔接</Text>
                      <Title level={4}>作业与学习情况</Title>
                      <Paragraph type="secondary">
                        {lessonAssignments.length > 0
                          ? `${lessonAssignments.length} 份关联作业，可继续查看提交、批改与共性问题。`
                          : "当前课时还没有作业，可创建草稿后由教师审核发布。"}
                      </Paragraph>
                    </div>
                    <Button onClick={props.onOpenAssignments} data-testid="open-lesson-assignments">
                      {lessonAssignments.length > 0 ? "查看作业与批改" : "创建本课时作业"}
                    </Button>
                  </section>

                  <Space wrap className="lesson-primary-actions">
                    {!activeTask ||
                    ["planned", "in_progress"].includes(
                      activeTask.status
                    ) ? (
                      <Button
                        type="primary"
                        loading={acting}
                        onClick={startOrContinue}
                        data-testid="start-lesson-preparation"
                      >
                        {activeTask ? "继续备课" : "开始备课"}
                      </Button>
                    ) : null}
                    {activeTask?.status === "awaiting_plan_review" ? (
                      <Button
                        type="primary"
                        onClick={() =>
                          props.navigatePreparation(
                            activeTask.taskRef,
                            "/teaching-plan"
                          )
                        }
                        data-testid="continue-plan-review"
                      >
                        继续审核教学计划
                      </Button>
                    ) : null}
                    {activeTask?.status === "ready_for_use" ? (
                      <Button
                        type="primary"
                        onClick={() =>
                          props.navigatePreparation(
                            activeTask.taskRef,
                            "/teaching-plan"
                          )
                        }
                        data-testid="finish-ready-preparation"
                      >
                        查看计划并完成备课
                      </Button>
                    ) : null}
                    {activeTask?.status === "completed" ? (
                      <Button
                        type="primary"
                        onClick={() =>
                          props.navigatePreparation(
                            activeTask.taskRef,
                            "/teaching-plan"
                          )
                        }
                      >
                        查看已完成备课
                      </Button>
                    ) : null}
                    {activeTask &&
                    ["ready_for_use", "completed", "cancelled"].includes(
                      activeTask.status
                    ) ? (
                      <Button
                        loading={acting}
                        onClick={reopen}
                        data-testid="reopen-lesson-preparation"
                      >
                        重新打开并修改
                      </Button>
                    ) : null}
                    {activeTask &&
                    ["completed", "cancelled"].includes(
                      activeTask.status
                    ) ? (
                      <Button
                        loading={acting}
                        onClick={createNewPreparation}
                        data-testid="create-new-lesson-preparation"
                      >
                        新建一轮备课
                      </Button>
                    ) : null}
                    {activeTask ? (
                      <Button
                        onClick={() =>
                          props.navigatePreparation(
                            activeTask.taskRef,
                            "/teaching-plan"
                          )
                        }
                      >
                        查看计划与历史
                      </Button>
                    ) : null}
                    {activeTask &&
                    [
                      "planned",
                      "in_progress",
                      "awaiting_plan_review",
                      "ready_for_use"
                    ].includes(activeTask.status) ? (
                      <Popconfirm
                        title="确认取消这次备课？"
                        description="只取消本次备课任务，不删除建议、教案或文件历史。"
                        okText="确认取消"
                        cancelText="保留任务"
                        onConfirm={() => void cancelPreparation()}
                      >
                        <Button danger disabled={acting}>
                          取消备课
                        </Button>
                      </Popconfirm>
                    ) : null}
                  </Space>
                  {selectedCourse && planState ? (
                    <details
                      id="classroom-implementation"
                      className="lesson-reflection-details"
                      open={Boolean(props.initialLessonRef)}
                    >
                      <summary>课堂实施、观察与课后反思</summary>
                      <ClassroomReflectionPanel
                        lesson={selectedLesson}
                        courseRunRef={selectedCourse.courseRunRef}
                        planState={planState}
                        assignmentRefs={lessonAssignments.map((item) => item.assignmentRef)}
                        navigateReflection={props.navigateReflection}
                        onAction={props.onAction}
                      />
                    </details>
                  ) : null}
                </>
              ) : (
                <div className="lesson-empty-state">
                  <WorkspaceIcon name="course" />
                  <Title level={3}>{selectedUnitRef ? "请选择一个课时" : "先选择一个单元"}</Title>
                  <Paragraph type="secondary">
                    {selectedUnitRef
                      ? "选择课时后，即可查看准备进度、教学重点和可用成果。"
                      : "展开单元后选择课时，即可查看准备进度、教学重点和可用成果。"}
                  </Paragraph>
                </div>
              )}
            </Card>
          </div>
        )}
        <Modal
          open={previewOpen}
          title={previewFile?.displayName ?? "文件预览"}
          onCancel={closeFilePreview}
          width={760}
          footer={previewFile && selectedLesson ? [
            <Button key="library" type="primary" onClick={() => props.navigateFiles({ assetRef: previewFile.assetRef, lessonRef: selectedLesson.lessonRef })}>在文件库中查看</Button>,
            <Button key="close" onClick={closeFilePreview}>关闭</Button>
          ] : null}
        >
          <Spin spinning={previewLoading}>
            {previewFile ? (
              <div className="lesson-file-preview">
                <p>{previewFile.currentVersion.contentSummary ? cleanDisplayText(previewFile.currentVersion.contentSummary) : "暂无文字摘要"}</p>
                {previewFile.currentVersion.previewKind === "image" && previewUrl ? <img src={previewUrl} alt={previewFile.displayName} /> : null}
                {previewFile.currentVersion.previewKind === "pdf" && previewUrl ? <iframe title={`${previewFile.displayName} 预览`} src={previewUrl} /> : null}
                {previewFile.currentVersion.previewKind === "text" && previewText !== null ? <pre>{previewText}</pre> : null}
                {previewFile.currentVersion.previewKind === "office" ? <Alert type="info" showIcon title="可查看文件详情并下载" description="办公文档暂不在浏览器内完整渲染，请进入文件库查看版本或下载。" /> : null}
              </div>
            ) : null}
          </Spin>
        </Modal>
      </div>
    </Spin>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}
