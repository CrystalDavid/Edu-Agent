import { useEffect, useMemo, useState } from "react";

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
  Empty,
  Input,
  Modal,
  Spin,
  Tag,
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
import { PageHeader } from "../components/portal/PortalPrimitives";
import { ClassroomReflectionPanel } from "../components/portal/ClassroomReflectionPanel";
import { cleanDisplayText, lessonPreparationStatusLabel } from "../presentation";
import { WorkspaceIcon } from "../components/WorkspaceIcon";
import {
  LessonContextHeader
} from "../components/teaching/LessonJourney";
import { LessonBriefPanel } from "../components/teaching/LessonBriefPanel";
import { PreparationProposalPanel } from "../components/teaching/PreparationProposalPanel";
import { MaterialBundlePanel } from "../components/teaching/MaterialBundlePanel";

const { Paragraph, Text, Title } = Typography;
type TeachingTab = "course" | "homework" | "exam";
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
  navigateLesson: (lessonRef: string) => void;
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
          navigateLesson={props.navigateLesson}
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
        const defaultUnitRef = routedLesson?.unitRef ?? unitResult.items[0]?.unitRef ?? null;
        setSelectedUnitRef((current) =>
          current && unitResult.items.some((unit) => unit.unitRef === current)
            ? current
            : defaultUnitRef
        );
        setSelectedLessonRef((current) => {
          if (routedLesson) return routedLesson.lessonRef;
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
      props.onAction(`${item.label}已采用，并绑定当前教学计划版本。`);
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

  async function runJourneyAction() {
    if (!journey || !selectedLesson) return;
    switch (journey.nextBestAction.kind) {
      case "generate_lesson_brief":
        await generateBrief(null);
        return;
      case "review_lesson_brief":
        document
          .getElementById("lesson-brief")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      case "generate_teaching_plan":
        await generateTeachingPlan(null);
        return;
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
        if (materialBundle) {
          await generateMaterials(
            materialBundle.items
              .filter(
                (item) =>
                  item.status === "missing" || item.status === "outdated"
              )
              .map((item) => item.kind),
            null
          );
        }
        return;
      case "review_materials":
        document
          .getElementById("material-bundle")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      props.onAction("已拒绝本次方案，未创建教学计划 Revision");
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

  function confirmCancelPreparation() {
    Modal.confirm({
      title: "取消本轮备课？",
      content: "本次备课任务将停止，已经批准的方案、生成材料和历史记录不会被删除。",
      okText: "确认取消",
      cancelText: "继续备课",
      okButtonProps: { danger: true },
      onOk: cancelPreparation
    });
  }

  const teachingFocus = planState?.currentApproved?.content.lessonFocus
    ?? selectedLesson?.learningObjectives[0]?.title
    ?? "选择课时后查看教学重点";
  const teachingDifficulty = planState?.currentApproved?.content.supportStrategy
    ?? selectedLesson?.learningObjectives[0]?.description
    ?? "选择课时后查看需要重点突破的内容";
  const currentTerm = courses[0]?.academicTerm ?? null;
  const currentCourses = currentTerm
    ? courses.filter((course) => course.academicTerm === currentTerm)
    : courses;
  const historicalCourses = currentTerm
    ? courses.filter((course) => course.academicTerm !== currentTerm)
    : [];
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
  const journeyStageRank = journey
    ? ["understand", "plan", "materials", "deliver", "reflect", "improve"].indexOf(
        journey.currentStage
      )
    : -1;
  const preparationComplete =
    materialBundle?.status === "ready" || journeyStageRank >= 3;
  const deliveryComplete = journeyStageRank >= 4;
  const afterClassComplete =
    journey?.currentStage === "improve" && journey.status === "completed";

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
              <div className="course-context-selector" aria-label="课程范围">
                <section>
                  <Text className="section-kicker">当前教学</Text>
                  <strong>{currentTerm}</strong>
                  <div className="course-context-list">
                    {currentCourses.map((course) => (
                      <button
                        type="button"
                        key={course.courseRunRef}
                        className={course.courseRunRef === selectedCourseRef ? "is-active" : ""}
                        onClick={() => {
                          setSelectedCourseRef(course.courseRunRef);
                          setSelectedUnitRef(null);
                          setSelectedLessonRef(null);
                        }}
                      >
                        <strong>{course.subject}</strong>
                        <span>{course.gradeLevel} / {course.academicTerm} / {shortClassName(course)}</span>
                      </button>
                    ))}
                  </div>
                </section>
                <section className="course-history-section">
                  <Text className="section-kicker">历史教学</Text>
                  {historicalCourses.length > 0 ? (
                    <div className="course-context-list">
                      {historicalCourses.map((course) => (
                        <button
                          type="button"
                          key={course.courseRunRef}
                          className={course.courseRunRef === selectedCourseRef ? "is-active" : ""}
                          onClick={() => {
                            setSelectedCourseRef(course.courseRunRef);
                            setSelectedUnitRef(null);
                            setSelectedLessonRef(null);
                          }}
                        >
                          <strong>{course.subject}</strong>
                          <span>{course.gradeLevel} / {course.academicTerm} / {shortClassName(course)}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <small>历史学期会显示在这里，教案和材料仍可回看复用。</small>
                  )}
                </section>
              </div>
              <div className="unit-list-direct" data-testid="unit-list">
                {units.map((unit) => {
                  const activeUnit = unit.unitRef === selectedUnitRef;
                  const unitLessons = lessons.filter((lesson) => lesson.unitRef === unit.unitRef);
                  return (
                    <section key={unit.unitRef} className={activeUnit ? "unit-panel is-expanded" : "unit-panel"}>
                      <button
                        type="button"
                        className="unit-panel__trigger"
                        onClick={() => {
                          setSelectedUnitRef(unit.unitRef);
                          setSelectedLessonRef(null);
                        }}
                        data-testid={`unit-${unit.sequence}`}
                      >
                        <span className="unit-panel__number">{unit.sequence}</span>
                        <span className="unit-panel__copy">
                          <strong>第 {unit.sequence} 单元 · {unit.title}</strong>
                          <small>{unit.description}</small>
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
                                props.navigateLesson(lesson.lessonRef);
                              }}
                              data-testid={`lesson-${lesson.sequence}`}
                            >
                              <span className="lesson-list__sequence">第 {lesson.sequence} 课时</span>
                              <span className="lesson-list__title">{lesson.title}</span>
                              <span className="lesson-list__meta">{lesson.durationMinutes} 分钟 · {lessonPreparationStatusLabel(lesson.preparationState)}</span>
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
              {selectedLesson ? (
                <>
                  {journey ? (
                    <LessonContextHeader
                      courseTitle={`${selectedCourse.subject} / ${selectedCourse.gradeLevel} / ${selectedCourse.academicTerm} / ${selectedCourse.className}`}
                      unitTitle={selectedUnit ? `第 ${selectedUnit.sequence} 单元 · ${selectedUnit.title}` : null}
                      lesson={selectedLesson}
                      journey={journey}
                    />
                  ) : (
                    <header className="lesson-detail-heading">
                      <div>
                        <Text className="section-kicker">第 {selectedLesson.sequence} 课时</Text>
                        <Title level={2}>{selectedLesson.title}</Title>
                      </div>
                      <Tag color="processing">正在整理本课进度</Tag>
                    </header>
                  )}

                  <section className="lesson-unit-insight">
                    <header>
                      <div>
                        <Text className="section-kicker">本单元先看这里</Text>
                        <Title level={3}>{selectedUnit?.title ?? "单元教学目标"}</Title>
                      </div>
                    </header>
                    <Paragraph type="secondary">{selectedUnit?.description}</Paragraph>
                    <div className="lesson-focus-grid">
                      <article><span>教学重点</span><strong>{teachingFocus}</strong></article>
                      <article><span>教学难点</span><strong>{teachingDifficulty}</strong></article>
                    </div>
                    <div className="lesson-objectives-direct">
                      <Text className="section-kicker">本课教学目标</Text>
                      {selectedLesson.learningObjectives.map((objective) => (
                        <article key={objective.objectiveRef}>
                          <strong>{objective.title}</strong>
                          <span>{objective.description}</span>
                        </article>
                      ))}
                    </div>
                  </section>

                  <nav className="lesson-stage-overview" aria-label="本课教学阶段" data-testid="lesson-stage-overview">
                    {[
                      ["备课阶段", preparationComplete],
                      ["上课阶段", deliveryComplete],
                      ["课下阶段", afterClassComplete]
                    ].map(([label, complete], index) => (
                      <span key={String(label)} className={complete ? "is-complete" : ""}>
                        <i>{complete ? <WorkspaceIcon name="check" /> : index + 1}</i>
                        {label}
                      </span>
                    ))}
                  </nav>

                  <section className="lesson-stage-card" id="lesson-stage-prepare">
                    <header className="lesson-stage-card__header">
                      <div className="lesson-stage-title">
                        <span className={preparationComplete ? "stage-check is-complete" : "stage-check"}>
                          {preparationComplete ? <WorkspaceIcon name="check" /> : "1"}
                        </span>
                        <div><Text className="section-kicker">课前</Text><Title level={3}>备课阶段</Title></div>
                      </div>
                      {journey && ["understand", "plan", "materials"].includes(journey.currentStage) ? (
                        <div data-testid="lesson-next-best-action">
                          <Button type="primary" loading={acting} onClick={() => void runJourneyAction()}>
                            {journey.nextBestAction.label}
                          </Button>
                        </div>
                      ) : null}
                    </header>
                    <Paragraph type="secondary">系统先准备教学洞察、方案和材料，老师只需要判断和确认。</Paragraph>
                    {journey?.currentStage === "understand" &&
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
                    {journey?.currentStage === "plan" ? (
                        <PreparationProposalPanel
                          proposal={preparationProposal}
                          execution={modelExecution}
                          inReviewRevision={planState?.activeInReview ?? null}
                          loading={acting}
                          onAccept={(strategyId) =>
                            void acceptPreparationProposal(strategyId)
                          }
                          onReject={(strategyId) =>
                            void rejectPreparationProposal(strategyId)
                          }
                          onAdjust={(strategyId, adjustment) =>
                            void adjustPreparationProposal(strategyId, adjustment)
                          }
                          onApprove={() => void approveInReviewPlan()}
                        />
                    ) : null}
                    {planState?.currentApproved && materialBundle ? (
                        <MaterialBundlePanel
                          bundle={materialBundle}
                          loading={acting}
                          onGenerate={(kinds, adjustment) =>
                            void generateMaterials(kinds, adjustment)
                          }
                          onAdopt={(item) => void adoptMaterial(item)}
                          onPreview={(item) => {
                            if (item.assetRef) {
                              setPreviewMaterialKind(item.kind);
                              setMaterialAdjustment("");
                              void openFilePreview({ assetRef: item.assetRef });
                            }
                          }}
                          onDownload={(item) => void downloadMaterial(item)}
                          onOpenFiles={() =>
                            props.navigateFiles({
                              lessonRef: selectedLesson.lessonRef
                            })
                          }
                        />
                    ) : null}
                    <div className="lesson-stage-actions">
                      {!activeTask || ["planned", "in_progress"].includes(activeTask.status) ? (
                        <Button type="primary" loading={acting} onClick={startOrContinue} data-testid="start-lesson-preparation">
                          {activeTask ? "继续备课" : "开始备课"}
                        </Button>
                      ) : null}
                      {activeTask && ["completed", "cancelled"].includes(activeTask.status) ? (
                        <Button type="primary" loading={acting} onClick={createNewPreparation} data-testid="start-lesson-preparation">
                          开始新一轮备课
                        </Button>
                      ) : null}
                      {activeTask ? (
                        <Button
                          onClick={() => props.navigatePreparation(activeTask.taskRef, "/teaching-plan")}
                          {...(activeTask.status === "ready_for_use"
                            ? { "data-testid": "finish-ready-preparation" }
                            : {})}
                        >
                          查看方案与历史
                        </Button>
                      ) : null}
                      {activeTask && ["planned", "in_progress"].includes(activeTask.status) ? (
                        <Button danger loading={acting} onClick={confirmCancelPreparation}>取消备课</Button>
                      ) : null}
                      {activeTask && ["ready_for_use", "completed", "cancelled"].includes(activeTask.status) ? (
                        <Button loading={acting} onClick={reopen} data-testid="reopen-lesson-preparation">重新调整</Button>
                      ) : null}
                    </div>
                  </section>

                  <section className="lesson-stage-card" id="lesson-stage-deliver">
                    <header className="lesson-stage-card__header">
                      <div className="lesson-stage-title">
                        <span className={deliveryComplete ? "stage-check is-complete" : "stage-check"}>
                          {deliveryComplete ? <WorkspaceIcon name="check" /> : "2"}
                        </span>
                        <div><Text className="section-kicker">课堂中</Text><Title level={3}>上课阶段</Title></div>
                      </div>
                    </header>
                    <Paragraph type="secondary">课堂中不要求填写表单。直接使用已确认方案和材料，下课后用 30 秒反馈记录差异。</Paragraph>
                    <div className="lesson-stage-summary">
                      <span><strong>教学方案</strong>{planState?.currentApproved ? `第 ${planState.currentApproved.revisionNumber} 版已批准` : "尚未批准"}</span>
                      <span><strong>可用材料</strong>{materialBundle ? `${materialBundle.items.filter((item) => item.status === "adopted").length}/5 项已确认` : "尚未准备"}</span>
                    </div>
                  </section>

                  <section className="lesson-stage-card" id="classroom-implementation">
                    <header className="lesson-stage-card__header">
                      <div className="lesson-stage-title">
                        <span className={afterClassComplete ? "stage-check is-complete" : "stage-check"}>
                          {afterClassComplete ? <WorkspaceIcon name="check" /> : "3"}
                        </span>
                        <div><Text className="section-kicker">下课后</Text><Title level={3}>课下阶段</Title></div>
                      </div>
                    </header>
                    <div className="lesson-linked-work" data-testid="lesson-related-assignments">
                      <div>
                        <strong>作业与学习情况</strong>
                        <span>{lessonAssignments.length > 0 ? `${lessonAssignments.length} 份关联作业` : "本课暂无作业"}</span>
                      </div>
                      <Button onClick={props.onOpenAssignments} data-testid="open-lesson-assignments">
                        {lessonAssignments.length > 0 ? "查看作业" : "创建作业"}
                      </Button>
                    </div>
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
                  </section>
                </>
              ) : (
                selectedUnit ? (
                  <section className="unit-overview-direct">
                    <Text className="section-kicker">第 {selectedUnit.sequence} 单元</Text>
                    <Title level={2}>{selectedUnit.title}</Title>
                    <Paragraph type="secondary">{selectedUnit.description}</Paragraph>
                    <div className="unit-overview-objectives">
                      <Title level={3}>单元教学目标</Title>
                      {selectedUnitObjectives.length > 0 ? selectedUnitObjectives.map((objective) => (
                        <article key={objective.objectiveRef}>
                          <WorkspaceIcon name="check" />
                          <span><strong>{objective.title}</strong><small>{objective.description}</small></span>
                        </article>
                      )) : <Paragraph type="secondary">当前单元尚未配置教学目标。</Paragraph>}
                    </div>
                    <Text type="secondary">从左侧直接选择课时，进入备课、上课和课下三个阶段。</Text>
                  </section>
                ) : (
                  <div className="lesson-empty-state">
                    <WorkspaceIcon name="course" />
                    <Title level={3}>选择一个单元</Title>
                    <Paragraph type="secondary">先查看单元目标，再进入具体课时。</Paragraph>
                  </div>
                )
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
              让 Agent 调整
            </Button>,
            <Button key="library" onClick={() => props.navigateFiles({ assetRef: previewFile.assetRef, lessonRef: selectedLesson.lessonRef })}>打开文件位置</Button>,
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
                  <div className="lesson-file-adjustment">
                    <strong>需要修改？直接告诉 Agent</strong>
                    <Input.TextArea
                      rows={3}
                      maxLength={500}
                      value={materialAdjustment}
                      onChange={(event) => setMaterialAdjustment(event.target.value)}
                      placeholder="例如：第二题简单一点，或者减少板书内容并增加课堂互动。"
                    />
                    <small>只生成这一项的新版本，其他材料和历史版本保持不变。</small>
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
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
