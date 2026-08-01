import { useEffect, useMemo, useState } from "react";

import type {
  CourseRunView,
  CurriculumUnitView,
  FileAssetSummary,
  LessonPreparationTaskSummary,
  LessonTeachingPlanState,
  LessonView
} from "@edu-agent/contracts";
import {
  Alert,
  Button,
  Card,
  Empty,
  Space,
  Spin,
  Tag,
  Typography
} from "antd";

import {
  createLessonPreparationTask,
  loadCourseRuns,
  loadCurriculumUnits,
  loadLessonPreparationTasks,
  loadLessons,
  loadLessonTeachingPlans,
  loadFiles,
  transitionLessonPreparationTask
} from "../api";
import {
  ExamWorkspace,
  HomeworkWorkspace
} from "../components/portal/TeachingComponents";
import { PageHeader } from "../components/portal/PortalPrimitives";
import type { AppRoute } from "../route";

const { Paragraph, Text, Title } = Typography;
type TeachingTab = "course" | "homework" | "exam";

export function TeachingWorkspacePage(props: {
  navigate: (route: AppRoute) => void;
  navigatePreparation: (
    taskRef: string,
    destination?: "/agent" | "/copilot" | "/teaching-plan" | "/runs"
  ) => void;
  initialLessonRef?: string | null;
  initialTab?: TeachingTab;
  onAction: (message: string) => void;
}) {
  const [tab, setTab] = useState<TeachingTab>(
    props.initialTab ?? "course"
  );
  const handleReadOnlyAction = (action: string) => {
    props.onAction(
      `${action}：此区域是明确标注的只读演示，本 Gate 不写入文件、作业或考试数据。`
    );
  };

  return (
    <div
      className="portal-page teaching-page"
      data-testid="teaching-page"
    >
      <PageHeader
        title="教学"
        subtitle="课程、课时与备课状态来自 PostgreSQL；作业和考试仍为只读演示"
      />
      <div
        className="teaching-tabs"
        role="tablist"
        aria-label="教学工作区"
      >
        {([
          ["course", "课程", "真实单元、课时、目标与备课任务"],
          ["homework", "作业", "只读演示"],
          ["exam", "考试", "只读演示"]
        ] as const).map(([value, label, description]) => (
          <button
            type="button"
            role="tab"
            key={value}
            aria-selected={tab === value}
            className={tab === value ? "is-active" : ""}
            onClick={() => setTab(value)}
          >
            <strong>{label}</strong>
            <span>{description}</span>
          </button>
        ))}
      </div>
      {tab === "course" ? (
        <RealCourseWorkspace
          navigate={props.navigate}
          navigatePreparation={props.navigatePreparation}
          {...(props.initialLessonRef !== undefined
            ? { initialLessonRef: props.initialLessonRef }
            : {})}
        />
      ) : null}
      {tab === "homework" ? (
        <HomeworkWorkspace onAction={handleReadOnlyAction} />
      ) : null}
      {tab === "exam" ? (
        <ExamWorkspace onAction={handleReadOnlyAction} />
      ) : null}
    </div>
  );
}

function RealCourseWorkspace(props: {
  navigate: (route: AppRoute) => void;
  navigatePreparation: (
    taskRef: string,
    destination?: "/agent" | "/copilot" | "/teaching-plan" | "/runs"
  ) => void;
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
  const [lessonFiles, setLessonFiles] = useState<FileAssetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCourse = courses[0] ?? null;
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
      if (unit) {
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
    if (!selectedUnitRef) return;
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
          return (
            result.items.find((lesson) => lesson.sequence === 3)
              ?.lessonRef ??
            result.items[0]?.lessonRef ??
            null
          );
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
      })
    ])
      .then(([result, files]) => {
        if (active) {
          setPlanState(result);
          setLessonFiles(files.items);
        }
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, [selectedLessonRef, tasks]);

  async function startOrContinue() {
    if (!selectedLesson) return;
    setActing(true);
    setError(null);
    try {
      let task = activeTask;
      if (
        !task ||
        task.status === "completed" ||
        task.status === "cancelled"
      ) {
        const created = await createLessonPreparationTask({
          lessonRef: selectedLesson.lessonRef,
          dueAt: selectedLesson.plannedAt,
          priority: "normal",
          purpose: "lesson-preparation.create",
          idempotencyKey: `ui:lesson-preparation:create:${crypto.randomUUID()}`
        });
        task = created.task;
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
          <div className="page-grid">
            <Card className="workspace-card" variant="borderless">
              <Text className="section-kicker">当前课程</Text>
              <Title level={3}>{selectedCourse.title}</Title>
              <Paragraph>
                {selectedCourse.gradeLevel} ·{" "}
                {selectedCourse.subject}
              </Paragraph>
              <div className="course-list">
                {units.map((unit) => (
                  <button
                    type="button"
                    key={unit.unitRef}
                    className={
                      unit.unitRef === selectedUnitRef
                        ? "is-active"
                        : ""
                    }
                    onClick={() =>
                      setSelectedUnitRef(unit.unitRef)
                    }
                    data-testid={`unit-${unit.sequence}`}
                  >
                    <strong>
                      第 {unit.sequence} 单元 · {unit.title}
                    </strong>
                    <small>{unit.description}</small>
                  </button>
                ))}
              </div>
              <div className="course-list" data-testid="lesson-list">
                {lessons.map((lesson) => (
                  <button
                    type="button"
                    key={lesson.lessonRef}
                    className={
                      lesson.lessonRef === selectedLessonRef
                        ? "is-active"
                        : ""
                    }
                    onClick={() =>
                      setSelectedLessonRef(lesson.lessonRef)
                    }
                    data-testid={`lesson-${lesson.sequence}`}
                  >
                    <strong>
                      {lesson.sequence}. {lesson.title}
                    </strong>
                    <Tag>
                      {preparationStatusLabel(
                        lesson.preparationState
                      )}
                    </Tag>
                  </button>
                ))}
              </div>
            </Card>

            <Card
              className="workspace-card"
              variant="borderless"
              data-testid="lesson-detail"
            >
              {selectedLesson ? (
                <>
                  <Text className="section-kicker">课时详情</Text>
                  <Title level={2}>{selectedLesson.title}</Title>
                  <Space wrap>
                    <Tag>
                      {selectedLesson.durationMinutes} 分钟
                    </Tag>
                    <Tag color="processing">
                      {preparationStatusLabel(
                        activeTask?.status ??
                          selectedLesson.preparationState
                      )}
                    </Tag>
                  </Space>
                  <section>
                    <Title level={4}>教学目标</Title>
                    {selectedLesson.learningObjectives.map(
                      (objective) => (
                        <Paragraph key={objective.objectiveRef}>
                          <strong>{objective.title}</strong>
                          <br />
                          {objective.description}
                        </Paragraph>
                      )
                    )}
                  </section>
                  <section>
                    <Title level={4}>当前 Evidence</Title>
                    <Space wrap>
                      {selectedLesson.currentEvidenceRefs.map(
                        (reference) => (
                          <Tag key={reference}>{reference}</Tag>
                        )
                      )}
                    </Space>
                  </section>
                  <section>
                    <Title level={4}>教学计划状态</Title>
                    <Paragraph>
                      current approved：
                      {planState?.currentApproved
                        ? `第 ${planState.currentApproved.revisionNumber} 版`
                        : "无"}
                    </Paragraph>
                    <Paragraph>
                      active in-review：
                      {planState?.activeInReview
                        ? `第 ${planState.activeInReview.revisionNumber} 版`
                        : "无"}
                    </Paragraph>
                  </section>
                  <section>
                    <Title level={4}>关联备课 Task</Title>
                    {activeTask ? (
                      <Paragraph>
                        {activeTask.title} ·{" "}
                        {preparationStatusLabel(
                          activeTask.status
                        )}{" "}
                        · v{activeTask.version}
                      </Paragraph>
                    ) : (
                      <Paragraph type="secondary">
                        当前课时没有未完成的备课任务。
                      </Paragraph>
                    )}
                  </section>
                  <section data-testid="lesson-related-files">
                    <Title level={4}>关联教学文件</Title>
                    {lessonFiles.length > 0 ? (
                      <Space orientation="vertical" size="small">
                        {lessonFiles.map((file) => (
                          <Button
                            key={file.assetRef}
                            onClick={() => props.navigate("/files")}
                          >
                            {file.displayName} · v{file.currentVersion.versionNumber}
                          </Button>
                        ))}
                      </Space>
                    ) : (
                      <Paragraph type="secondary">
                        尚无参考文件或已批准教案导出。
                      </Paragraph>
                    )}
                  </section>
                  <Space wrap>
                    <Button
                      type="primary"
                      loading={acting}
                      onClick={startOrContinue}
                      data-testid="start-lesson-preparation"
                    >
                      {activeTask &&
                      activeTask.status !== "completed" &&
                      activeTask.status !== "cancelled"
                        ? "继续备课"
                        : "开始备课"}
                    </Button>
                    {activeTask?.status === "completed" ? (
                      <Button
                        loading={acting}
                        onClick={reopen}
                        data-testid="reopen-lesson-preparation"
                      >
                        显式重新打开
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
                    <Button
                      onClick={() => props.navigate("/files")}
                    >
                      打开文件
                    </Button>
                  </Space>
                  <Alert
                    type="info"
                    showIcon
                    title="文件与 TeachingPlan 状态保持独立"
                    description="参考文件和正式 DOCX 由 Artifact/File 服务持久化；只有 approved Revision 才能导出正式教学成果。"
                  />
                </>
              ) : (
                <Empty description="请选择课时" />
              )}
            </Card>
          </div>
        )}
      </div>
    </Spin>
  );
}

function preparationStatusLabel(status: string): string {
  return {
    not_started: "未开始",
    planned: "已计划",
    in_progress: "备课中",
    awaiting_plan_review: "待审核",
    ready_for_use: "已准备，待完成",
    completed: "已准备",
    cancelled: "已取消"
  }[status] ?? status;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}
