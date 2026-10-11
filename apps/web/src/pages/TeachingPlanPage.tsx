import { useEffect, useState } from "react";

import type {
  FileAssetSummary,
  LessonPreparationTaskDetail,
  LessonTeachingPlanState,
  TeacherWorkspace
} from "@edu-agent/contracts";
import {
  Alert,
  Button,
  Card,
  Space,
  Spin,
  Tag,
  Typography
} from "antd";

import {
  ApiError,
  approveTeachingPlan,
  downloadFile,
  exportTeachingPlanDocx,
  loadLessonPreparationTask,
  loadLessonTeachingPlans,
  loadTeachingPlanRevision,
  loadTeachingPlanState,
  loadFiles,
  transitionLessonPreparationTask,
  type RecoverableCopilotTask
} from "../api";
import {
  TeachingPlanDiffView,
  TeachingPlanView
} from "../components/TeachingPlanView";
import { applyDiffToPlan } from "../teaching-plan";
import {
  lessonPreparationStatusLabel,
  teachingPlanStateLabel
} from "../presentation";

const { Paragraph, Text, Title } = Typography;

export function TeachingPlanPage(props: {
  workspace: TeacherWorkspace;
  task: RecoverableCopilotTask | null;
  refreshWorkspace: () => Promise<void>;
  preparationTaskRef: string | null;
  navigatePreparation: (
    taskRef: string,
    destination?: "/agent" | "/copilot" | "/teaching-plan" | "/runs"
  ) => void;
  navigateLesson: (lessonRef: string) => void;
  navigateFiles: (context?: {
    assetRef?: string;
    lessonRef?: string;
  }) => void;
}) {
  const [planState, setPlanState] = useState({
    currentApproved: props.workspace.currentTeachingPlan,
    currentInReview: props.workspace.currentInReviewPlan,
    drafts: [] as Array<
      TeacherWorkspace["currentTeachingPlan"]
    >,
    history: [
      props.workspace.currentTeachingPlan
    ] as Array<TeacherWorkspace["currentTeachingPlan"]>
  });
  const [revision, setRevision] = useState(
    props.workspace.currentTeachingPlan
  );
  const [loadingState, setLoadingState] = useState(false);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [preparationTask, setPreparationTask] =
    useState<LessonPreparationTaskDetail | null>(null);
  const [lessonPlanState, setLessonPlanState] =
    useState<LessonTeachingPlanState | null>(null);
  const [completing, setCompleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportedFiles, setExportedFiles] = useState<FileAssetSummary[]>([]);

  useEffect(() => {
    setRevision(props.workspace.currentTeachingPlan);
  }, [props.workspace.currentTeachingPlan]);

  useEffect(() => {
    let active = true;
    setLoadingState(true);
    setError(null);
    const loading = props.preparationTaskRef
      ? loadLessonPreparationTask(
          props.preparationTaskRef
        ).then(async (task) => ({
          task,
          scoped: await loadLessonTeachingPlans(task.lessonRef)
        }))
      : loadTeachingPlanState().then((state) => ({
          task: null,
          scoped: null,
          state
        }));
    void loading
      .then(async (result) => {
        if (!active) return;
        if (result.task && result.scoped) {
          const currentApproved =
            result.scoped.currentApproved ??
            props.workspace.currentTeachingPlan;
          setPreparationTask(result.task);
          setLessonPlanState(result.scoped);
          setPlanState({
            currentApproved,
            currentInReview: result.scoped.activeInReview,
            drafts: result.scoped.drafts,
            history: result.scoped.history
          });
          setRevision(
            result.scoped.activeInReview ?? currentApproved
          );
          const exported = await loadFiles({
            status: "active",
            sort: "newest",
            targetType: "teaching_plan_revision",
            targetRef: currentApproved.revisionRef
          });
          if (active) setExportedFiles(exported.items);
        } else if ("state" in result) {
          setPreparationTask(null);
          setLessonPlanState(null);
          setPlanState(result.state);
          setRevision(result.state.currentApproved);
        }
      })
      .catch((caught: unknown) => {
        if (active) setError(errorMessage(caught));
      })
      .finally(() => {
        if (active) setLoadingState(false);
      });
    return () => {
      active = false;
    };
  }, [
    props.workspace.currentTeachingPlan,
    props.preparationTaskRef
  ]);

  const selectedStrategyId =
    planState.currentInReview?.selectedStrategyId ??
    planState.currentApproved.selectedStrategyId ??
    props.task?.strategies[0]?.strategyId;
  const selectedDiff =
    props.task && selectedStrategyId
      ? props.task.diffsByStrategy[selectedStrategyId]
      : undefined;
  const diffBaseline =
    props.task && "baselineRevision" in props.task
      ? props.task.baselineRevision.content
      : planState.currentApproved.content;
  const diffProposed = selectedDiff
    ? applyDiffToPlan(diffBaseline, selectedDiff)
    : null;

  async function showPrevious() {
    if (!revision.parentRevisionRef) return;
    setLoadingPrevious(true);
    setError(null);
    try {
      setRevision(
        await loadTeachingPlanRevision(revision.parentRevisionRef)
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "加载前一版本失败"
      );
    } finally {
      setLoadingPrevious(false);
    }
  }

  async function reloadPreparationTruth() {
    if (!preparationTask) return;
    const [nextTask, scoped] = await Promise.all([
      loadLessonPreparationTask(preparationTask.taskRef),
      loadLessonTeachingPlans(preparationTask.lessonRef)
    ]);
    const currentApproved =
      scoped.currentApproved ?? props.workspace.currentTeachingPlan;
    const exported = await loadFiles({
      status: "active",
      sort: "newest",
      targetType: "teaching_plan_revision",
      targetRef: currentApproved.revisionRef
    });
    setPreparationTask(nextTask);
    setLessonPlanState(scoped);
    setPlanState({
      currentApproved,
      currentInReview: scoped.activeInReview,
      drafts: scoped.drafts,
      history: scoped.history
    });
    setRevision(scoped.activeInReview ?? currentApproved);
    setExportedFiles(exported.items);
  }

  async function approveCurrentInReview() {
    const inReview = planState.currentInReview;
    if (!inReview) return;
    setApproving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await approveTeachingPlan(
        inReview.revisionRef,
        {
          purpose: "teacher-copilot.approve-plan",
          idempotencyKey:
            `ui:teaching-plan-approval:${crypto.randomUUID()}`,
          expectedInReviewRevisionRef: inReview.revisionRef,
          ...(preparationTask
            ? {
                preparationTaskRef: preparationTask.taskRef,
                expectedTaskVersion: preparationTask.version
              }
            : {})
        }
      );
      if (preparationTask) {
        await reloadPreparationTruth();
        setRevision(result.approvedRevision);
      } else {
        const nextState = await loadTeachingPlanState();
        setPlanState(nextState);
        setRevision(nextState.currentApproved);
      }
      await props.refreshWorkspace();
      setSuccess(
        `已创建并批准第 ${result.approvedRevision.revisionNumber} 版；原已批准版本保持不可变。`
      );
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        try {
          await reloadPreparationTruth();
        } catch {
          // The original structured conflict remains the most useful message.
        }
        setError(`${errorMessage(caught)}；页面已重新读取服务端当前版本。`);
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      setApproving(false);
    }
  }

  async function completePreparation() {
    if (!preparationTask) return;
    setCompleting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await transitionLessonPreparationTask(
        preparationTask.taskRef,
        "complete",
        {
          expectedVersion: preparationTask.version,
          purpose: "lesson-preparation.complete",
          idempotencyKey: `ui:lesson-preparation:complete:${crypto.randomUUID()}`
        }
      );
      setPreparationTask(result.task);
      await props.refreshWorkspace();
      setSuccess(
        "备课任务已由教师显式标记为完成；当前已批准教案保持不变。"
      );
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        try {
          await reloadPreparationTruth();
        } catch {
          // Preserve the original conflict below.
        }
        setError(`${errorMessage(caught)}；页面已重新读取服务端当前版本。`);
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      setCompleting(false);
    }
  }

  async function exportCurrentApproved() {
    if (!preparationTask) return;
    setExporting(true);
    setError(null);
    setSuccess(null);
    try {
      const approved = planState.currentApproved;
      const result = await exportTeachingPlanDocx(
        approved.revisionRef,
        {
          lessonRef: preparationTask.lessonRef,
          preparationTaskRef: preparationTask.taskRef,
          expectedRevisionNumber: approved.revisionNumber,
          purpose: "teaching-plan.export-docx",
          idempotencyKey: `ui:teaching-plan:docx:${crypto.randomUUID()}`
        }
      );
      const listed = await loadFiles({
        status: "active",
        sort: "newest",
        targetType: "teaching_plan_revision",
        targetRef: approved.revisionRef
      });
      setExportedFiles(listed.items);
      setSuccess(
        result.deduplicated
          ? "当前已批准版本已有相同教案文件，已直接复用。"
          : "已创建正式教案文件，并关联课时、备课任务与教学计划。"
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setExporting(false);
    }
  }

  async function downloadExport(file: FileAssetSummary) {
    try {
      const blob = await downloadFile(file.assetRef);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.currentVersion.originalFileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  const viewingActiveInReview =
    planState.currentInReview?.revisionRef === revision.revisionRef;

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <span className="page-icon page-icon--cyan" aria-hidden="true">▧</span>
          <div>
            <Title>教学计划</Title>
            <Paragraph>
              每次保存都会创建新版本，历史内容保持可追溯；当前不会自动发布。
            </Paragraph>
          </div>
        </div>
        <Space wrap>
          <Tag color="processing">
            {revisionStateLabel(revision.state)}
          </Tag>
        </Space>
      </header>

      <Alert
        type="info"
        showIcon
        title="审核与批准是两个独立动作"
        description="接受建议后只会进入待审核；只有教师单独批准，才会形成新的已批准版本。"
      />

      {error ? (
        <Alert type="error" showIcon title={error} />
      ) : null}
      {success ? (
        <Alert type="success" showIcon title={success} />
      ) : null}

      {preparationTask ? (
        <Card
          className="workspace-card"
          variant="borderless"
          data-testid="teaching-plan-preparation-task"
        >
          <Text className="section-kicker">备课任务 · 第 {preparationTask.version} 版</Text>
          <Title level={3}>{preparationTask.lessonTitle}</Title>
          <Paragraph>
            当前状态：
            <strong>
              {lessonPreparationStatusLabel(preparationTask.status)}
            </strong>
            {" · "}已批准教学计划：
            {preparationTask.approvedPlanRef ? "已关联" : "尚无"}
          </Paragraph>
          <Space wrap>
            <Button
              onClick={() =>
                props.navigatePreparation(
                  preparationTask.taskRef,
                  "/agent"
                )
              }
            >
              返回备课任务
            </Button>
            <Button
              onClick={() =>
                props.navigatePreparation(
                  preparationTask.taskRef,
                  "/runs"
                )
              }
            >
              查看运行记录
            </Button>
            <Button
              onClick={() =>
                props.navigateLesson(preparationTask.lessonRef)
              }
            >
              返回课时
            </Button>
            {preparationTask.status === "ready_for_use" ? (
              <Button
                type="primary"
                loading={completing}
                onClick={completePreparation}
                data-testid="complete-lesson-preparation"
              >
                完成备课
              </Button>
            ) : null}
            {preparationTask.status === "completed" ? (
              <Tag color="success">备课已完成</Tag>
            ) : null}
          </Space>
        </Card>
      ) : null}

      {preparationTask ? (
        <Card
          className="workspace-card"
          variant="borderless"
          data-testid="teaching-plan-file-exports"
        >
          <Text className="section-kicker">教学成果</Text>
          <Title level={3}>已批准教案文件</Title>
          <Paragraph>
            导出只绑定当前明确的已批准版本；历史版本保持不变。
          </Paragraph>
          <Space wrap>
            <Button
              type="primary"
              loading={exporting}
              onClick={exportCurrentApproved}
              data-testid="export-approved-plan-docx"
            >
              导出教案 DOCX
            </Button>
            {exportedFiles.map((file) => (
              <Space key={file.assetRef} wrap>
                <Button
                  onClick={() => void downloadExport(file)}
                  data-testid="download-teaching-plan-docx"
                >
                  下载 {file.currentVersion.originalFileName}（v{file.currentVersion.versionNumber}）
                </Button>
                <Button
                  onClick={() =>
                    props.navigateFiles({
                      assetRef: file.assetRef,
                      lessonRef: preparationTask.lessonRef
                    })
                  }
                >
                  在文件页查看
                </Button>
              </Space>
            ))}
          </Space>
        </Card>
      ) : null}

      <Card className="workspace-card" variant="borderless">
        <Text className="section-kicker">明确读取语义</Text>
        <Title level={3}>当前版本状态</Title>
        <Space orientation="vertical" size="middle">
          <div>
            <Text strong>当前正式教学计划</Text>
            <Paragraph>
              第 {planState.currentApproved.revisionNumber} 版 · 已批准
            </Paragraph>
            <Button
              onClick={() =>
                setRevision(planState.currentApproved)
              }
              data-testid="view-current-approved"
            >
              查看已批准版本
            </Button>
          </div>
          {planState.currentInReview ? (
            <div>
              <Text strong>当前待审核版本</Text>
              <Paragraph>
                第 {planState.currentInReview.revisionNumber} 版 · 待审核（尚未成为当前正式计划）
              </Paragraph>
              <Space wrap>
                <Button
                  onClick={() =>
                    setRevision(planState.currentInReview!)
                  }
                  data-testid="view-current-in-review"
                >
                  查看待审核版本
                </Button>
                <Button
                  type="primary"
                  loading={approving}
                  onClick={approveCurrentInReview}
                  data-testid="approve-teaching-plan"
                >
                  批准为当前教学计划
                </Button>
              </Space>
            </div>
          ) : (
            <Text type="secondary">当前没有待审核版本。</Text>
          )}
        </Space>
      </Card>

      <Spin spinning={loadingPrevious || loadingState}>
        <TeachingPlanView
          revision={revision}
          onPrevious={showPrevious}
        />
      </Spin>

      {revision.revisionRef !==
      planState.currentApproved.revisionRef ? (
        <Card className="workspace-card revision-return" variant="borderless">
          <div>
            <Title level={4}>
              {viewingActiveInReview
                ? "你正在查看当前待审核版本"
                : "你正在查看历史版本"}
            </Title>
            <Paragraph>
              {viewingActiveInReview
                ? "此版本尚未成为当前正式计划；只有单独批准后才会形成新的已批准版本。"
                : "历史版本保持不变；返回当前已批准版本不会修改任何数据。"}
            </Paragraph>
          </div>
          <Button
            type="primary"
            onClick={() =>
              setRevision(planState.currentApproved)
            }
          >
            查看当前已批准版本
          </Button>
        </Card>
      ) : null}

      {selectedDiff && diffProposed ? (
        <TeachingPlanDiffView
          diff={selectedDiff}
          baseline={diffBaseline}
          proposed={diffProposed}
          parentRevisionNumber={
            Math.max(
              1,
              props.task!.draftRevision.revisionNumber - 1
            )
          }
          draftRevisionNumber={
            props.task!.draftRevision.revisionNumber
          }
          teacherSelection={
            planState.currentInReview?.teacherSelection ??
            planState.currentApproved.teacherSelection
          }
        />
      ) : (
        <Card className="workspace-card" variant="borderless">
          <Title level={4}>尚无教师助手变更记录</Title>
          <Paragraph>
            启动课堂调整任务后，这里会显示各字段的修改前后、原因和依据。
          </Paragraph>
        </Card>
      )}

      <Card className="workspace-card" variant="borderless">
        <Title level={3}>草稿与版本历史</Title>
        <Paragraph>
          草稿不会作为当前计划返回；历史包含草稿、待审核、已取代和已批准版本，按版本编号倒序排列。
        </Paragraph>
        <Space orientation="vertical" size="small">
          <Text>
            草稿：{planState.drafts.length} 个
          </Text>
          {lessonPlanState ? (
            <Text>
              已取代的待审核版本：
              {lessonPlanState.superseded.length} 个（保留历史，不删除）
            </Text>
          ) : null}
          {planState.history.map((item) => (
            <Button
              key={item.revisionRef}
              type="link"
              onClick={() => setRevision(item)}
            >
              第 {item.revisionNumber} 版 ·{" "}
              {revisionStateLabel(item.state)}
            </Button>
          ))}
        </Space>
      </Card>
    </div>
  );
}

function revisionStateLabel(state: string): string {
  if (
    [
      "draft",
      "proposal",
      "in_review",
      "superseded",
      "approved",
      "published"
    ].includes(state)
  ) {
    return teachingPlanStateLabel(
      state as Parameters<typeof teachingPlanStateLabel>[0]
    );
  }
  return state;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.message}（${error.code}）`;
  }
  return error instanceof Error ? error.message : "发生未知错误";
}
