import { useEffect, useMemo, useRef, useState } from "react";

import type {
  AssignmentSummary,
  CourseRunView,
  CurriculumUnitView,
  FileAssetDetail,
  FileAssetSummary,
  LessonBriefSnapshot,
  LessonJourneyProjection,
  MaterialBundleItem,
  MaterialBundleProjection,
  MaterialKind,
  ModelExecutionView,
  LessonPreparationTaskSummary,
  LessonTeachingPlanState,
  LessonView,
  ProposalReviewDetail
} from "@edu-agent/contracts";
import {
  Alert,
  Button,
  Card,
  Drawer,
  Empty,
  Input,
  Modal,
  Spin,
  Typography
} from "antd";

import {
  approveTeachingPlan,
  createModelInvocation,
  createLessonPreparationTask,
  decideLessonBrief,
  adoptLessonMaterial,
  disposeSuggestion,
  downloadFile,
  loadAssignments,
  loadCourseRuns,
  loadCurriculumUnits,
  loadLessonPreparationTasks,
  loadLessonPreparationTask,
  loadLessonBrief,
  loadLessonJourney,
  loadLessonMaterialBundle,
  loadLessons,
  loadLessonTeachingPlans,
  loadModelInvocation,
  loadProposalDetail,
  loadWorkspace,
  generateLessonBrief,
  generateLessonMaterialBundle,
  loadFile,
  transitionLessonPreparationTask
} from "../api";
import { AssignmentWorkspace } from "./AssignmentWorkspace";
import { ClassroomReflectionPanel } from "../components/portal/ClassroomReflectionPanel";
import {
  cleanDisplayText,
  cleanTeacherPreviewText,
  lessonPreparationStatusLabel
} from "../presentation";
import { WorkspaceIcon, type WorkspaceIconName } from "../components/WorkspaceIcon";
import { LessonBriefPanel } from "../components/teaching/LessonBriefPanel";
import { PreparationProposalPanel } from "../components/teaching/PreparationProposalPanel";
import { MaterialBundlePanel } from "../components/teaching/MaterialBundlePanel";

const { Paragraph, Text, Title } = Typography;
type TeachingTab = "course" | "homework";
type CourseWorkspaceView = "current" | "map" | "evidence";
type TeacherStage = "prepare" | "deliver" | "reflect";
type LessonDrawerMode = "context" | "progress" | "preparation" | null;
const terminalModelExecutionStatuses = new Set<ModelExecutionView["status"]>([
  "succeeded",
  "retryable_failed",
  "permanently_failed",
  "timed_out",
  "budget_exceeded",
  "validation_failed",
  "cancelled"
]);

export function TeachingWorkspacePage(props: {
  navigatePreparation: (
    taskRef: string,
    destination?: "/agent" | "/copilot" | "/teaching-plan" | "/runs"
  ) => void;
  navigateFiles: (context?: {
    assetRef?: string;
    lessonRef?: string;
  }) => void;
  navigateCourseOverview: () => void;
  navigateLesson: (lessonRef: string) => void;
  navigateReflection: (reflectionRef: string) => void;
  initialLessonRef?: string | null;
  initialTab?: TeachingTab;
  onAction: (message: string) => void;
}) {
  const [view, setView] = useState<CourseWorkspaceView>(
    props.initialTab === "homework" ? "evidence" : "current"
  );
  return (
    <div
      className="portal-page teaching-page"
      data-testid="teaching-page"
    >
      <header className="course-os-viewbar">
        <nav
          className="course-os-view-switcher"
          role="tablist"
          aria-label="课程工作区视角"
          data-testid="course-workspace-views"
        >
        {([
          ["current", "进行中"],
          ["map", "课时地图"],
          ["evidence", "作业与证据"]
        ] as const).map(([value, label]) => (
          <button
            type="button"
            role="tab"
            key={value}
            aria-selected={view === value}
            className={view === value ? "is-active" : ""}
            onClick={() => setView(value)}
          >
            <strong>{label}</strong>
          </button>
        ))}
        </nav>
      </header>
      {view !== "evidence" ? (
        <RealCourseWorkspace
          view={view}
          onOpenView={setView}
          navigateFiles={props.navigateFiles}
          navigateCourseOverview={props.navigateCourseOverview}
          navigateLesson={props.navigateLesson}
          navigatePreparation={props.navigatePreparation}
          navigateReflection={props.navigateReflection}
          onOpenAssignments={() => setView("evidence")}
          onAction={props.onAction}
          {...(props.initialLessonRef !== undefined
            ? { initialLessonRef: props.initialLessonRef }
            : {})}
        />
      ) : null}
      {view === "evidence" ? (
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
  view: Exclude<CourseWorkspaceView, "evidence">;
  onOpenView: (view: CourseWorkspaceView) => void;
  navigatePreparation: (
    taskRef: string,
    destination?: "/agent" | "/copilot" | "/teaching-plan" | "/runs"
  ) => void;
  navigateFiles: (context?: {
    assetRef?: string;
    lessonRef?: string;
  }) => void;
  navigateCourseOverview: () => void;
  navigateLesson: (lessonRef: string) => void;
  navigateReflection: (reflectionRef: string) => void;
  onAction: (message: string) => void;
  onOpenAssignments: () => void;
  initialLessonRef?: string | null;
}) {
  const [courses, setCourses] = useState<CourseRunView[]>([]);
  const [selectedCourseRef, setSelectedCourseRef] = useState<string | null>(null);
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
  const [lessonBrief, setLessonBrief] =
    useState<LessonBriefSnapshot | null>(null);
  const [materialBundle, setMaterialBundle] =
    useState<MaterialBundleProjection | null>(null);
  const [preparationProposal, setPreparationProposal] =
    useState<ProposalReviewDetail | null>(null);
  const [modelExecution, setModelExecution] =
    useState<ModelExecutionView | null>(null);
  const [modelExecutionRef, setModelExecutionRef] =
    useState<string | null>(null);
  const [lessonAssignments, setLessonAssignments] = useState<AssignmentSummary[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileAssetDetail | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewMaterialKind, setPreviewMaterialKind] = useState<MaterialKind | null>(null);
  const [materialAdjustment, setMaterialAdjustment] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleStage, setVisibleStage] = useState<TeacherStage>("prepare");
  const [drawerMode, setDrawerMode] = useState<LessonDrawerMode>(null);
  const [lessonWorkspaceOpen, setLessonWorkspaceOpen] = useState(Boolean(props.initialLessonRef));
  const manuallySelectedStageForLesson = useRef<string | null>(null);

  const selectedCourse =
    courses.find((course) => course.courseRunRef === selectedCourseRef) ?? null;
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
  const openTask = lessonTasks.find(
    (task) =>
      task.status !== "completed" &&
      task.status !== "cancelled"
  ) ?? null;
  const activeTask =
    openTask ??
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
      setSelectedCourseRef((current) =>
        current && courseResult.items.some((course) => course.courseRunRef === current)
          ? current
          : courseResult.items[0]?.courseRunRef ?? null
      );
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
    setLessonWorkspaceOpen(Boolean(props.initialLessonRef));
  }, [props.initialLessonRef]);

  useEffect(() => {
    if (!selectedCourseRef) {
      setUnits([]);
      setLessons([]);
      setSelectedUnitRef(null);
      setSelectedLessonRef(null);
      return;
    }
    let active = true;
    setLoading(true);
    void loadCurriculumUnits(selectedCourseRef)
      .then(async (unitResult) => {
        const lessonResults = await Promise.all(
          unitResult.items.map((unit) => loadLessons(unit.unitRef))
        );
        if (!active) return;
        const nextLessons = lessonResults.flatMap((result) => result.items);
        setUnits(unitResult.items);
        setLessons(nextLessons);
        const routedLesson = nextLessons.find(
          (lesson) => lesson.lessonRef === props.initialLessonRef
        );
        const defaultLesson = routedLesson ?? chooseCurrentLesson(nextLessons);
        const defaultUnitRef = defaultLesson?.unitRef ?? unitResult.items[0]?.unitRef ?? null;
        setSelectedUnitRef((current) =>
          current && unitResult.items.some((unit) => unit.unitRef === current)
            ? current
            : defaultUnitRef
        );
        setSelectedLessonRef((current) => {
          if (defaultLesson) return defaultLesson.lessonRef;
          if (
            current &&
            nextLessons.some(
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
  }, [props.initialLessonRef, selectedCourseRef]);

  useEffect(() => {
    setPreparationProposal(null);
    setModelExecution(null);
    setModelExecutionRef(null);
    setDrawerMode(null);
  }, [selectedLessonRef]);

  useEffect(() => {
    if (manuallySelectedStageForLesson.current !== selectedLessonRef) {
      setVisibleStage(stageFromJourney(journey));
    }
  }, [journey?.currentStage, selectedLessonRef]);

  useEffect(() => {
    manuallySelectedStageForLesson.current = null;
  }, [selectedLessonRef]);

  useEffect(() => {
    if (!selectedLessonRef) {
      setPlanState(null);
      setJourney(null);
      setLessonBrief(null);
      setMaterialBundle(null);
      return;
    }
    let active = true;
    void Promise.all([
      loadLessonTeachingPlans(selectedLessonRef),
      loadAssignments(selectedLessonRef),
      loadLessonJourney(selectedLessonRef),
      loadLessonBrief(selectedLessonRef),
      loadLessonMaterialBundle(selectedLessonRef)
    ])
      .then(async ([result, assignments, journeyResult, briefState, bundle]) => {
        const proposalRef = journeyResult.sourceRefs.find(
          (source) => source.kind === "proposal"
        )?.ref;
        const proposal = proposalRef
          ? await loadProposalDetail(proposalRef)
          : null;
        if (active) {
          setPlanState(result);
          setLessonAssignments(assignments.items);
          setJourney(journeyResult);
          setLessonBrief(briefState.current);
          setMaterialBundle(bundle);
          setPreparationProposal(proposal);
        }
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, [selectedLessonRef, tasks]);

  useEffect(() => {
    if (!modelExecutionRef || !selectedLessonRef) return;
    let active = true;
    let timer: number | undefined;
    const refresh = async () => {
      try {
        const execution = await loadModelInvocation(modelExecutionRef);
        if (!active) return;
        setModelExecution(execution);
        if (execution.status === "succeeded" && execution.proposalRevisionRef) {
          const proposal = await loadProposalDetail(execution.proposalRevisionRef);
          if (!active) return;
          setPreparationProposal(proposal);
          await refreshLessonPlanState();
          await loadRoot();
          props.onAction("教学方案已生成，请比较后决定");
          return;
        }
        if (!terminalModelExecutionStatuses.has(execution.status)) {
          timer = window.setTimeout(refresh, 500);
        }
      } catch (caught) {
        if (active) setError(errorMessage(caught));
      }
    };
    void refresh();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [modelExecutionRef, selectedLessonRef]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function openFilePreview(file: Pick<FileAssetSummary, "assetRef">) {
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
          setPreviewText(cleanTeacherPreviewText(await blob.text()));
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
    setPreviewMaterialKind(null);
    setMaterialAdjustment("");
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }

  async function generateMaterials(
    kinds: MaterialKind[],
    teacherAdjustment: string | null
  ) {
    if (
      !selectedLesson ||
      !materialBundle?.approvedTeachingPlanRevisionRef
    ) {
      setError("请先批准本课教学计划，再生成教学材料。");
      return;
    }
    setActing(true);
    setError(null);
    try {
      const expectedAssetVersions = Object.fromEntries(
        materialBundle.items
          .filter(
            (item) =>
              kinds.includes(item.kind) &&
              item.generatedBySkillRef === "material-generation@1" &&
              item.assetVersion
          )
          .map((item) => [item.kind, item.assetVersion!])
      );
      const result = await generateLessonMaterialBundle(
        selectedLesson.lessonRef,
        {
          purpose: "material-bundle.generate",
          idempotencyKey: `ui:material-bundle:generate:${crypto.randomUUID()}`,
          expectedApprovedTeachingPlanRevisionRef:
            materialBundle.approvedTeachingPlanRevisionRef,
          kinds,
          expectedAssetVersions,
          teacherAdjustment
        }
      );
      setMaterialBundle(result.bundle);
      setJourney(await loadLessonJourney(selectedLesson.lessonRef));
      props.onAction(
        teacherAdjustment
          ? "已只更新所选材料，并保留原 FileVersion。"
          : "教学材料草稿已生成，请预览后逐项采用。"
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function adoptMaterial(item: MaterialBundleItem) {
    if (
      !selectedLesson ||
      !materialBundle?.approvedTeachingPlanRevisionRef ||
      !item.assetVersion ||
      !item.versionRef
    ) {
      return;
    }
    setActing(true);
    setError(null);
    try {
      const result = await adoptLessonMaterial(
        selectedLesson.lessonRef,
        item.kind,
        {
          purpose: "material-bundle.adopt",
          idempotencyKey: `ui:material-bundle:adopt:${crypto.randomUUID()}`,
          expectedApprovedTeachingPlanRevisionRef:
            materialBundle.approvedTeachingPlanRevisionRef,
          expectedAssetVersion: item.assetVersion,
          expectedVersionRef: item.versionRef
        }
      );
      setMaterialBundle(result.bundle);
      setJourney(await loadLessonJourney(selectedLesson.lessonRef));
      props.onAction(`${item.label}已采用，并加入当前教学方案。`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function downloadMaterial(item: MaterialBundleItem) {
    if (!item.assetRef || !item.versionRef || !item.originalFileName) return;
    try {
      const blob = await downloadFile(item.assetRef, item.versionRef);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = item.originalFileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function startOrContinue() {
    if (!selectedLesson) return;
    setActing(true);
    setError(null);
    try {
      let task = openTask;
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

  async function refreshBriefAndJourney() {
    if (!selectedLesson) return;
    const [briefState, journeyState] = await Promise.all([
      loadLessonBrief(selectedLesson.lessonRef),
      loadLessonJourney(selectedLesson.lessonRef)
    ]);
    setLessonBrief(briefState.current);
    setJourney(journeyState);
  }

  async function refreshLessonPlanState() {
    if (!selectedLesson) return;
    const [plans, journeyState, bundle] = await Promise.all([
      loadLessonTeachingPlans(selectedLesson.lessonRef),
      loadLessonJourney(selectedLesson.lessonRef),
      loadLessonMaterialBundle(selectedLesson.lessonRef)
    ]);
    setPlanState(plans);
    setJourney(journeyState);
    setMaterialBundle(bundle);
    const proposalRef = journeyState.sourceRefs.find(
      (source) => source.kind === "proposal"
    )?.ref;
    setPreparationProposal(
      proposalRef ? await loadProposalDetail(proposalRef) : null
    );
  }

  async function ensurePreparationTaskForGeneration() {
    if (!selectedLesson) throw new Error("请先选择课时。");
    let task = openTask
      ? await loadLessonPreparationTask(openTask.taskRef)
      : (await createLessonPreparationTask({
          lessonRef: selectedLesson.lessonRef,
          dueAt: selectedLesson.plannedAt,
          priority: "normal",
          purpose: "lesson-preparation.create",
          idempotencyKey: `ui:lesson-preparation:create:${crypto.randomUUID()}`
        })).task;
    if (task.status === "planned") {
      task = (await transitionLessonPreparationTask(task.taskRef, "start", {
        expectedVersion: task.version,
        purpose: "lesson-preparation.start",
        idempotencyKey: `ui:lesson-preparation:start:${crypto.randomUUID()}`
      })).task;
    }
    if (task.status !== "in_progress") {
      throw new Error(
        `当前备课任务为“${lessonPreparationStatusLabel(task.status)}”，请先完成当前审核或显式重新打开。`
      );
    }
    return task;
  }

  async function queueTeachingPlan(
    requestText: string | null,
    taskInput?: Awaited<ReturnType<typeof ensurePreparationTaskForGeneration>>
  ) {
    const task = taskInput ?? await ensurePreparationTaskForGeneration();
    const workspace = await loadWorkspace();
    const queued = await createModelInvocation({
      requestText: requestText ?? preparationRequestFromBrief(lessonBrief),
      courseRunRef: task.workingSet.courseRunRef,
      goalRef: workspace.goal.goalRef,
      learningObjectiveRefs: task.workingSet.learningObjectiveRefs,
      selectedEvidenceRefs: task.workingSet.evidenceRefs,
      requestVersion: 1,
      purpose: "teacher-copilot.adjust-next-lesson",
      idempotencyKey: `ui:lesson-journey:plan:${crypto.randomUUID()}`,
      preparationTaskRef: task.taskRef,
      curriculumUnitRef: task.curriculumUnitRef,
      lessonRef: task.lessonRef,
      workingSetVersion: task.workingSet.version,
      expectedPreparationTaskVersion: task.version
    });
    setPreparationProposal(null);
    setModelExecution(queued.execution);
    setModelExecutionRef(queued.execution.modelExecutionRef);
    setJourney(await loadLessonJourney(task.lessonRef));
  }

  async function generateTeachingPlan(requestText: string | null) {
    if (!selectedLesson || lessonBrief?.status !== "adopted") {
      setError("请先采用本课教学洞察，再生成教学方案。");
      return;
    }
    setActing(true);
    setError(null);
    try {
      await queueTeachingPlan(requestText);
      props.onAction("已提交教学方案生成任务");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function acceptPreparationProposal(strategyId: string) {
    if (!preparationProposal) return;
    setActing(true);
    setError(null);
    try {
      await disposeSuggestion(preparationProposal.proposalRevisionRef, {
        purpose: "teacher-copilot.review-suggestion",
        idempotencyKey: `ui:lesson-journey:accept:${crypto.randomUUID()}`,
        disposition: "accepted",
        selectedStrategyId: strategyId,
        teacherEdits: {},
        expectedProposalRevisionNumber:
          preparationProposal.proposalRevisionNumber
      });
      setPreparationProposal(
        await loadProposalDetail(preparationProposal.proposalRevisionRef)
      );
      await refreshLessonPlanState();
      props.onAction("方案已采用并进入教学计划审核，尚未批准");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function rejectPreparationProposal(strategyId: string) {
    if (!preparationProposal) return;
    setActing(true);
    setError(null);
    try {
      await disposeSuggestion(preparationProposal.proposalRevisionRef, {
        purpose: "teacher-copilot.review-suggestion",
        idempotencyKey: `ui:lesson-journey:reject:${crypto.randomUUID()}`,
        disposition: "rejected",
        selectedStrategyId: strategyId,
        teacherEdits: {},
        expectedProposalRevisionNumber:
          preparationProposal.proposalRevisionNumber
      });
      setPreparationProposal(null);
      setModelExecution(null);
      setModelExecutionRef(null);
      await loadRoot();
      await refreshLessonPlanState();
      props.onAction("已拒绝本次方案，未形成正式教学方案");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function adjustPreparationProposal(
    strategyId: string,
    adjustment: string
  ) {
    if (!preparationProposal) return;
    setActing(true);
    setError(null);
    try {
      await disposeSuggestion(preparationProposal.proposalRevisionRef, {
        purpose: "teacher-copilot.review-suggestion",
        idempotencyKey: `ui:lesson-journey:adjust:${crypto.randomUUID()}`,
        disposition: "deferred",
        selectedStrategyId: strategyId,
        teacherEdits: {},
        note: `教师要求调整：${adjustment}`,
        expectedProposalRevisionNumber:
          preparationProposal.proposalRevisionNumber
      });
      const task = openTask
        ? await loadLessonPreparationTask(openTask.taskRef)
        : await ensurePreparationTaskForGeneration();
      await queueTeachingPlan(adjustment, task);
      props.onAction("已保留上一版方案，并按你的说明重新生成");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function approveInReviewPlan() {
    const inReview = planState?.activeInReview;
    if (!inReview || !openTask) return;
    setActing(true);
    setError(null);
    try {
      const task = await loadLessonPreparationTask(openTask.taskRef);
      await approveTeachingPlan(inReview.revisionRef, {
        purpose: "teacher-copilot.approve-plan",
        idempotencyKey: `ui:lesson-journey:approve:${crypto.randomUUID()}`,
        expectedInReviewRevisionRef: inReview.revisionRef,
        preparationTaskRef: task.taskRef,
        expectedTaskVersion: task.version
      });
      setModelExecution(null);
      setModelExecutionRef(null);
      await loadRoot();
      await refreshLessonPlanState();
      props.onAction("教学计划已由教师批准；备课任务仍需显式完成");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function generateBrief(teacherAdjustment: string | null) {
    if (!selectedLesson) return;
    setActing(true);
    setError(null);
    try {
      const result = await generateLessonBrief(selectedLesson.lessonRef, {
        purpose: "lesson-brief.generate",
        idempotencyKey: `ui:lesson-brief:generate:${crypto.randomUUID()}`,
        teacherAdjustment
      });
      setLessonBrief(result.brief);
      setJourney(await loadLessonJourney(selectedLesson.lessonRef));
      manuallySelectedStageForLesson.current = selectedLesson.lessonRef;
      setVisibleStage("prepare");
      setDrawerMode("preparation");
      props.onAction(teacherAdjustment ? "已按你的说明重新生成教学洞察" : "教学洞察候选已生成");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function adoptBrief(candidateIds: string[]) {
    if (!selectedLesson || !lessonBrief) return;
    setActing(true);
    setError(null);
    try {
      const task = openTask
        ? await loadLessonPreparationTask(openTask.taskRef)
        : (await createLessonPreparationTask({
            lessonRef: selectedLesson.lessonRef,
            dueAt: selectedLesson.plannedAt,
            priority: "normal",
            purpose: "lesson-preparation.create",
            idempotencyKey: `ui:lesson-preparation:create:${crypto.randomUUID()}`
          })).task;
      const result = await decideLessonBrief(
        selectedLesson.lessonRef,
        lessonBrief.agentRunRef,
        {
          purpose: "lesson-brief.decide",
          idempotencyKey: `ui:lesson-brief:adopt:${crypto.randomUUID()}`,
          expectedContentHash: lessonBrief.contentHash,
          action: "adopt",
          selectedCandidateIds: candidateIds,
          preparationTaskRef: task.taskRef,
          expectedWorkingSetVersion: task.workingSet.version
        }
      );
      setLessonBrief(result.brief);
      await loadRoot();
      await refreshBriefAndJourney();
      props.onAction("已采用教学洞察，并加入本课备课上下文");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function deferBrief() {
    if (!selectedLesson || !lessonBrief) return;
    setActing(true);
    setError(null);
    try {
      const result = await decideLessonBrief(
        selectedLesson.lessonRef,
        lessonBrief.agentRunRef,
        {
          purpose: "lesson-brief.decide",
          idempotencyKey: `ui:lesson-brief:defer:${crypto.randomUUID()}`,
          expectedContentHash: lessonBrief.contentHash,
          action: "defer",
          selectedCandidateIds: [],
          preparationTaskRef: null,
          expectedWorkingSetVersion: null
        }
      );
      setLessonBrief(result.brief);
      setJourney(await loadLessonJourney(selectedLesson.lessonRef));
      props.onAction("已保留候选，暂不采用");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function runCurrentFocusAction() {
    if (!journey || !selectedLesson) return;
    switch (journey.nextBestAction.kind) {
      case "generate_lesson_brief":
        await generateBrief(null);
        return;
      case "review_lesson_brief":
      case "review_proposal":
      case "review_teaching_plan":
        setDrawerMode("preparation");
        return;
      case "generate_teaching_plan":
        await generateTeachingPlan(null);
        return;
      case "start_preparation":
      case "continue_preparation":
        await startOrContinue();
        return;
      case "view_agent_run":
      case "recover_agent_run":
        if (activeTask) props.navigatePreparation(activeTask.taskRef, "/runs");
        return;
      case "prepare_materials":
        if (materialBundle) {
          const missingKinds = materialBundle.items
            .filter((item) => item.status === "missing" || item.status === "outdated")
            .map((item) => item.kind);
          if (missingKinds.length > 0) {
            await generateMaterials(missingKinds, null);
            return;
          }
        }
        setDrawerMode("preparation");
        return;
      case "review_materials":
        setVisibleStage("prepare");
        return;
      case "record_delivery":
      case "confirm_delivery":
        manuallySelectedStageForLesson.current = selectedLessonRef;
        setVisibleStage("deliver");
        return;
      case "start_reflection":
      case "review_reflection":
      case "choose_follow_up":
        manuallySelectedStageForLesson.current = selectedLessonRef;
        setVisibleStage("reflect");
        return;
      case "review_lesson_context":
        setDrawerMode("context");
        return;
      case "view_completed_journey":
        setDrawerMode("progress");
        return;
    }
  }

  async function adoptAllMaterials() {
    if (!selectedLesson || !materialBundle?.approvedTeachingPlanRevisionRef) return;
    const drafts = materialBundle.items.filter(
      (item) =>
        item.status === "draft" &&
        item.assetVersion &&
        item.versionRef
    );
    if (drafts.length === 0) return;
    setActing(true);
    setError(null);
    try {
      let nextBundle = materialBundle;
      for (const item of drafts) {
        const result = await adoptLessonMaterial(
          selectedLesson.lessonRef,
          item.kind,
          {
            purpose: "material-bundle.adopt",
            idempotencyKey: `ui:material-bundle:adopt-all:${crypto.randomUUID()}`,
            expectedApprovedTeachingPlanRevisionRef:
              materialBundle.approvedTeachingPlanRevisionRef,
            expectedAssetVersion: item.assetVersion!,
            expectedVersionRef: item.versionRef!
          }
        );
        nextBundle = result.bundle;
      }
      setMaterialBundle(nextBundle);
      setJourney(await loadLessonJourney(selectedLesson.lessonRef));
      props.onAction(`本课 ${drafts.length} 项材料已验收，可直接用于课堂。`);
    } catch (caught) {
      setError(errorMessage(caught));
      setMaterialBundle(await loadLessonMaterialBundle(selectedLesson.lessonRef));
    } finally {
      setActing(false);
    }
  }

  function openMaterial(item: MaterialBundleItem | undefined) {
    if (!item?.assetRef) {
      document.getElementById("material-bundle")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
      return;
    }
    setPreviewMaterialKind(item.kind);
    setMaterialAdjustment("");
    void openFilePreview({ assetRef: item.assetRef });
  }

  const selectedUnitLessons = lessons.filter(
    (lesson) => lesson.unitRef === selectedUnitRef
  );
  const selectedUnitObjectives = Array.from(
    new Map(
      selectedUnitLessons
        .flatMap((lesson) => lesson.learningObjectives)
        .map((objective) => [objective.objectiveRef, objective])
    ).values()
  );
  const currentFocus = journey ? buildCurrentFocus(journey) : null;
  const materialPackage = buildMaterialPackagePresentation(materialBundle, journey);
  const lessonReminders = buildLessonReminders(selectedLesson, lessonBrief, planState);
  const slideMaterial = materialBundle?.items.find((item) => item.kind === "slide_outline");
  const packageHasFiles = materialBundle?.items.some((item) => Boolean(item.assetRef)) ?? false;
  const reflectionAvailable = journey?.completedMilestones.includes("delivery_confirmed")
    || journey?.currentStage === "reflect"
    || journey?.currentStage === "improve";

  async function handleMaterialPackageAction() {
    if (!materialBundle) return;
    if (materialPackage.action === "generate") {
      const missingKinds = materialBundle.items
        .filter((item) => item.status === "missing" || item.status === "outdated")
        .map((item) => item.kind);
      if (missingKinds.length > 0) await generateMaterials(missingKinds, null);
      return;
    }
    if (materialPackage.action === "adopt") {
      await adoptAllMaterials();
      return;
    }
    if (materialPackage.action === "open") {
      openMaterial(slideMaterial);
      return;
    }
    if (materialPackage.action === "continue") {
      await runCurrentFocusAction();
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
          <div className="lesson-workspace-layout">
            <Card className="workspace-card course-browser-card" variant="borderless">
              <header className="course-os-course-nav__header">
                <span>当前课程</span>
                <strong>{selectedCourse.gradeLevel} · {shortClassName(selectedCourse)}{selectedCourse.subject}</strong>
                <small>{selectedCourse.academicTerm}</small>
              </header>
              {courses.length > 1 ? (
                <div className="course-context-selector" aria-label="切换课程">
                  <div className="course-context-list">
                    {courses.map((course) => (
                      <button
                        type="button"
                        key={course.courseRunRef}
                        className={course.courseRunRef === selectedCourseRef ? "is-active" : ""}
                        onClick={() => {
                          setSelectedCourseRef(course.courseRunRef);
                          setSelectedUnitRef(null);
                          setSelectedLessonRef(null);
                          setLessonWorkspaceOpen(false);
                        }}
                      >
                        <strong>{course.gradeLevel} · {shortClassName(course)}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="unit-list-direct" data-testid="unit-list">
                {units.map((unit) => {
                  const activeUnit = unit.unitRef === selectedUnitRef;
                  const unitLessons = lessons.filter((lesson) => lesson.unitRef === unit.unitRef);
                  return (
                    <section key={unit.unitRef} className={activeUnit ? "unit-panel is-current" : "unit-panel"}>
                      <button
                        type="button"
                        className="unit-panel__trigger"
                        onClick={() => {
                          setSelectedUnitRef(unit.unitRef);
                          if (selectedLesson?.unitRef !== unit.unitRef) {
                            setSelectedLessonRef(null);
                          }
                        }}
                        data-testid={`unit-${unit.sequence}`}
                      >
                        <span className="unit-panel__number">{unit.sequence}</span>
                        <span className="unit-panel__copy">
                          <strong>第 {unit.sequence} 单元 · {unit.title}</strong>
                        </span>
                      </button>
                      <div className="lesson-list" data-testid="lesson-list">
                          {unitLessons.map((lesson) => (
                            <button
                              type="button"
                              key={lesson.lessonRef}
                              className={lesson.lessonRef === selectedLessonRef ? "is-active" : ""}
                              onClick={() => {
                               setSelectedUnitRef(unit.unitRef);
                               setSelectedLessonRef(lesson.lessonRef);
                               setLessonWorkspaceOpen(true);
                               props.navigateLesson(lesson.lessonRef);
                               props.onOpenView("current");
                              }}
                              data-testid={`lesson-${lesson.sequence}`}
                            >
                              <span className="lesson-list__title">第 {lesson.sequence} 课 · {lesson.title}</span>
                              <span className={`lesson-list__meta ${lessonWorkspaceStatusTone(lesson, lesson.lessonRef === selectedLessonRef ? journey : null)}`}>
                                {lessonWorkspaceStatusLabel(lesson, lesson.lessonRef === selectedLessonRef ? journey : null)}
                              </span>
                            </button>
                          ))}
                          {unitLessons.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该单元还没有课时" /> : null}
                        </div>
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
              {props.view === "map" ? (
                <CourseLessonMap
                  units={units}
                  lessons={lessons}
                  selectedLessonRef={selectedLessonRef}
                  selectedJourney={journey}
                  onSelectLesson={(lesson) => {
                    setSelectedUnitRef(lesson.unitRef);
                    setSelectedLessonRef(lesson.lessonRef);
                    setLessonWorkspaceOpen(true);
                    props.navigateLesson(lesson.lessonRef);
                    props.onOpenView("current");
                  }}
                />
              ) : !lessonWorkspaceOpen ? (
                <CourseCurrentOverview
                  course={selectedCourse}
                  lessons={lessons}
                  currentLesson={selectedLesson}
                  currentJourney={journey}
                  currentPackage={materialPackage}
                  onEnterLesson={(lesson) => {
                    setSelectedUnitRef(lesson.unitRef);
                    setSelectedLessonRef(lesson.lessonRef);
                    setLessonWorkspaceOpen(true);
                    props.navigateLesson(lesson.lessonRef);
                  }}
                  onOpenMap={() => props.onOpenView("map")}
                />
              ) : selectedLesson ? (
                <>
                  <section className="course-os-lesson-identity" aria-label="当前课时" data-testid="lesson-context-header">
                    <div>
                      <Button
                        type="text"
                        className="course-os-back-to-current"
                        icon={<WorkspaceIcon name="arrowLeft" variant="filled" />}
                        onClick={() => {
                          setLessonWorkspaceOpen(false);
                          props.navigateCourseOverview();
                        }}
                      >
                        返回课程进行中
                      </Button>
                      <Text className="section-kicker">当前课时 · 第 {selectedLesson.sequence} 课</Text>
                      <Title level={2}>{selectedLesson.title}</Title>
                      <p>
                        {selectedCourse.gradeLevel} · {shortClassName(selectedCourse)} · {selectedCourse.subject}
                        {selectedLesson.durationMinutes ? ` · ${selectedLesson.durationMinutes} 分钟` : ""}
                        {selectedLesson.plannedAt ? ` · ${formatLessonDate(selectedLesson.plannedAt)}` : ""}
                      </p>
                    </div>
                    <span className={`lesson-phase-status ${materialPackage.tone}`}>
                      {teacherStageLabel(visibleStage)} · {teacherStageStatusLabel(visibleStage, materialPackage, reflectionAvailable)}
                    </span>
                  </section>

                  <nav className="lesson-phase-switcher lesson-stage-overview" aria-label="本课教学阶段" data-testid="lesson-stage-overview" role="tablist">
                    {([
                      ["prepare", "课前", "课前备课"],
                      ["deliver", "课上", "课上"],
                      ["reflect", "课后", "课后"]
                    ] as const).map(([stage, label, accessibleLabel]) => (
                      <button
                        type="button"
                        role="tab"
                        key={stage}
                        aria-label={accessibleLabel}
                        aria-selected={visibleStage === stage}
                        className={visibleStage === stage ? "is-active" : ""}
                        onClick={() => {
                          manuallySelectedStageForLesson.current = selectedLessonRef;
                          setVisibleStage(stage);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </nav>

                  {visibleStage === "prepare" ? (
                    <section className="lesson-deliverables" id="lesson-stage-prepare" data-testid="lesson-stage-prepare">
                      <header className={`lesson-package-summary ${materialPackage.tone}`}>
                        <div>
                          <span className="lesson-package-summary__phase">课前</span>
                          <Title level={3}>{materialPackage.title}</Title>
                          <Paragraph>{materialPackage.description}</Paragraph>
                        </div>
                        <div className="lesson-package-summary__actions">
                          {materialPackage.primaryLabel ? (
                            <Button
                              type="primary"
                              loading={acting}
                              onClick={() => void handleMaterialPackageAction()}
                              data-testid="lesson-package-primary-action"
                            >
                              {materialPackage.primaryLabel}
                            </Button>
                          ) : null}
                          {packageHasFiles ? (
                            <Button onClick={() => document.getElementById("material-bundle")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                              调整材料
                            </Button>
                          ) : null}
                        </div>
                      </header>

                      <div className="lesson-essential-info" aria-label="本课必要信息">
                        <article>
                          <span>本课重点</span>
                          <strong>{lessonReminders.focus}</strong>
                        </article>
                        <article>
                          <span>教学提醒</span>
                          {lessonReminders.notes.length > 0 ? (
                            <ul>{lessonReminders.notes.map((note) => <li key={note}>{note}</li>)}</ul>
                          ) : (
                            <strong>当前没有额外提醒</strong>
                          )}
                        </article>
                      </div>

                      {materialBundle ? (
                        <MaterialBundlePanel
                          bundle={materialBundle}
                          loading={acting}
                          title="本课文件"
                          testId="material-bundle-panel"
                          hideGenerationAction
                          onGenerate={(kinds, adjustment) => void generateMaterials(kinds, adjustment)}
                          onAdopt={(item) => void adoptMaterial(item)}
                          onPreview={(item) => openMaterial(item)}
                          onDownload={(item) => void downloadMaterial(item)}
                          onOpenFiles={() => props.navigateFiles({ lessonRef: selectedLesson.lessonRef })}
                        />
                      ) : <Empty description="正在读取本课文件" />}

                      <footer className="lesson-deliverables__footer">
                        <Button type="text" onClick={() => setDrawerMode("context")}>版本与生成依据</Button>
                        <Button type="text" onClick={() => props.navigateFiles({ lessonRef: selectedLesson.lessonRef })}>进入资料库</Button>
                      </footer>
                    </section>
                  ) : null}

                  {visibleStage === "deliver" ? (
                    <section className="lesson-deliverables" id="lesson-stage-deliver" data-testid="lesson-stage-deliver">
                      <header className="lesson-stage-heading">
                        <div>
                          <span>课上</span>
                          <Title level={3}>上课需要的材料</Title>
                          <Paragraph>打开课件即可开始；练习、板书和分层支持都集中在这里。</Paragraph>
                        </div>
                        {slideMaterial?.assetRef ? (
                          <Button type="primary" onClick={() => openMaterial(slideMaterial)}>打开课堂课件</Button>
                        ) : null}
                      </header>
                      {materialBundle ? (
                        <MaterialBundlePanel
                          bundle={materialBundle}
                          loading={acting}
                          kinds={["slide_outline", "exercise_set", "board_design", "differentiated_support"]}
                          title="课堂文件"
                          testId="class-materials-panel"
                          hideGenerationAction
                          onGenerate={(kinds, adjustment) => void generateMaterials(kinds, adjustment)}
                          onAdopt={(item) => void adoptMaterial(item)}
                          onPreview={(item) => openMaterial(item)}
                          onDownload={(item) => void downloadMaterial(item)}
                          onOpenFiles={() => props.navigateFiles({ lessonRef: selectedLesson.lessonRef })}
                        />
                      ) : <Empty description="本课暂时没有课堂文件" />}
                      {planState?.currentApproved ? (
                        <details className="lesson-stage-more">
                          <summary><WorkspaceIcon name="edit" variant="filled" />记录课堂情况<WorkspaceIcon name="chevronDown" /></summary>
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
                    </section>
                  ) : null}

                  {visibleStage === "reflect" ? (
                    <section className="lesson-deliverables" id="classroom-implementation" data-testid="lesson-stage-reflect">
                      <header className="lesson-stage-heading">
                        <div>
                          <span>课后</span>
                          <Title level={3}>本课总结与学习信息</Title>
                          <Paragraph>课堂记录、学习证据和下一课建议会在课程结束后整理到这里。</Paragraph>
                        </div>
                      </header>
                      {!reflectionAvailable ? (
                        <div className="lesson-stage-empty">
                          <WorkspaceIcon name="insight" variant="filled" />
                          <div><strong>本课尚未结束</strong><span>课程结束并确认课堂记录后，Agent 会整理课后信息。</span></div>
                        </div>
                      ) : (
                        <>
                          {lessonAssignments.length > 0 ? (
                            <div className="lesson-linked-work" data-testid="lesson-related-assignments">
                              <div><strong>关联作业</strong><span>{lessonAssignments.length} 份</span></div>
                              <Button type="text" onClick={props.onOpenAssignments} data-testid="open-lesson-assignments">查看</Button>
                            </div>
                          ) : null}
                          {planState ? (
                            <ClassroomReflectionPanel
                              lesson={selectedLesson}
                              courseRunRef={selectedCourse.courseRunRef}
                              planState={planState}
                              assignmentRefs={lessonAssignments.map((item) => item.assignmentRef)}
                              navigateReflection={props.navigateReflection}
                              onAction={props.onAction}
                            />
                          ) : null}
                        </>
                      )}
                    </section>
                  ) : null}
                </>
              ) : (
                selectedUnit ? (
                  <section className="unit-overview-direct">
                    <Text className="section-kicker">第 {selectedUnit.sequence} 单元</Text>
                    <Title level={2}>{selectedUnit.title}</Title>
                    <div className="unit-overview-objectives">
                      <Title level={3}>单元教学目标</Title>
                      {selectedUnitObjectives.length > 0 ? selectedUnitObjectives.map((objective) => (
                        <article key={objective.objectiveRef}>
                          <WorkspaceIcon name="check" />
                          <span><strong>{objective.title}</strong><small>{objective.description}</small></span>
                        </article>
                      )) : <Paragraph type="secondary">当前单元尚未配置教学目标。</Paragraph>}
                    </div>
                  </section>
                ) : (
                  <div className="lesson-empty-state">
                    <WorkspaceIcon name="course" />
                    <Title level={3}>选择一节课</Title>
                  </div>
                )
              )}
            </Card>
          </div>
        )}
        <Drawer
          open={drawerMode !== null}
          size={420}
          placement="right"
          title={drawerMode === "context"
            ? "版本与生成依据"
            : drawerMode === "preparation"
              ? "继续准备备课包"
              : "本课完整进度"}
          onClose={() => setDrawerMode(null)}
          className="course-os-drawer"
          destroyOnHidden
        >
          {selectedLesson && journey && drawerMode === "preparation" ? (
            <div className="lesson-package-preparation" data-testid="lesson-package-preparation">
              <Alert
                type="info"
                showIcon
                title="这里只处理生成备课包所需的确认"
                description="课程主页不会展开 Agent 的内部步骤；确认完成后，教案、课件、练习、板书和分层支持会统一回到“课前”文件区。"
              />
              {journey.currentStage === "understand" &&
                (journey.nextBestAction.kind === "generate_lesson_brief" ||
                  journey.nextBestAction.kind === "review_lesson_brief") ? (
                  <LessonBriefPanel
                    brief={lessonBrief}
                    loading={acting}
                    onGenerate={() => void generateBrief(null)}
                    onAdjust={(adjustment) => void generateBrief(adjustment)}
                    onAdopt={(candidateIds) => void adoptBrief(candidateIds)}
                    onDefer={() => void deferBrief()}
                  />
              ) : null}
              {journey.currentStage === "plan" ? (
                <PreparationProposalPanel
                  proposal={preparationProposal}
                  execution={modelExecution}
                  inReviewRevision={planState?.activeInReview ?? null}
                  loading={acting}
                  onAccept={(strategyId) => void acceptPreparationProposal(strategyId)}
                  onReject={(strategyId) => void rejectPreparationProposal(strategyId)}
                  onAdjust={(strategyId, adjustment) => void adjustPreparationProposal(strategyId, adjustment)}
                  onApprove={() => void approveInReviewPlan()}
                />
              ) : null}
              {!["review_lesson_brief", "review_proposal", "review_teaching_plan"].includes(journey.nextBestAction.kind) ? (
                <Button type="primary" loading={acting} onClick={() => void runCurrentFocusAction()}>
                  继续由 Agent 准备
                </Button>
              ) : null}
              {activeTask ? (
                <Button type="text" onClick={() => props.navigatePreparation(activeTask.taskRef, "/teaching-plan")}>
                  查看详细版本记录
                </Button>
              ) : null}
            </div>
          ) : null}
          {selectedLesson && journey && drawerMode === "context" ? (
            <div className="course-os-drawer__content" data-testid="lesson-context-drawer">
              <section>
                <h3>本课材料使用了什么</h3>
                {journey.sourceRefs.length > 0 ? (
                  <ul className="course-os-source-list">
                    {journey.sourceRefs.map((source) => (
                      <li key={`${source.kind}:${source.ref}`}>
                        <WorkspaceIcon name={sourceIcon(source.kind)} variant="filled" />
                        <span><strong>{sourceLabel(source.kind)}</strong><small>{sourceVersionLabel(source)}</small></span>
                      </li>
                    ))}
                  </ul>
                ) : <p>当前动作未引用额外资料；系统只会基于已授权、可追溯的上下文继续。</p>}
              </section>
              <section>
                <h3>尚未掌握的信息</h3>
                {lessonBrief?.knownGaps.length ? (
                  <ul>{lessonBrief.knownGaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
                ) : <p>当前投影没有记录新的信息缺口。</p>}
              </section>
              <section>
                <h3>验收与调整</h3>
                <p>验收会把当前文件版本标记为课堂可用；调整只会生成新版本，原文件仍会保留。</p>
              </section>
              <details className="course-os-audit-details">
                <summary>查看审计标识</summary>
                <dl>
                  <div><dt>课时</dt><dd>{selectedLesson.lessonRef}</dd></div>
                  {Object.entries(journey.sourceVersionVector).map(([key, value]) => (
                    <div key={key}><dt>{key}</dt><dd>{value}</dd></div>
                  ))}
                </dl>
              </details>
            </div>
          ) : null}
          {selectedLesson && journey && drawerMode === "progress" ? (
            <div className="course-os-drawer__content" data-testid="lesson-progress-drawer">
              <section className="course-os-progress-summary">
                <span className="section-kicker">CURRENT STATE</span>
                <h3>{currentFocus?.statusLabel ?? "正在汇总"}</h3>
                <p>{journey.nextBestAction.reason}</p>
              </section>
              <section>
                <span className="section-kicker">COMPLETED</span>
                <h3>已经形成的里程碑</h3>
                {journey.completedMilestones.length > 0 ? (
                  <ol className="course-os-milestone-list">
                    {journey.completedMilestones.map((milestone) => (
                      <li key={milestone}><WorkspaceIcon name="check" /><span>{milestoneLabel(milestone)}</span></li>
                    ))}
                  </ol>
                ) : <p>本课尚未形成已确认里程碑。</p>}
              </section>
              {journey.blockingReasons.length > 0 ? (
                <section className="course-os-blockers">
                  <span className="section-kicker">BLOCKED</span>
                  <h3>当前阻塞</h3>
                  <ul>{journey.blockingReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                </section>
              ) : null}
              <section>
                <span className="section-kicker">NEXT</span>
                <h3>{journey.nextBestAction.label}</h3>
                <p>{journey.nextBestAction.reason}</p>
              </section>
            </div>
          ) : null}
        </Drawer>
        <Modal
          open={previewOpen}
          title={previewFile?.displayName ?? "文件预览"}
          onCancel={closeFilePreview}
          width={760}
          footer={previewFile && selectedLesson ? [
            <Button
              key="adjust"
              type="primary"
              disabled={!previewMaterialKind || materialAdjustment.trim().length === 0}
              loading={acting}
              onClick={() => {
                if (!previewMaterialKind || !materialAdjustment.trim()) return;
                void generateMaterials([previewMaterialKind], materialAdjustment.trim());
                closeFilePreview();
              }}
            >
              交给助手修改
            </Button>,
            <Button key="library" onClick={() => props.navigateFiles({ assetRef: previewFile.assetRef, lessonRef: selectedLesson.lessonRef })}>手动修改</Button>,
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
                {previewMaterialKind ? (
                  <div className="lesson-file-adjustment ai-task-composer">
                    <strong>需要修改？</strong>
                    <Input.TextArea
                      className="ai-task-input"
                      autoSize={{ minRows: 1, maxRows: 5 }}
                      maxLength={500}
                      value={materialAdjustment}
                      onChange={(event) => setMaterialAdjustment(event.target.value)}
                      placeholder="例如：第二题简单一点，或者减少板书内容并增加课堂互动。"
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </Spin>
        </Modal>
      </div>
    </Spin>
  );
}

type MaterialPackagePresentation = {
  shortLabel: string;
  title: string;
  description: string;
  tone: "is-neutral" | "is-running" | "is-waiting" | "is-complete";
  primaryLabel: string | null;
  action: "continue" | "generate" | "adopt" | "open" | null;
};

function buildMaterialPackagePresentation(
  bundle: MaterialBundleProjection | null,
  journey: LessonJourneyProjection | null
): MaterialPackagePresentation {
  if (!bundle) {
    return {
      shortLabel: "正在读取",
      title: "正在读取本课材料",
      description: "教案、课件、练习、板书和分层支持会统一显示在这里。",
      tone: "is-running",
      primaryLabel: null,
      action: null
    };
  }

  const missingCount = bundle.items.filter(
    (item) => item.status === "missing" || item.status === "outdated"
  ).length;
  const draftCount = bundle.items.filter((item) => item.status === "draft").length;

  if (bundle.status === "blocked_no_approved_plan") {
    const agentRunning = journey?.status === "waiting_for_agent" || journey?.status === "in_progress";
    return {
      shortLabel: agentRunning ? "准备中" : "待准备",
      title: agentRunning ? "Agent 正在准备本课材料" : "本课备课包尚未形成",
      description: agentRunning
        ? "完成后会把全部文件统一送到这里，不需要逐步查看 Agent 的生成过程。"
        : "当前还没有可验收的完整材料；继续准备后，所有文件会统一回到这个页面。",
      tone: agentRunning ? "is-running" : "is-neutral",
      primaryLabel: agentRunning ? null : "继续准备备课包",
      action: agentRunning ? null : "continue"
    };
  }

  if (missingCount > 0) {
    return {
      shortLabel: "准备中",
      title: missingCount === bundle.items.length ? "开始准备完整备课包" : `备课包还差 ${missingCount} 项材料`,
      description: "系统会一次补齐缺少的文件，已生成和已验收的版本不会被覆盖。",
      tone: "is-running",
      primaryLabel: missingCount === bundle.items.length ? "准备本课材料" : "补齐剩余材料",
      action: "generate"
    };
  }

  if (draftCount > 0) {
    return {
      shortLabel: "待验收",
      title: "本课材料已准备好",
      description: `${bundle.items.length} 项文件已经生成。可以一次验收，也可以先逐份查看并调整。`,
      tone: "is-waiting",
      primaryLabel: "验收本课材料",
      action: "adopt"
    };
  }

  return {
    shortLabel: "已验收",
    title: "本课材料已验收，可直接使用",
    description: `${bundle.items.length} 项课堂文件均为当前可用版本；调整会生成新版本并保留原文件。`,
    tone: "is-complete",
    primaryLabel: "打开课堂课件",
    action: "open"
  };
}

function buildLessonReminders(
  lesson: LessonView | null,
  brief: LessonBriefSnapshot | null,
  planState: LessonTeachingPlanState | null
): { focus: string; notes: string[] } {
  const focus = planState?.currentApproved?.content.lessonFocus?.trim()
    || lesson?.learningObjectives[0]?.title
    || brief?.teachingFocusCandidates[0]?.title
    || "本课重点尚待补充";
  const selectedIds = new Set(brief?.disposition?.selectedCandidateIds ?? []);
  const candidates = [
    ...(brief?.difficultyCandidates ?? []),
    ...(brief?.suggestedAttentionPoints ?? []),
    ...(brief?.teachingFocusCandidates ?? [])
  ];
  const preferred = selectedIds.size > 0
    ? candidates.filter((candidate) => selectedIds.has(candidate.candidateId))
    : candidates;
  const notes = Array.from(new Set(preferred.map((candidate) => candidate.title.trim())))
    .filter((item) => item && item !== focus)
    .slice(0, 2);
  return { focus, notes };
}

function teacherStageLabel(stage: TeacherStage): string {
  return { prepare: "课前", deliver: "课上", reflect: "课后" }[stage];
}

function teacherStageStatusLabel(
  stage: TeacherStage,
  materialPackage: MaterialPackagePresentation,
  reflectionAvailable: boolean
): string {
  if (stage === "prepare") return materialPackage.shortLabel;
  if (stage === "deliver") {
    return materialPackage.tone === "is-complete" ? "课堂材料已就绪" : "材料尚待验收";
  }
  return reflectionAvailable ? "课后信息可查看" : "课程尚未结束";
}

function CourseCurrentOverview(props: {
  course: CourseRunView;
  lessons: LessonView[];
  currentLesson: LessonView | null;
  currentJourney: LessonJourneyProjection | null;
  currentPackage: MaterialPackagePresentation;
  onEnterLesson: (lesson: LessonView) => void;
  onOpenMap: () => void;
}) {
  const upcomingLessons = [...props.lessons]
    .filter((lesson) => lesson.lessonRef !== props.currentLesson?.lessonRef)
    .sort((left, right) => {
      if (left.plannedAt && right.plannedAt) return left.plannedAt.localeCompare(right.plannedAt);
      if (left.plannedAt) return -1;
      if (right.plannedAt) return 1;
      return left.sequence - right.sequence;
    })
    .slice(0, 4);
  return (
    <section className="course-os-current-overview" data-testid="course-current-overview">
      <header>
        <div>
          <span className="section-kicker">当前课程</span>
          <Title level={2}>{props.course.subject} · {shortClassName(props.course)}</Title>
          <Paragraph>{props.course.gradeLevel} · {props.course.academicTerm}</Paragraph>
        </div>
      </header>

      {props.currentLesson ? (
        <section className="course-os-course-focus" aria-label="当前最需要处理">
          <div className="course-os-course-focus__eyebrow">
            <span>最近一节课</span>
            <small className={lessonWorkspaceStatusTone(props.currentLesson, props.currentJourney)}>
              {lessonWorkspaceStatusLabel(props.currentLesson, props.currentJourney)}
            </small>
          </div>
          <div className="course-os-course-focus__body">
            <span className="course-os-course-focus__lesson">第 {props.currentLesson.sequence} 课</span>
            <Title level={2}>{props.currentLesson.title}</Title>
            <h3>{props.currentPackage.title}</h3>
            <Paragraph>{props.currentPackage.description}</Paragraph>
            <div className="course-os-course-focus__meta">
              {props.currentLesson.plannedAt ? <span><WorkspaceIcon name="schedule" variant="filled" />{formatLessonDate(props.currentLesson.plannedAt)}</span> : null}
              {props.currentLesson.durationMinutes ? <span>{props.currentLesson.durationMinutes} 分钟</span> : null}
            </div>
          </div>
          <div className="course-os-course-focus__actions">
            <Button type="primary" onClick={() => props.onEnterLesson(props.currentLesson!)}>
              查看本课
            </Button>
            <Button type="text" onClick={props.onOpenMap}>先看课时地图</Button>
          </div>
        </section>
      ) : (
        <Empty description="这门课还没有可处理的课时" />
      )}

      <section className="course-os-upcoming-lessons">
        <header>
            <div><span className="section-kicker">后续课时</span><Title level={3}>接下来</Title></div>
          <small>按排课时间与课程顺序展示</small>
        </header>
        {upcomingLessons.length > 0 ? (
          <div>
            {upcomingLessons.map((lesson) => (
              <button type="button" key={lesson.lessonRef} onClick={() => props.onEnterLesson(lesson)}>
                <span className="course-os-upcoming-lessons__number">{lesson.sequence}</span>
                <span><strong>{lesson.title}</strong><small>{lessonWorkspaceStatusLabel(lesson, null)}</small></span>
                {lesson.plannedAt ? <time>{formatLessonDate(lesson.plannedAt)}</time> : <time>时间待安排</time>}
                <WorkspaceIcon name="chevron" />
              </button>
            ))}
          </div>
        ) : (
          <p>暂时没有后续课时。</p>
        )}
      </section>
    </section>
  );
}

function CourseLessonMap(props: {
  units: CurriculumUnitView[];
  lessons: LessonView[];
  selectedLessonRef: string | null;
  selectedJourney: LessonJourneyProjection | null;
  onSelectLesson: (lesson: LessonView) => void;
}) {
  return (
    <section className="course-os-map" data-testid="course-lesson-map">
      <header>
        <div>
          <span className="section-kicker">COURSE MAP</span>
          <Title level={2}>课时地图</Title>
          <Paragraph>按单元查看每节课正在等待什么、哪里被阻塞，以及已经形成了哪些可复用成果。</Paragraph>
        </div>
      </header>
      <div className="course-os-map__units">
        {props.units.map((unit) => {
          const unitLessons = props.lessons.filter((lesson) => lesson.unitRef === unit.unitRef);
          return (
            <section key={unit.unitRef} className="course-os-map__unit">
              <header>
                <span>{unit.sequence}</span>
                <div><strong>{unit.title}</strong><small>{unitLessons.length} 节课</small></div>
              </header>
              <div className="course-os-map__lessons">
                {unitLessons.map((lesson) => {
                  const lessonJourney = lesson.lessonRef === props.selectedLessonRef
                    ? props.selectedJourney
                    : null;
                  return (
                    <button type="button" key={lesson.lessonRef} onClick={() => props.onSelectLesson(lesson)}>
                      <span className="course-os-map__lesson-number">{lesson.sequence}</span>
                      <span className="course-os-map__lesson-copy">
                        <strong>{lesson.title}</strong>
                        <small>{lessonWorkspaceStatusLabel(lesson, lessonJourney)}</small>
                      </span>
                      <span className={`course-os-map__status ${lessonWorkspaceStatusTone(lesson, lessonJourney)}`} aria-hidden="true" />
                      <WorkspaceIcon name="chevron" />
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function buildCurrentFocus(journey: LessonJourneyProjection): {
  title: string;
  statusLabel: string;
  impact: string;
  tone: string;
} {
  const kind = journey.nextBestAction.kind;
  const titleByAction: Record<typeof kind, string> = {
    review_lesson_context: "补齐本课教学上下文",
    generate_lesson_brief: "形成可审阅的本课教学洞察",
    review_lesson_brief: "判断并确认本课教学洞察",
    generate_teaching_plan: "让 Agent 形成可比较的备课方案",
    start_preparation: "开始本轮备课",
    continue_preparation: "继续推进本轮备课",
    view_agent_run: "查看 Agent 的生成进度",
    recover_agent_run: "处理本次生成异常",
    review_proposal: "比较并选择备课方案",
    review_teaching_plan: "批准本课教学计划",
    prepare_materials: "生成本课教学材料",
    review_materials: "预览并确认本课教学材料",
    record_delivery: "记录课堂实际实施情况",
    confirm_delivery: "确认课堂实施记录",
    start_reflection: "开始本课课后复盘",
    review_reflection: "审阅并确认课后反思",
    choose_follow_up: "决定下一课优化行动",
    view_completed_journey: "回看本课教学闭环"
  };
  const impactByAction: Record<typeof kind, string> = {
    review_lesson_context: "补齐目标后，系统才会基于真实上下文形成候选；不会自动生成正式教学结论。",
    generate_lesson_brief: "系统只会生成候选洞察，教师判断前不会进入后续教学事实。",
    review_lesson_brief: "教师采用的关注点会进入本轮备课上下文，并保留来源与版本。",
    generate_teaching_plan: "Agent 会生成可比较的候选方案，正式计划仍需教师审阅和批准。",
    start_preparation: "系统会建立本轮工作记录，不会替教师做出正式教学决策。",
    continue_preparation: "将继续当前工作链，已确认成果和历史版本保持不变。",
    view_agent_run: "只查看执行过程，不改变任何教学计划或教师确认状态。",
    recover_agent_run: "可查看失败原因并显式重试，失败结果不会成为正式教学内容。",
    review_proposal: "所选建议会形成待审核计划，仍需教师批准才可成为当前方案。",
    review_teaching_plan: "批准后该版本成为当前教学方案，旧版本仍可追溯。",
    prepare_materials: "材料将基于已批准计划生成草稿，采用前不会成为本课正式材料。",
    review_materials: "教师采用后的版本会进入课堂可用材料，其他草稿仍保留历史。",
    record_delivery: "课堂事实先以草稿记录，教师确认前不会写入正式实施记录。",
    confirm_delivery: "确认后该记录成为本课实施事实，并可作为复盘依据。",
    start_reflection: "系统会基于已确认实施事实生成反思草稿，教师仍保留最终判断。",
    review_reflection: "确认后的反思将进入本课闭环，并可支持下一课优化。",
    choose_follow_up: "只有教师接受的行动才会进入下一课工作，不会自动创建后续事实。",
    view_completed_journey: "只回看已确认里程碑、依据和版本，不会修改当前状态。"
  };
  const statusPresentation: Record<LessonJourneyProjection["status"], { label: string; tone: string }> = {
    ready: { label: "可以开始", tone: "is-ready" },
    in_progress: { label: "正在推进", tone: "is-running" },
    waiting_for_agent: { label: "Agent 正在处理", tone: "is-running" },
    waiting_for_teacher: { label: "等待老师决策", tone: "is-waiting" },
    needs_attention: { label: "需要处理", tone: "is-blocked" },
    completed: { label: "本课闭环已完成", tone: "is-complete" }
  };
  const state = statusPresentation[journey.status];
  return {
    title: titleByAction[kind],
    statusLabel: state.label,
    impact: impactByAction[kind],
    tone: state.tone
  };
}

function lessonWorkspaceStatusLabel(
  lesson: LessonView,
  journey: LessonJourneyProjection | null
): string {
  if (journey) {
    const stage = stageFromJourney(journey);
    if (journey.status === "completed") return "课后 · 本课已完成";
    if (journey.status === "waiting_for_agent") return `${teacherStageLabel(stage)} · Agent 正在整理`;
    if (journey.status === "needs_attention") return `${teacherStageLabel(stage)} · 需要处理`;
    if (stage === "prepare") {
      return journey.nextBestAction.kind === "review_materials"
        ? "课前 · 材料待验收"
        : "课前 · 备课包准备中";
    }
    if (stage === "deliver") return "课上 · 待记录课堂";
    return "课后 · 总结待查看";
  }
  const labels: Record<LessonView["preparationState"], string> = {
    not_started: "课前 · 待准备",
    planned: "课前 · 待准备",
    in_progress: "课前 · Agent 正在整理",
    awaiting_plan_review: "课前 · 备课包准备中",
    ready_for_use: "课前 · 材料可使用",
    completed: "课前 · 材料已就绪",
    cancelled: "课前 · 已取消"
  };
  return labels[lesson.preparationState];
}

function lessonWorkspaceStatusTone(
  lesson: LessonView,
  journey: LessonJourneyProjection | null
): string {
  if (journey?.status === "needs_attention") return "is-attention";
  if (journey?.status === "waiting_for_teacher") return "is-waiting";
  if (journey?.status === "waiting_for_agent" || journey?.status === "in_progress") return "is-running";
  if (journey?.status === "completed") return "is-complete";
  if (lesson.preparationState === "cancelled") return "is-muted";
  if (lesson.preparationState === "awaiting_plan_review") return "is-waiting";
  if (lesson.preparationState === "completed" || lesson.preparationState === "ready_for_use") return "is-complete";
  return "is-neutral";
}

function sourceLabel(kind: LessonJourneyProjection["sourceRefs"][number]["kind"]): string {
  const labels: Record<typeof kind, string> = {
    lesson: "课时与教学目标",
    lesson_brief_run: "教学洞察生成记录",
    preparation_task: "本轮备课任务",
    proposal: "备课方案候选",
    agent_run: "Agent 执行记录",
    model_execution: "模型执行记录",
    teaching_plan_revision: "教学计划版本",
    file_asset: "教学材料文件",
    delivery_revision: "课堂实施记录",
    reflection_revision: "课后反思版本",
    next_lesson_action: "下一课优化候选",
    follow_up: "教师确认的后续行动"
  };
  return labels[kind];
}

function sourceIcon(kind: LessonJourneyProjection["sourceRefs"][number]["kind"]): WorkspaceIconName {
  if (kind === "file_asset") return "files";
  if (kind === "agent_run" || kind === "model_execution" || kind === "lesson_brief_run") return "agent";
  if (kind === "delivery_revision") return "schedule";
  if (kind === "reflection_revision" || kind === "next_lesson_action" || kind === "follow_up") return "insight";
  if (kind === "teaching_plan_revision" || kind === "proposal") return "lesson";
  return "course";
}

function sourceVersionLabel(source: LessonJourneyProjection["sourceRefs"][number]): string {
  const parts = source.version.split(":");
  const numericVersion = parts.find((part) => /^\d+$/u.test(part));
  const stateLabels: Record<string, string> = {
    planned: "待开始",
    in_progress: "处理中",
    awaiting_plan_review: "待审核",
    ready_for_use: "可使用",
    completed: "已完成",
    cancelled: "已取消",
    current_approved: "教师已批准",
    active_in_review: "等待教师批准"
  };
  const state = parts.map((part) => stateLabels[part]).find(Boolean);
  if (source.kind === "preparation_task" || source.kind === "teaching_plan_revision" || source.kind === "file_asset") {
    return [numericVersion ? `第 ${numericVersion} 版` : "当前版本", state].filter(Boolean).join(" · ");
  }
  if (source.kind === "agent_run" || source.kind === "model_execution" || source.kind === "lesson_brief_run") {
    return state ?? "当前执行版本";
  }
  return state ?? "当前可用版本";
}

function milestoneLabel(milestone: LessonJourneyProjection["completedMilestones"][number]): string {
  const labels: Record<typeof milestone, string> = {
    lesson_context_ready: "课时上下文已具备",
    lesson_brief_adopted: "教师已采用本课教学洞察",
    preparation_task_created: "本轮备课任务已建立",
    proposal_ready: "备课方案候选已生成",
    teaching_plan_approved: "教师已批准教学计划",
    materials_available: "课堂材料已经可用",
    delivery_confirmed: "教师已确认课堂实施记录",
    reflection_confirmed: "教师已确认课后反思",
    follow_up_created: "下一课行动已由教师建立"
  };
  return labels[milestone];
}

function formatLessonDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(date);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}

function stageFromJourney(
  journey: LessonJourneyProjection | null
): TeacherStage {
  if (!journey) return "prepare";
  if (journey.currentStage === "deliver") return "deliver";
  if (journey.currentStage === "reflect" || journey.currentStage === "improve") {
    return "reflect";
  }
  return "prepare";
}

function chooseCurrentLesson(lessons: LessonView[]): LessonView | null {
  return lessons.find((lesson) => Boolean(lesson.activePreparationTaskRef))
    ?? [...lessons]
      .filter((lesson) => Boolean(lesson.plannedAt))
      .sort((left, right) => String(left.plannedAt).localeCompare(String(right.plannedAt)))[0]
    ?? lessons[0]
    ?? null;
}

function shortClassName(course: CourseRunView): string {
  const normalized = course.className.replace(course.gradeLevel, "").trim();
  return normalized || course.className;
}

function preparationRequestFromBrief(
  brief: LessonBriefSnapshot | null
): string {
  if (!brief || brief.status !== "adopted") {
    return "请基于当前课时已授权上下文生成可比较的教学方案。";
  }
  const selected = new Set(brief.disposition?.selectedCandidateIds ?? []);
  const titles = [
    ...brief.teachingFocusCandidates,
    ...brief.difficultyCandidates,
    ...brief.suggestedAttentionPoints
  ]
    .filter((candidate) => selected.has(candidate.candidateId))
    .map((candidate) => candidate.title);
  return [
    "请基于教师已确认的 Lesson Brief 生成可比较的教学方案。",
    titles.length > 0 ? `重点关注：${titles.join("、")}。` : "",
    "方案需要明确目标、课堂流程、活动、练习与风险，并保留信息缺口。"
  ].filter(Boolean).join(" ");
}
