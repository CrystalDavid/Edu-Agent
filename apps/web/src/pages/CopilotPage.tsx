import { useEffect, useMemo, useState } from "react";

import type {
  PedagogicalStrategy,
  ConversationThreadView,
  LessonPreparationTaskDetail,
  ModelExecutionStatus,
  ModelExecutionView,
  ProposalReviewDetail,
  CreateTeacherCopilotTaskRequest,
  SuggestionDispositionKind,
  SuggestionDispositionResult,
  TeacherWorkspace,
  TeachingPlan
} from "@edu-agent/contracts";
import {
  Alert,
  Button,
  Card,
  Divider,
  Drawer,
  Input,
  Modal,
  Result,
  Space,
  Spin,
  Tag,
  Typography
} from "antd";

import {
  ApiError,
  cancelModelInvocation,
  appendTeacherConversationTurn,
  createTeacherConversation,
  createModelInvocation,
  createTeacherCopilotTask,
  disposeSuggestion,
  loadLessonPreparationTask,
  loadModelInvocation,
  loadTeacherConversation,
  loadPendingProposals,
  loadProposalDetail,
  retryModelInvocation,
  updateTaskResourceSelection,
  type RecoverableCopilotTask
} from "../api";
import {
  planFieldLabels,
  TeachingPlanDiffView
} from "../components/TeachingPlanView";
import { MemoryUseDisclosure } from "../components/memory/MemoryUseDisclosure";
import {
  cleanDisplayText,
  lessonPreparationStatusLabel
} from "../presentation";
import type { AppRoute } from "../route";
import { applyDiffToPlan } from "../teaching-plan";

const { Paragraph, Text, Title } = Typography;
const { TextArea } = Input;

export function CopilotPage(props: {
  workspace: TeacherWorkspace;
  task: RecoverableCopilotTask | null;
  setTask: (task: RecoverableCopilotTask | null) => void;
  refreshWorkspace: () => Promise<void>;
  navigate: (route: AppRoute) => void;
  proposalRevisionRef: string | null;
  navigateProposal: (proposalRevisionRef: string) => void;
  preparationTaskRef: string | null;
  navigatePreparation: (
    taskRef: string,
    destination?: "/agent" | "/copilot" | "/teaching-plan" | "/runs"
  ) => void;
  initialPrompt?: string;
}) {
  const [generating, setGenerating] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [disposing, setDisposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStrategyId, setSelectedStrategyId] = useState<
    string | null
  >(props.task?.strategies[0]?.strategyId ?? null);
  const [editOpen, setEditOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [teacherEdits, setTeacherEdits] = useState<
    Partial<TeachingPlan>
  >({});
  const [disposition, setDisposition] =
    useState<SuggestionDispositionResult | null>(null);
  const [pendingProposals, setPendingProposals] = useState(
    props.workspace.pendingSuggestions.filter(
      (proposal) => proposal.status === "pending"
    )
  );
  const [taskPrompt, setTaskPrompt] = useState(
    props.initialPrompt ||
      "根据当前学习证据，比较两种明日课堂调整策略"
  );
  const [preparationTask, setPreparationTask] =
    useState<LessonPreparationTaskDetail | null>(null);
  const [modelExecution, setModelExecution] =
    useState<ModelExecutionView | null>(null);
  const [modelExecutionRef, setModelExecutionRef] =
    useState<string | null>(() =>
      new URLSearchParams(window.location.search).get(
        "modelExecution"
      )
    );
  const [modelAction, setModelAction] = useState(false);
  const [conversationRef, setConversationRef] = useState<string | null>(
    () =>
      new URLSearchParams(window.location.search).get(
        "conversation"
      )
  );
  const [conversation, setConversation] =
    useState<ConversationThreadView | null>(null);

  function applyProposalDetail(detail: ProposalReviewDetail) {
    props.setTask(detail);
    setTaskPrompt(detail.request.requestText);
    setSelectedStrategyId(
      detail.disposition?.selectedStrategyId ??
        detail.strategies[0]?.strategyId ??
        null
    );
    setTeacherEdits(
      (detail.disposition?.teacherEdits ?? {}) as Partial<TeachingPlan>
    );
    setDisposition(
      detail.disposition
        ? {
            replayed: true,
            dispositionRef: detail.disposition.dispositionRef,
            disposition: detail.disposition.disposition,
            implementationObserved: false,
            instructionalDecisionCreated: false,
            resultingRevision: detail.inReviewRevision
          }
        : null
    );
  }

  useEffect(() => {
    if (!conversationRef) return;
    let active = true;
    void loadTeacherConversation(conversationRef)
      .then((result) => {
        if (active) setConversation(result);
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, [conversationRef]);

  useEffect(() => {
    if (!modelExecutionRef) return;
    let active = true;
    let timer: number | undefined;
    const refresh = async () => {
      try {
        const execution =
          await loadModelInvocation(modelExecutionRef);
        if (!active) return;
        setModelExecution(execution);
        if (
          execution.status === "succeeded" &&
          execution.proposalRevisionRef
        ) {
          const proposal = await loadProposalDetail(
            execution.proposalRevisionRef
          );
          if (!active) return;
          props.setTask(proposal);
          setSelectedStrategyId(
            proposal.strategies[0]?.strategyId ?? null
          );
          setTeacherEdits({});
          await props.refreshWorkspace();
          if (preparationTask) {
            setPreparationTask(
              await loadLessonPreparationTask(
                preparationTask.taskRef
              )
            );
          }
          if (execution.conversationRef) {
            const recoveredConversation =
              await loadTeacherConversation(
                execution.conversationRef
              );
            if (!active) return;
            setConversation(recoveredConversation);
            setConversationRef(
              recoveredConversation.conversationRef
            );
            setTaskPrompt("");
          }
          props.navigateProposal(
            execution.proposalRevisionRef
          );
          replaceConversationSearch(
            execution.conversationRef,
            null
          );
          return;
        }
        if (!terminalModelStatuses.has(execution.status)) {
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
  }, [modelExecutionRef]);

  useEffect(() => {
    if (!props.preparationTaskRef) return;
    let active = true;
    setRecovering(true);
    setError(null);
    setPreparationTask(null);
    props.setTask(null);
    setSelectedStrategyId(null);
    setDisposition(null);
    if (!new URLSearchParams(window.location.search).has("modelExecution")) {
      setModelExecution(null);
      setModelExecutionRef(null);
    }
    const urlConversationRef = new URLSearchParams(
      window.location.search
    ).get("conversation");
    if (!urlConversationRef) {
      setConversation(null);
      setConversationRef(null);
    }
    void loadLessonPreparationTask(props.preparationTaskRef)
      .then((result) => {
        if (!active) return;
        setPreparationTask(result);
        if (
          result.latestProposalRevisionRef &&
          !props.proposalRevisionRef
        ) {
          const currentSearch = new URLSearchParams(
            window.location.search
          );
          props.navigateProposal(
            result.latestProposalRevisionRef
          );
          replaceConversationSearch(
            currentSearch.get("conversation"),
            currentSearch.get("modelExecution")
          );
        }
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught));
      })
      .finally(() => {
        if (active) setRecovering(false);
      });
    return () => {
      active = false;
    };
  }, [
    props.preparationTaskRef,
    props.proposalRevisionRef
  ]);

  useEffect(() => {
    if (props.initialPrompt) {
      setTaskPrompt(props.initialPrompt);
      return;
    }
    const prefill = window.sessionStorage.getItem("copilot-prefill");
    if (prefill) {
      setTaskPrompt(prefill);
      window.sessionStorage.removeItem("copilot-prefill");
    }
  }, [props.initialPrompt]);

  useEffect(() => {
    let active = true;
    void loadPendingProposals()
      .then((result) => {
        if (active) setPendingProposals(result.items);
      })
      .catch((caught: unknown) => {
        if (active) setError(errorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, [props.workspace.pendingSuggestions]);

  useEffect(() => {
    if (!props.proposalRevisionRef) return;
    let active = true;
    setRecovering(true);
    setError(null);
    props.setTask(null);
    setSelectedStrategyId(null);
    setDisposition(null);
    setModelExecution(null);
    setModelExecutionRef(null);
    void loadProposalDetail(props.proposalRevisionRef)
      .then(async (detail) => {
        if (!active) return;
        applyProposalDetail(detail);
        if (detail.request.preparationTaskRef) {
          const loadedTask = await loadLessonPreparationTask(
            detail.request.preparationTaskRef
          );
          if (active) setPreparationTask(loadedTask);
        }
      })
      .catch((caught: unknown) => {
        if (active) setError(errorMessage(caught));
      })
      .finally(() => {
        if (active) setRecovering(false);
      });
    return () => {
      active = false;
    };
  }, [props.proposalRevisionRef, props.setTask]);

  useEffect(() => {
    if (
      props.task &&
      !props.task.strategies.some(
        (strategy) => strategy.strategyId === selectedStrategyId
      )
    ) {
      setSelectedStrategyId(
        props.task.strategies[0]?.strategyId ?? null
      );
    }
  }, [props.task, selectedStrategyId]);

  const selectedStrategy = props.task?.strategies.find(
    (strategy) => strategy.strategyId === selectedStrategyId
  );
  const selectedDiff =
    selectedStrategyId && props.task
      ? props.task.diffsByStrategy[selectedStrategyId]
      : undefined;
  const baselineRevision =
    props.task && "baselineRevision" in props.task
      ? props.task.baselineRevision
      : props.workspace.currentTeachingPlan;
  const selectedPlan = useMemo(() => {
    if (!selectedDiff) return null;
    return applyDiffToPlan(
      baselineRevision.content,
      selectedDiff
    );
  }, [baselineRevision.content, selectedDiff]);
  const proposalDisposed =
    props.task !== null &&
    "status" in props.task &&
    props.task.status === "disposed";
  const proposalMemoryContext =
    props.task && "memoryContext" in props.task
      ? props.task.memoryContext
      : undefined;
  const modelExecutionActive = Boolean(
    modelExecution && !terminalModelStatuses.has(modelExecution.status)
  );
  const preparationRequiresReopen = Boolean(
    preparationTask &&
      ["ready_for_use", "cancelled"].includes(
        preparationTask.status
      )
  );
  const completedTaskReviewOnly =
    preparationTask?.status === "completed";
  const generationDisabled =
    !taskPrompt.trim() ||
    generating ||
    recovering ||
    disposing ||
    modelAction ||
    modelExecutionActive ||
    preparationRequiresReopen;
  const generationDisabledReason = preparationRequiresReopen
    ? `当前备课任务为“${lessonPreparationStatusLabel(preparationTask!.status)}”；请先回到教学页显式重新打开或新建一轮备课。`
    : modelExecutionActive
      ? "已有任务正在处理，请稍候。"
      : recovering
        ? "正在恢复备课任务与候选方案，请稍候。"
        : null;

  async function generate() {
    if (generationDisabled) return;
    setGenerating(true);
    setError(null);
    setDisposition(null);
    try {
      let turnContext:
        | {
            conversationRef: string;
            turnRef: string;
            parentTurnRef: string | null;
            conversationVersion: number;
          }
        | null = null;
      if (preparationTask) {
        let activeConversation =
          conversation?.taskRef === preparationTask.taskRef
            ? conversation
            : null;
        if (!activeConversation && conversationRef) {
          const recovered = await loadTeacherConversation(
            conversationRef
          );
          if (recovered.taskRef === preparationTask.taskRef) {
            activeConversation = recovered;
          }
        }
        if (!activeConversation) {
          activeConversation = (
            await createTeacherConversation({
              taskRef: preparationTask.taskRef,
              purposeFamily: "lesson_preparation",
              courseRunRef:
                preparationTask.workingSet.courseRunRef,
              lessonRef: preparationTask.lessonRef,
              purpose: "teacher-copilot.conversation.create",
              idempotencyKey:
                `ui:conversation:create:${crypto.randomUUID()}`
            })
          ).conversation;
        }
        const appended = await appendTeacherConversationTurn(
          activeConversation.conversationRef,
          {
            teacherText: taskPrompt,
            parentTurnRef: activeConversation.lastTurnRef,
            expectedConversationVersion:
              activeConversation.version,
            purpose: "teacher-copilot.conversation.append-turn",
            idempotencyKey:
              `ui:conversation:turn:${crypto.randomUUID()}`
          }
        );
        activeConversation = appended.conversation;
        setConversation(activeConversation);
        setConversationRef(activeConversation.conversationRef);
        turnContext = {
          conversationRef: activeConversation.conversationRef,
          turnRef: appended.turn.turnRef,
          parentTurnRef: appended.turn.parentTurnRef,
          conversationVersion: activeConversation.version
        };
      }
      const command: CreateTeacherCopilotTaskRequest = {
        requestText: taskPrompt,
        courseRunRef:
          preparationTask?.workingSet.courseRunRef ??
          props.workspace.courseRun.courseRunRef,
        goalRef: props.workspace.goal.goalRef,
        learningObjectiveRefs:
          preparationTask?.workingSet
            .learningObjectiveRefs ?? [
            props.workspace.learningObjective.objectiveRef
          ],
        selectedEvidenceRefs:
          preparationTask?.workingSet.evidenceRefs ?? [
            ...props.workspace.evidence.observations.map(
              (item) => item.observationRef
            ),
            ...props.workspace.evidence.claims.map(
              (item) => item.claimRef
            )
          ],
        requestVersion: turnContext ? 2 : 1,
        purpose: "teacher-copilot.adjust-next-lesson",
        idempotencyKey: `ui:teacher-copilot:${crypto.randomUUID()}`,
        ...(preparationTask
          ? {
              preparationTaskRef: preparationTask.taskRef,
              curriculumUnitRef:
                preparationTask.curriculumUnitRef,
              lessonRef: preparationTask.lessonRef,
              workingSetVersion:
                preparationTask.workingSet.version,
              expectedPreparationTaskVersion:
                preparationTask.version
            }
          : {}),
        ...(turnContext ?? {})
      };
      if (preparationTask) {
        const queued = await createModelInvocation(command);
        setModelExecution(queued.execution);
        setModelExecutionRef(
          queued.execution.modelExecutionRef
        );
        replaceConversationSearch(
          queued.execution.conversationRef,
          queued.execution.modelExecutionRef
        );
        return;
      }
      const result = await createTeacherCopilotTask(command);
      props.setTask(result);
      setSelectedStrategyId(
        result.strategies[0]?.strategyId ?? null
      );
      setTeacherEdits({});
      await props.refreshWorkspace();
      props.navigateProposal(result.proposalRevisionRef);
    } catch (caught) {
      if (
        caught instanceof ApiError &&
        caught.status === 409 &&
        preparationTask
      ) {
        try {
          setPreparationTask(
            await loadLessonPreparationTask(preparationTask.taskRef)
          );
        } catch {
          // Preserve the original structured conflict below.
        }
        setError(`${errorMessage(caught)}；页面已重新读取服务端任务版本。`);
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      setGenerating(false);
    }
  }

  async function cancelExecution() {
    if (
      !modelExecution ||
      !["queued", "running", "retryable_failed"].includes(
        modelExecution.status
      )
    ) {
      return;
    }
    setModelAction(true);
    setError(null);
    try {
      setModelExecution(
        await cancelModelInvocation(
          modelExecution.modelExecutionRef,
          {
            purpose: "teacher-copilot.cancel-model",
            idempotencyKey: `ui:model-cancel:${crypto.randomUUID()}`,
            expectedStatus: modelExecution.status
          }
        )
      );
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        try {
          setModelExecution(
            await loadModelInvocation(modelExecution.modelExecutionRef)
          );
        } catch {
          // Preserve the original structured conflict below.
        }
        setError(`${errorMessage(caught)}；页面已重新读取模型执行状态。`);
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      setModelAction(false);
    }
  }

  async function retryExecution() {
    if (
      !modelExecution ||
      !isRetryableTerminalStatus(modelExecution.status)
    ) {
      return;
    }
    setModelAction(true);
    setError(null);
    try {
      const result = await retryModelInvocation(
        modelExecution.modelExecutionRef,
        {
          purpose: "teacher-copilot.retry-model",
          idempotencyKey: `ui:model-retry:${crypto.randomUUID()}`,
          expectedStatus: modelExecution.status
        }
      );
      setModelExecution(result.execution);
      setModelExecutionRef(
        result.execution.modelExecutionRef
      );
      replaceConversationSearch(
        result.execution.conversationRef ?? conversationRef,
        result.execution.modelExecutionRef
      );
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        try {
          setModelExecution(
            await loadModelInvocation(modelExecution.modelExecutionRef)
          );
        } catch {
          // Preserve the original structured conflict below.
        }
        setError(`${errorMessage(caught)}；页面已重新读取模型执行状态。`);
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      setModelAction(false);
    }
  }

  async function submitDisposition(
    kind: SuggestionDispositionKind
  ) {
    if (!props.task || !selectedStrategyId || proposalDisposed) return;
    setDisposing(true);
    setError(null);
    try {
      const result = await disposeSuggestion(
        props.task.proposalRevisionRef,
        {
          purpose: "teacher-copilot.review-suggestion",
          idempotencyKey:
            `ui:suggestion-disposition:${crypto.randomUUID()}`,
          disposition: kind,
          selectedStrategyId,
          expectedProposalRevisionNumber:
            "proposalRevisionNumber" in props.task
              ? props.task.proposalRevisionNumber
              : 1,
          teacherEdits:
            kind === "accepted_with_changes" ? teacherEdits : {},
          note:
            kind === "deferred"
              ? "教师选择稍后再处理，不产生教学承诺。"
              : undefined
        }
      );
      setDisposition(result);
      await props.refreshWorkspace();
      const [detail, pending] = await Promise.all([
        loadProposalDetail(props.task.proposalRevisionRef),
        loadPendingProposals()
      ]);
      applyProposalDetail(detail);
      setPendingProposals(pending.items);
    } catch (caught) {
      if (
        caught instanceof ApiError &&
        caught.status === 409 &&
        props.task
      ) {
        try {
          const [detail, pending] = await Promise.all([
            loadProposalDetail(props.task.proposalRevisionRef),
            loadPendingProposals()
          ]);
          applyProposalDetail(detail);
          setPendingProposals(pending.items);
        } catch {
          // Keep the original structured conflict below.
        }
        setError(`${errorMessage(caught)}；页面已重新读取服务端处置。`);
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      setDisposing(false);
    }
  }

  async function removeEvidence(reference: string) {
    if (
      !preparationTask ||
      preparationTask.workingSet.evidenceRefs.length <= 1
    ) {
      return;
    }
    setRecovering(true);
    setError(null);
    try {
      const result = await updateTaskResourceSelection(
        preparationTask.taskRef,
        "remove",
        {
          resourceKind: "evidence",
          resourceRef: reference,
          expectedWorkingSetVersion:
            preparationTask.workingSet.version,
          purpose: "lesson-preparation.context.remove",
          idempotencyKey: `ui:working-set:remove:${crypto.randomUUID()}`
        }
      );
      setPreparationTask({
        ...preparationTask,
        workingSet: result.workingSet
      });
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        try {
          setPreparationTask(
            await loadLessonPreparationTask(preparationTask.taskRef)
          );
        } catch {
          // Preserve the original structured conflict below.
        }
        setError(`${errorMessage(caught)}；页面已重新读取本次备课范围。`);
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      setRecovering(false);
    }
  }

  const contextPanel = (
    <CopilotContextPanel
      workspace={props.workspace}
      task={props.task}
      preparationTask={preparationTask}
    />
  );

  return (
    <div className="page-stack copilot-page">
      <header className="page-header page-header--compact">
        <div>
          <div>
            <Title>{preparationTask ? `继续准备「${preparationTask.lessonTitle}」` : "准备教学任务"}</Title>
          </div>
        </div>
        <Button
          type="text"
          className="context-drawer-trigger"
          onClick={() => setContextOpen(true)}
        >
          教学依据
        </Button>
      </header>
      {error ? (
        <Alert
          type="error"
          showIcon
          title="操作未完成"
          description={error}
          closable
          onClose={() => setError(null)}
        />
      ) : null}

      {preparationTask ? (
        <Card
          className="workspace-card copilot-task-summary"
          variant="borderless"
          data-testid="task-working-set"
        >
          <div className="section-heading">
            <div>
              <Title level={3}>{preparationTask.title}</Title>
            </div>
            <Tag color={preparationTask.status === "completed" ? "success" : "warning"}>
              {lessonPreparationStatusLabel(preparationTask.status)}
            </Tag>
          </div>
          <details className="copilot-evidence-disclosure">
            <summary>{preparationTask.workingSet.evidenceRefs.length} 条学习证据</summary>
            <Space wrap>
              {preparationTask.workingSet.evidenceRefs.map((reference) => (
                <Tag
                  key={reference}
                  closable={preparationTask.workingSet.evidenceRefs.length > 1}
                  onClose={(event) => {
                    event.preventDefault();
                    void removeEvidence(reference);
                  }}
                >
                  {shortEvidenceLabel(reference)}
                </Tag>
              ))}
            </Space>
          </details>
        </Card>
      ) : (
        <Alert
          type="warning"
          showIcon
          title="尚未关联备课课时"
          description="请先从教学页面选择课时并创建备课任务。"
        />
      )}

      {conversation && conversation.turns.length > 0 ? (
        <Card
          className="workspace-card"
          variant="borderless"
          data-testid="copilot-conversation"
        >
          <div className="section-heading">
            <div>
              <Title level={3}>本次备课对话</Title>
              <Text type="secondary">
                刷新页面后仍会保留；这里只显示教师原话和安全结果摘要。
              </Text>
            </div>
            <Tag color="blue">
              {conversation.turns.length} 轮记录
            </Tag>
          </div>
          <Space orientation="vertical" size="small">
            {conversation.turns.slice(-8).map((turn) => (
              <div key={turn.turnRef} data-testid="conversation-turn">
                <Text strong>
                  {turn.actorKind === "teacher" ? "你" : "Agent"}
                </Text>
                <Paragraph>
                  {turn.teacherText ?? turn.surfaceSummary}
                </Paragraph>
              </div>
            ))}
          </Space>
        </Card>
      ) : null}

      <Card className="task-composer ai-task-composer" variant="borderless">
        <div>
          <Text strong>告诉 Agent 你想完成什么</Text>
        </div>
        <Input.TextArea
          className="ai-task-input"
          autoSize={{ minRows: 1, maxRows: 5 }}
          value={taskPrompt}
          onChange={(event) => setTaskPrompt(event.target.value)}
          aria-label="告诉 Agent 你想完成什么"
        />
        <Button
          type="primary"
          loading={generating}
          disabled={generationDisabled}
          title={generationDisabledReason ?? undefined}
          onClick={generate}
          data-testid="generate-copilot"
        >
          生成建议
        </Button>
      </Card>

      {generationDisabledReason ? (
        <Alert
          type="warning"
          showIcon
          title={generationDisabledReason}
          data-testid="generation-disabled-reason"
        />
      ) : null}
      {completedTaskReviewOnly ? (
        <Alert
          type="warning"
          showIcon
          title="当前任务已完成；如需继续调整，请从课程页重新开始"
          data-testid="completed-task-review-only"
        />
      ) : null}

      {modelExecution && modelExecution.status !== "succeeded" ? (
        <section className="copilot-execution-feedback" data-testid="model-execution-status">
          <Tag color={terminalModelStatuses.has(modelExecution.status) ? "error" : "warning"}>
            {terminalModelStatuses.has(modelExecution.status) ? "未完成" : "进行中"}
          </Tag>
          <Space wrap>
            {["queued", "running", "retryable_failed"].includes(modelExecution.status) ? (
              <Button type="text" loading={modelAction} onClick={cancelExecution} data-testid="cancel-model-execution">取消</Button>
            ) : null}
            {isRetryableTerminalStatus(modelExecution.status) ? (
              <Button type="primary" loading={modelAction} onClick={retryExecution} data-testid="retry-model-execution">重试</Button>
            ) : null}
          </Space>
        </section>
      ) : null}

      {pendingProposals.length > 0 ? <Card
        className="workspace-card"
        variant="borderless"
        data-testid="pending-proposals"
      >
        <div className="section-heading">
          <div>
            <Title level={3}>继续审阅</Title>
          </div>
          <Tag>{pendingProposals.length} 条</Tag>
        </div>
        <Space orientation="vertical" size="middle">
            {pendingProposals.map((proposal) => (
              <Card
                key={proposal.proposalRevisionRef}
                size="small"
              >
                <Space orientation="vertical" size="small">
                  <Text strong>{proposal.requestText}</Text>
                  <Text type="secondary">
                    {proposal.strategyTitles.join(" / ")} ·{" "}
                    {new Date(proposal.createdAt).toLocaleString(
                      "zh-CN"
                    )}
                  </Text>
                  <Button
                    onClick={() =>
                      props.navigateProposal(
                        proposal.proposalRevisionRef
                      )
                    }
                    data-testid="continue-proposal-review"
                  >
                    继续审阅
                  </Button>
                </Space>
              </Card>
            ))}
        </Space>
      </Card> : null}

      {recovering ? (
        <Card className="workspace-card loading-card" variant="borderless">
          <Spin />
          <Text>正在恢复建议、教师请求与学习依据…</Text>
        </Card>
      ) : null}

      {generating ? (
        <Card className="workspace-card loading-card" variant="borderless">
          <Spin size="large" />
          <Title level={4}>正在准备建议</Title>
        </Card>
      ) : null}

      {props.task && selectedStrategy ? (
        <div className="copilot-workspace">
          <section className="copilot-main-column">
            <div className="section-heading">
              <div>
                <Text className="section-kicker">课堂策略</Text>
                <Title level={2}>比较教学策略</Title>
              </div>
              <Tag>选择后可继续修改</Tag>
            </div>

            <MemoryUseDisclosure memoryContext={proposalMemoryContext} />

            <div className="strategy-comparison-grid">
              {props.task.strategies.map((strategy, index) => (
                <StrategyCard
                  key={strategy.strategyId}
                  label={index === 0 ? "策略 A" : "策略 B"}
                  strategy={strategy}
                  selected={
                    strategy.strategyId === selectedStrategyId
                  }
                  onSelect={() => {
                    if (disposing) return;
                    setSelectedStrategyId(strategy.strategyId);
                    setTeacherEdits({});
                    setDisposition(null);
                  }}
                />
              ))}
            </div>

            {selectedDiff && selectedPlan ? (
              <TeachingPlanDiffView
                diff={selectedDiff}
                baseline={baselineRevision.content}
                proposed={selectedPlan}
                parentRevisionNumber={
                  Math.max(
                    1,
                    props.task.draftRevision.revisionNumber - 1
                  )
                }
                draftRevisionNumber={
                  props.task.draftRevision.revisionNumber
                }
              />
            ) : null}

            {proposalDisposed ? (
              <Alert
                type="info"
                showIcon
                title="这条建议已完成"
              />
            ) : (
              <Card
                className="workspace-card disposition-card"
                variant="borderless"
              >
                <div>
                  <Title level={3}>确认方案</Title>
                </div>
                <Space wrap>
                  <Button
                    type="primary"
                    loading={disposing}
                    disabled={
                      disposing || recovering || completedTaskReviewOnly
                    }
                    title={
                      completedTaskReviewOnly
                        ? "先显式重新打开任务，才能接受并形成新的待审核版本"
                        : undefined
                    }
                    onClick={() => submitDisposition("accepted")}
                    data-testid="accept-suggestion"
                  >
                    确认方案
                  </Button>
                  <Button
                    onClick={() => setEditOpen(true)}
                    disabled={
                      disposing || recovering || completedTaskReviewOnly
                    }
                    title={
                      completedTaskReviewOnly
                        ? "先显式重新打开任务，才能修改并接受"
                        : undefined
                    }
                    data-testid="edit-suggestion"
                  >
                    修改
                  </Button>
                </Space>
                <details className="copilot-disposition-more">
                  <summary>其他处理</summary>
                  <Space wrap>
                    <Button
                      danger
                      type="text"
                      loading={disposing}
                      disabled={disposing || recovering}
                      onClick={() => submitDisposition("rejected")}
                      data-testid="reject-suggestion"
                    >
                      不采用
                    </Button>
                    <Button
                      type="text"
                      loading={disposing}
                      disabled={disposing || recovering}
                      onClick={() => submitDisposition("deferred")}
                      data-testid="defer-suggestion"
                    >
                      稍后处理
                    </Button>
                  </Space>
                </details>
              </Card>
            )}

            {disposition ? (
              <Result
                status="success"
                title={`已记录：${dispositionLabel(
                  disposition.disposition
                )}`}
                subTitle={
                  disposition.resultingRevision
                    ? "已形成一份待审核教学方案；还没有发布。"
                    : "没有创建新的教学方案，也没有写入已实施的课堂事实。"
                }
                extra={[
                  <Button
                    key="plan"
                    type="primary"
                    onClick={() =>
                      preparationTask
                        ? props.navigatePreparation(
                            preparationTask.taskRef,
                            "/teaching-plan"
                          )
                        : props.navigate("/teaching-plan")
                    }
                  >
                    查看教学方案
                  </Button>
                ]}
              />
            ) : null}
          </section>
        </div>
      ) : null}

      <Drawer
        title="教学依据"
        open={contextOpen}
        onClose={() => setContextOpen(false)}
        size={420}
      >
        {contextPanel}
      </Drawer>

      <Modal
        title="编辑教学计划变更"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        width={820}
        okText="保存教师修改"
        cancelText="取消"
        okButtonProps={{
          disabled:
            disposing || Object.keys(teacherEdits).length === 0,
          "data-testid": "save-teacher-edits"
        }}
        confirmLoading={disposing}
        onOk={() => {
          setEditOpen(false);
          void submitDisposition("accepted_with_changes");
        }}
      >
        {selectedPlan && selectedDiff ? (
          <div className="edit-fields">
            <Alert
              type="info"
              showIcon
              title="所有建议变更字段均可编辑"
              description="每项可单独撤销。未修改项沿用所选策略；保存前请检查下方修改摘要。"
            />
            {selectedDiff.changes.map((change) => {
              const field = change.field;
              const currentValue =
                teacherEdits[field] ?? selectedPlan[field];
              const arrayValue = Array.isArray(
                selectedPlan[field]
              );
              return (
                <label className="edit-field" key={field}>
                  <span className="edit-field__heading">
                    <Text strong>{planFieldLabels[field]}</Text>
                    {field in teacherEdits ? (
                      <Button
                        type="link"
                        size="small"
                        onClick={() =>
                          setTeacherEdits((current) => {
                            const next = { ...current };
                            delete next[field];
                            return next;
                          })
                        }
                        data-testid={`undo-${fieldTestId(field)}`}
                      >
                        撤销此项
                      </Button>
                    ) : null}
                  </span>
                  <TextArea
                    rows={arrayValue ? 4 : 3}
                    value={
                      Array.isArray(currentValue)
                        ? currentValue.join("\n")
                        : currentValue
                    }
                    onChange={(event) => {
                      const nextValue = arrayValue
                        ? event.target.value
                            .split(/\r?\n/)
                            .map((item) => item.trim())
                            .filter(Boolean)
                        : event.target.value;
                      setTeacherEdits(
                        (current) =>
                          ({
                            ...current,
                            [field]: nextValue
                          }) as Partial<TeachingPlan>
                      );
                    }}
                    data-testid={`edit-${fieldTestId(field)}`}
                  />
                  <small>{change.reason}</small>
                </label>
              );
            })}
            <Divider />
            <div className="edit-summary" data-testid="edit-summary">
              <Text strong>保存前修改摘要</Text>
              {Object.keys(teacherEdits).length ? (
                <ul>
                  {(
                    Object.keys(
                      teacherEdits
                    ) as Array<keyof TeachingPlan>
                  ).map((field) => (
                    <li key={field}>{planFieldLabels[field]}</li>
                  ))}
                </ul>
              ) : (
                <Text type="secondary">尚未修改任何字段</Text>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function StrategyCard(props: {
  label: string;
  strategy: PedagogicalStrategy;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <article
      className={`strategy-card ${
        props.selected ? "strategy-card--selected" : ""
      }`}
      role="button"
      tabIndex={0}
      aria-pressed={props.selected}
      onClick={props.onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.onSelect();
        }
      }}
      data-testid={props.selected ? "strategy-detail" : undefined}
    >
      <div className="strategy-card__header">
        <span>{props.label}</span>
        <Tag>{props.selected ? "当前选择" : "选择此策略"}</Tag>
      </div>
      <Title level={3}>
        {cleanDisplayText(props.strategy.title)}
      </Title>
      <Paragraph>
        {cleanDisplayText(props.strategy.rationale)}
      </Paragraph>
      <StrategySection title="使用证据">
        <div className="strategy-evidence">
          {Array.from(
            new Set(
              props.strategy.evidenceRefs.map(shortEvidenceLabel)
            )
          ).map((label) => (
            <Tag key={label}>{label}</Tag>
          ))}
        </div>
      </StrategySection>
      <StrategySection title="证据缺口">
        <ul>
          {props.strategy.knownGaps.map((gap) => (
            <li key={gap}>{cleanDisplayText(gap)}</li>
          ))}
        </ul>
      </StrategySection>
      <StrategySection title="适用条件">
        <p>{cleanDisplayText(props.strategy.applicability)}</p>
      </StrategySection>
      <StrategySection title="不适用条件">
        <ul>
          {props.strategy.unsuitableConditions.map((condition) => (
            <li key={condition}>
              {cleanDisplayText(condition)}
            </li>
          ))}
        </ul>
      </StrategySection>
      <StrategySection title="建议课堂动作">
        <ol>
          {props.strategy.suggestedMoves.map((move) => (
            <li key={move}>{cleanDisplayText(move)}</li>
          ))}
        </ol>
      </StrategySection>
      <StrategySection title="后续需要采集的证据">
        <ul>
          {props.strategy.followUpEvidence.map((evidence) => (
            <li key={evidence}>{cleanDisplayText(evidence)}</li>
          ))}
        </ul>
      </StrategySection>
      <Alert
        type="warning"
        title="把握说明（不是概率）"
        description={cleanDisplayText(
          props.strategy.confidenceExplanation
        )}
      />
    </article>
  );
}

function StrategySection(props: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="strategy-section">
      <Text strong>{props.title}</Text>
      {props.children}
    </section>
  );
}

function CopilotContextPanel(props: {
  workspace: TeacherWorkspace;
  task: RecoverableCopilotTask | null;
  preparationTask: LessonPreparationTaskDetail | null;
}) {
  return (
    <Card className="workspace-card context-panel" variant="borderless">
      <Title level={3}>教学依据</Title>
      <dl>
        <div>
          <dt>当前课时</dt>
          <dd>
            {props.preparationTask
              ? props.preparationTask.lessonTitle
              : "未绑定"}
          </dd>
        </div>
        <div>
          <dt>学习证据</dt>
          <dd>
            {props.workspace.evidence.observations.length} 条课堂观察 · {props.workspace.evidence.claims.length} 条学习情况
          </dd>
        </div>
        <div>
          <dt>教师请求</dt>
          <dd>
            {props.task?.request.requestText ??
              "尚未提交"}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

function fieldTestId(field: keyof TeachingPlan): string {
  return field.replace(
    /[A-Z]/g,
    (character) => `-${character.toLowerCase()}`
  );
}

function shortEvidenceLabel(reference: string): string {
  if (reference.includes("observation")) {
    return "直接观察";
  }
  if (reference.includes("claim")) {
    return "待复核解释";
  }
  return "其他依据";
}

function replaceConversationSearch(
  conversationRef: string | null,
  modelExecutionRef: string | null
): void {
  const search = new URLSearchParams(window.location.search);
  if (conversationRef) {
    search.set("conversation", conversationRef);
  } else {
    search.delete("conversation");
  }
  if (modelExecutionRef) {
    search.set("modelExecution", modelExecutionRef);
  } else {
    search.delete("modelExecution");
  }
  const query = search.toString();
  window.history.replaceState(
    {},
    "",
    `${window.location.pathname}${query ? `?${query}` : ""}`
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.message}（${error.code}）`;
  }
  return error instanceof Error ? error.message : "发生未知错误";
}

function dispositionLabel(
  disposition: SuggestionDispositionKind
): string {
  return {
    accepted: "已接受",
    accepted_with_changes: "修改后接受",
    rejected: "已拒绝",
    deferred: "已延后"
  }[disposition];
}

const terminalModelStatuses =
  new Set<ModelExecutionStatus>([
    "succeeded",
    "timed_out",
    "permanently_failed",
    "validation_failed",
    "budget_exceeded",
    "cancelled"
  ]);

type RetryableTerminalStatus =
  | "timed_out"
  | "permanently_failed"
  | "validation_failed"
  | "budget_exceeded"
  | "cancelled";

const retryableTerminalStatuses =
  new Set<RetryableTerminalStatus>([
    "timed_out",
    "permanently_failed",
    "validation_failed",
    "budget_exceeded",
    "cancelled"
  ]);

function isRetryableTerminalStatus(
  status: ModelExecutionStatus
): status is RetryableTerminalStatus {
  return retryableTerminalStatuses.has(
    status as RetryableTerminalStatus
  );
}
